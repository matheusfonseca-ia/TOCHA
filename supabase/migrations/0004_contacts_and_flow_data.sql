-- ══════════════════════════════════════════════════════════════════════════
-- Falow: contatos e dados coletados pelos workflows
--
-- Os nós "Coletar dado" e "Definir campo ou tag" gravam o que a pessoa
-- respondeu numa ficha por conta (contacts), listada na página Contatos do
-- painel. Cada execução (sequence_runs) também guarda as variáveis do fluxo
-- em `variables`, usadas nas condições e nos textos com {{campo}}.
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Contatos: um por pessoa em cada conta conectada ─────────────────────────
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id text not null,
  ig_username  text,
  fields       jsonb not null default '{}'::jsonb,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (account_id, ig_sender_id)
);

-- Página Contatos: lista por conta, mais recentes primeiro.
create index if not exists contacts_account_updated_idx
  on public.contacts (account_id, updated_at desc);

comment on table public.contacts is
  'Dados coletados pelos workflows (nós Coletar dado / Definir campo ou tag). fields = {fieldKey: valor}; tags = marcadores livres.';

alter table public.contacts enable row level security;

-- O webhook grava com a service role (bypass de RLS); o dono só lê e edita.
drop policy if exists "own contacts select" on public.contacts;
create policy "own contacts select" on public.contacts
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own contacts update" on public.contacts;
create policy "own contacts update" on public.contacts
  for update using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- ── Execuções: variáveis do fluxo ───────────────────────────────────────────
alter table public.sequence_runs
  add column if not exists variables jsonb not null default '{}'::jsonb;

comment on column public.sequence_runs.variables is
  'Valores coletados neste run (fieldKey: valor) e estado interno dos nós de dados em chaves com prefixo "__" (ex.: __attempts por nó Coletar dado).';
