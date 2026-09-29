-- ══════════════════════════════════════════════════════════════════════════
-- Falow: textos salvos ("mensagens padrão")
--
-- O que você escreve uma vez e reusa em qualquer campo de texto do painel.
-- O botão 📌 do campo lista os salvos; inserir é CÓPIA (editar o preset
-- depois não mexe em automação nenhuma que já usou o texto).
--
-- `scope` é o tipo de campo em que o texto nasceu (ver src/lib/ai/fields.ts).
-- Ele não esconde o preset dos outros campos, só faz os do mesmo tipo
-- aparecerem primeiro na lista.
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.message_presets (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  scope      text not null,
  label      text not null check (length(trim(label)) > 0),
  text       text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists message_presets_account_idx
  on public.message_presets (account_id, created_at desc);

comment on table public.message_presets is
  'Textos salvos pelo dono da conta, reusáveis em qualquer campo do painel. scope = tipo de campo onde nasceu (AiFieldKind em src/lib/ai/fields.ts).';

alter table public.message_presets enable row level security;

drop policy if exists "own message presets" on public.message_presets;
create policy "own message presets" on public.message_presets
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );
