-- ── Histórico de versões do workflow ─────────────────────────────────────────
-- Um snapshot por "Salvar" bem-sucedido (criação e edição), para o painel de
-- Histórico do editor. saveSequence poda pra manter só as 30 mais recentes
-- por sequence_id (ver src/app/(dashboard)/rules/sequencias/actions.ts).

create table if not exists public.sequence_versions (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  account_id  uuid not null references public.ig_accounts (id) on delete cascade,
  name        text not null,
  graph       jsonb not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists sequence_versions_sequence_idx
  on public.sequence_versions (sequence_id, created_at desc);

comment on table public.sequence_versions is
  'Snapshot do grafo a cada "Salvar" bem-sucedido, para restaurar versões anteriores no editor.';

alter table public.sequence_versions enable row level security;

drop policy if exists "own sequence versions" on public.sequence_versions;
create policy "own sequence versions" on public.sequence_versions
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );
