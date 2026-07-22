-- ══════════════════════════════════════════════════════════════════════════
-- InstaReply — Sequências (fluxos de mensagens desenhados no canvas)
-- Execute no SQL Editor do Supabase (ou via `supabase db push`)
-- ══════════════════════════════════════════════════════════════════════════

-- ── Sequências: o grafo (nós + arestas) é salvo como JSONB no formato do
--    React Flow; o runtime do webhook percorre o mesmo JSON ────────────────
create table public.sequences (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  graph      jsonb not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sequences_account_active_idx on public.sequences (account_id) where is_active;

comment on table public.sequences is
  'Fluxos de mensagens (canvas estilo n8n). graph = {nodes[], edges[]} no formato do React Flow; o gatilho é um nó do próprio grafo.';

-- ── Execuções: uma pessoa dentro de um fluxo (máquina de estados) ──────────
-- Espelha rule_triggers: cada pessoa entra no máximo 1x em cada sequência.
create table public.sequence_runs (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.sequences (id) on delete cascade,
  account_id      uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id    text not null,
  status          text not null default 'running'
                  check (status in ('running', 'waiting_reply', 'waiting_postback',
                                    'waiting_delay', 'completed', 'window_expired', 'error')),
  current_node_id text,          -- nó em que o fluxo está parado
  next_run_at     timestamptz,   -- quando retomar (status waiting_delay)
  steps_executed  int not null default 0,
  last_error      text,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (sequence_id, ig_sender_id)
);

-- Retomada de atrasos (cron/tick): busca por vencimento
create index sequence_runs_due_idx on public.sequence_runs (next_run_at)
  where status = 'waiting_delay';
-- Retomada por resposta: busca pelo remetente que está esperando
create index sequence_runs_waiting_idx on public.sequence_runs (account_id, ig_sender_id)
  where status in ('waiting_reply', 'waiting_postback');

comment on column public.sequence_runs.current_node_id is
  'Id do nó do grafo em que a execução parou: o nó de espera (waiting_reply/waiting_postback) ou o nó de atraso (waiting_delay).';

-- ── Logs: interações passam a poder apontar para uma sequência ─────────────
alter table public.interactions
  add column sequence_id uuid references public.sequences (id) on delete set null;

-- ══════════════════════════════════════════════════════════════════════════
-- RLS — mesmo modelo do resto: usuário enxerga só o que é das contas dele;
-- o webhook usa a service role key (bypass de RLS).
-- ══════════════════════════════════════════════════════════════════════════

alter table public.sequences     enable row level security;
alter table public.sequence_runs enable row level security;

create policy "own sequences" on public.sequences
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

create policy "own sequence runs" on public.sequence_runs
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );
