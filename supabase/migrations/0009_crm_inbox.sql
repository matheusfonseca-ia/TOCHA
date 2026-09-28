-- ══════════════════════════════════════════════════════════════════════════
-- Falow: CRM de conversas (Inbox)
--
-- Até aqui nenhuma mensagem era guardada: `conversations` só controlava a
-- janela de 24h e `interactions` logava o que passou pelas automações. Esta
-- migration cria `messages` (recebidas, enviadas pelo Falow e enviadas pelo
-- app do Instagram) e desnormaliza em `conversations` o que a lista do Inbox
-- precisa (última mensagem, não lidas, visto, atendimento humano).
--
-- Mídia: só a URL da CDN da Meta é guardada, nunca o arquivo (política da
-- Meta). URLs expiram; o painel mostra "mídia indisponível" quando isso
-- acontece.
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Conversas ───────────────────────────────────────────────────────────────
-- Resposta privada a comentário (e o CRM, ao gravar um envio) cria a
-- conversa antes de a pessoa escrever: sem mensagem do lead, a janela de 24h
-- está fechada (nulo). Sem default: quem abre a janela é sempre o webhook de
-- uma mensagem recebida (`touchConversation`), que grava o valor explícito.
alter table public.conversations alter column last_inbound_at drop not null;
alter table public.conversations alter column last_inbound_at drop default;

alter table public.conversations
  add column if not exists contact_id             uuid references public.contacts (id) on delete set null,
  add column if not exists last_message_at        timestamptz,
  add column if not exists last_message_text      text,
  add column if not exists last_message_kind      text,
  add column if not exists last_message_direction text
                                                  check (last_message_direction in ('inbound', 'outbound')),
  add column if not exists unread_count           int not null default 0,
  add column if not exists contact_seen_at        timestamptz,
  add column if not exists human_takeover_at      timestamptz,
  add column if not exists status                 text not null default 'open'
                                                  check (status in ('open', 'done'));

-- Lista do Inbox: conversas da conta, mais recentes primeiro.
create index if not exists conversations_account_last_message_idx
  on public.conversations (account_id, last_message_at desc nulls last);

comment on column public.conversations.contact_seen_at is
  'Horário do último "visto" do lead (webhook messaging_seen). Mensagens enviadas até esse horário aparecem como vistas.';
comment on column public.conversations.human_takeover_at is
  'Preenchido enquanto um atendente assumiu a conversa pelo CRM: regras, workflows novos, retomadas por resposta e atrasos agendados não rodam para esta pessoa.';

-- ── Mensagens ───────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  account_id            uuid not null references public.ig_accounts (id) on delete cascade,
  conversation_id       uuid not null references public.conversations (id) on delete cascade,
  ig_sender_id          text not null,            -- sempre o lead (o outro lado da conversa)
  direction             text not null check (direction in ('inbound', 'outbound')),
  source                text not null
                        check (source in ('contact', 'automation', 'workflow', 'agent',
                                          'instagram_app', 'import')),
  mid                   text,                     -- id da Meta; nulo só em envio que falhou
  kind                  text not null default 'text',
  text                  text,
  attachments           jsonb,                    -- [{type, url}]: só a URL da CDN
  meta                  jsonb,                    -- quick reply, postback, botões enviados, story
  reply_to_mid          text,                     -- citação (do lead ou da conta)
  reaction_emoji        text,                     -- reação do lead (campo `emoji` do webhook)
  sent_by               uuid references auth.users (id) on delete set null,
  status                text not null default 'sent' check (status in ('sent', 'failed')),
  error_detail          text,
  deleted_by_contact_at timestamptz,              -- lead desfez o envio (is_deleted)
  edited_at             timestamptz,              -- lead editou (message_edit)
  edit_count            int not null default 0,   -- num_edit do webhook
  original_text         text,                     -- texto antes da 1ª edição
  hidden_at             timestamptz,              -- "Apagar para mim" (só some do Falow)
  created_at            timestamptz not null      -- horário do evento na Meta
);

-- Eco e envio convergem pelo mid; webhook reentregue não duplica. Constraint
-- (não índice parcial) para o `on_conflict` do PostgREST funcionar; mid nulo
-- (envio que falhou) não conflita, porque nulos são distintos no unique.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_account_mid_key') then
    alter table public.messages add constraint messages_account_mid_key unique (account_id, mid);
  end if;
end;
$$;
-- Conversa aberta: mensagens em ordem.
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

comment on table public.messages is
  'Mensagens do Inbox do CRM. source: contact (lead), automation (regra), workflow, agent (resposta pelo painel), instagram_app (enviada pelo app do Instagram, sem registro de envio no Falow), import (histórico da Conversations API).';

-- ── Sinais que chegam antes da mensagem ─────────────────────────────────────
-- A Meta entrega reação, edição e "apagado" fora de ordem: na Fase 0 a reação
-- e a edição chegaram ANTES da mensagem a que se referem. O sinal espera aqui
-- e é aplicado quando a mensagem for gravada. Só a service role acessa.
create table if not exists public.message_signals_pending (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.ig_accounts (id) on delete cascade,
  mid         text not null,
  type        text not null check (type in ('reaction', 'unreaction', 'edit', 'deleted')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists message_signals_pending_mid_idx
  on public.message_signals_pending (account_id, mid);

alter table public.message_signals_pending enable row level security;

-- ── Desnormalização: última mensagem e não lidas ────────────────────────────
-- Histórico importado ou evento atrasado não "volta" a última mensagem; só
-- mensagem recebida em tempo real conta como não lida.
create or replace function public.crm_on_message_insert()
returns trigger
language plpgsql
as $$
declare
  is_latest boolean;
begin
  select c.last_message_at is null or new.created_at >= c.last_message_at
    into is_latest
    from public.conversations c
   where c.id = new.conversation_id;

  update public.conversations c set
    last_message_at        = case when is_latest then new.created_at else c.last_message_at end,
    last_message_text      = case when is_latest then left(new.text, 280) else c.last_message_text end,
    last_message_kind      = case when is_latest then new.kind else c.last_message_kind end,
    last_message_direction = case when is_latest then new.direction else c.last_message_direction end,
    unread_count           = c.unread_count
                             + case when new.direction = 'inbound' and new.source <> 'import'
                                    then 1 else 0 end
  where c.id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.crm_on_message_insert();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- O webhook e as server actions gravam com a service role depois de conferir
-- o dono; pelo client, o dono só lê.
alter table public.messages enable row level security;

drop policy if exists "own messages select" on public.messages;
create policy "own messages select" on public.messages
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
