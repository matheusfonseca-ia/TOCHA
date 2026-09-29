-- ══════════════════════════════════════════════════════════════════════════
-- Falow: CRM de conversas, Fase 3 (responder pelo painel) e Fase 7
-- (ações por mensagem e notas)
--
-- Bucket público para anexo enviado pelo painel (imagem/PDF do usuário, não
-- da Meta: a mídia recebida do lead continua só com a URL da CDN dela,
-- política decidida na Fase 1). Respostas rápidas ("/" no composer) e notas
-- internas por contato (nunca vão para o Instagram).
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `on conflict`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Bucket de upload do composer ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('crm-uploads', 'crm-uploads', true)
on conflict (id) do nothing;

-- ── Respostas rápidas ────────────────────────────────────────────────────────
create table if not exists public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  text       text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quick_replies_account_idx
  on public.quick_replies (account_id, title);

comment on table public.quick_replies is
  'Atalhos de texto do composer do Inbox ("/" abre a lista). Nunca são enviados sozinhos: só preenchem o campo de texto.';

-- ── Notas internas ───────────────────────────────────────────────────────────
create table if not exists public.crm_notes (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id text not null,
  text         text not null check (length(trim(text)) > 0),
  author_id    uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists crm_notes_contact_idx
  on public.crm_notes (account_id, ig_sender_id, created_at);

comment on table public.crm_notes is
  'Nota interna por contato, sempre lida na ficha e intercalada na conversa por horário. Nunca é enviada ao Instagram.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.quick_replies enable row level security;
alter table public.crm_notes     enable row level security;

drop policy if exists "own quick replies" on public.quick_replies;
create policy "own quick replies" on public.quick_replies
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own crm notes" on public.crm_notes;
create policy "own crm notes" on public.crm_notes
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );
