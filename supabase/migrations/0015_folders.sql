-- ══════════════════════════════════════════════════════════════════════════
-- Falow: pastas de organização
--
-- Um nível só (sem pasta dentro de pasta) e COMPARTILHADAS entre Automações
-- e Workflow: a mesma pasta "Lançamento de março" guarda os dois, porque pra
-- quem usa isso é um sistema só.
--
-- `on delete set null` nas duas colunas: apagar a pasta não apaga nada
-- dentro dela, os itens só voltam pra "Sem pasta".
--
-- Só adiciona tabela e colunas anuláveis: seguro com a versão anterior do
-- app no ar, e seguro pra rodar de novo (`if not exists`).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  color      text not null default 'violet',
  created_at timestamptz not null default now()
);

create index if not exists folders_account_idx
  on public.folders (account_id, name);

comment on table public.folders is
  'Pastas de um nível só, compartilhadas por rules e sequences. Cores em src/lib/folders/folders.ts.';

alter table public.rules
  add column if not exists folder_id uuid references public.folders (id) on delete set null;
alter table public.sequences
  add column if not exists folder_id uuid references public.folders (id) on delete set null;

create index if not exists rules_folder_idx on public.rules (folder_id)
  where folder_id is not null;
create index if not exists sequences_folder_idx on public.sequences (folder_id)
  where folder_id is not null;

alter table public.folders enable row level security;

drop policy if exists "own folders" on public.folders;
create policy "own folders" on public.folders
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );
