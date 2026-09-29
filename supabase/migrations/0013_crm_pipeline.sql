-- ══════════════════════════════════════════════════════════════════════════
-- Falow: CRM de conversas, Funil (Kanban), Fase 5 + 6
--
-- `pipelines` (funis) e `pipeline_stages` (etapas) por conta; `leads` é a
-- pessoa dentro de um funil (1 aberto por funil+conversa); `lead_stage_events`
-- é o histórico de movimentação. O funil padrão (Novos, Em conversa,
-- Negociando, Ganho, Perdido) é criado em código, na 1ª visita à tela do
-- Funil ou na 1ª entrada automática (`ensureDefaultPipeline`).
--
-- Escrita sempre via service role, depois de conferir posse pelo RLS (mesmo
-- padrão das migrations anteriores); as policies aqui cobrem a leitura direta
-- do usuário (painel e o board).
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Funis ────────────────────────────────────────────────────────────────────
create table if not exists public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.ig_accounts (id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  auto_enroll boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Só um funil padrão por conta (a entrada automática da captura depende disto).
create unique index if not exists pipelines_one_default_per_account
  on public.pipelines (account_id) where is_default;

create index if not exists pipelines_account_idx on public.pipelines (account_id);

-- ── Etapas ───────────────────────────────────────────────────────────────────
create table if not exists public.pipeline_stages (
  id                  uuid primary key default gen_random_uuid(),
  pipeline_id         uuid not null references public.pipelines (id) on delete cascade,
  name                text not null,
  position            numeric not null,
  color               text not null default '#22c55e',
  stage_type          text not null default 'open'
                      check (stage_type in ('open', 'won', 'lost')),
  -- Nó "Mover para etapa"/board disparam este workflow ao entrar na etapa
  -- (Fase 6). Workflow removido não apaga a etapa, só some a automação.
  on_enter_sequence_id uuid references public.sequences (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists pipeline_stages_pipeline_idx
  on public.pipeline_stages (pipeline_id, position);

comment on column public.pipeline_stages.stage_type is
  'open: etapa normal do funil. won/lost: fecham o lead (closed_at) ao entrar.';

-- ── Leads (pessoa dentro de um funil) ────────────────────────────────────────
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  pipeline_id      uuid not null references public.pipelines (id) on delete cascade,
  account_id       uuid not null references public.ig_accounts (id) on delete cascade,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  ig_sender_id     text not null,
  stage_id         uuid not null references public.pipeline_stages (id) on delete restrict,
  value            numeric,
  position         numeric not null,
  entered_stage_at timestamptz not null default now(),
  closed_at        timestamptz,
  lost_reason      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Só 1 lead aberto por funil+conversa (D2): entrada automática e "Trazer
-- conversas existentes" usam isto para nunca duplicar (23505 = já está lá).
create unique index if not exists leads_open_per_pipeline_conversation
  on public.leads (pipeline_id, conversation_id) where closed_at is null;

create index if not exists leads_board_idx on public.leads (pipeline_id, stage_id, position);
create index if not exists leads_account_sender_idx on public.leads (account_id, ig_sender_id);

comment on table public.leads is
  'Pessoa dentro de um funil. stage_id em restrict: excluir uma etapa exige mover os leads dela antes (diálogo de etapas escolhe o destino).';

-- ── Histórico de movimentação ────────────────────────────────────────────────
create table if not exists public.lead_stage_events (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  account_id    uuid not null references public.ig_accounts (id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id   uuid references public.pipeline_stages (id) on delete set null,
  source        text not null check (source in ('manual', 'automation', 'system')),
  moved_by      uuid references auth.users (id) on delete set null,
  moved_at      timestamptz not null default now()
);

create index if not exists lead_stage_events_lead_idx
  on public.lead_stage_events (lead_id, moved_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo padrão de `messages` (0009): o dono lê pelo client; toda escrita
-- acontece via service role depois de conferir a posse na própria action.
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_stage_events enable row level security;

drop policy if exists "own pipelines select" on public.pipelines;
create policy "own pipelines select" on public.pipelines
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own pipeline_stages select" on public.pipeline_stages;
create policy "own pipeline_stages select" on public.pipeline_stages
  for select using (
    pipeline_id in (
      select id from public.pipelines
       where account_id in (select id from public.ig_accounts where user_id = auth.uid())
    )
  );

drop policy if exists "own leads select" on public.leads;
create policy "own leads select" on public.leads
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own lead_stage_events select" on public.lead_stage_events;
create policy "own lead_stage_events select" on public.lead_stage_events
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end;
$$;
