-- ══════════════════════════════════════════════════════════════════════════
-- Falow — schema completo (tabelas, índices, comentários e RLS)
--
-- Rode UMA ÚNICA VEZ: copie este arquivo inteiro, cole no SQL Editor do
-- Supabase e clique em Run (ou use `supabase db push`).
--
-- O script é seguro para rodar de novo: tudo usa `if not exists` / recria
-- políticas, e o bloco final atualiza bancos que já tinham uma versão
-- anterior do schema.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Contas do Instagram conectadas via OAuth (Login do Instagram) ──────────
create table if not exists public.ig_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  ig_user_id          text not null,              -- ID da conta IG Business
  ig_username         text not null,
  page_id             text,                       -- legado do fluxo via Facebook
  page_name           text,
  profile_picture_url text,
  access_token_enc    text not null,              -- token criptografado (AES-256-GCM)
  token_expires_at    timestamptz,
  status              text not null default 'active'
                      check (status in ('active', 'expired', 'disconnected')),
  connected_at        timestamptz not null default now(),
  unique (user_id, ig_user_id)
);

create index if not exists ig_accounts_ig_user_id_idx
  on public.ig_accounts (ig_user_id) where status = 'active';

comment on column public.ig_accounts.page_id is
  'Legado do fluxo via Facebook; nulo para contas conectadas com Login do Instagram.';
comment on column public.ig_accounts.access_token_enc is
  'Token da conta profissional do Instagram, criptografado (AES-256-GCM). Expira em ~60 dias; renovado automaticamente pelo webhook.';

-- ── Regras: automações de DM e de comentário ───────────────────────────────
create table if not exists public.rules (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.ig_accounts (id) on delete cascade,
  name                 text,                      -- nome da automação (independente da keyword)
  trigger_type         text not null default 'dm'
                       check (trigger_type in ('dm', 'comment')),
  keyword              text check (length(trim(keyword)) > 0),
  match_type           text not null default 'contains'
                       check (match_type in ('exact', 'contains', 'starts_with')),

  -- Gatilho de comentário
  media_mode           text check (media_mode in ('specific', 'any')),
  media_refs           jsonb,                     -- [{id, thumbnail_url, permalink, media_type, caption}]
  comment_any_word     boolean not null default false,
  public_reply_enabled boolean not null default false,
  public_reply_text    text,
  welcome_text         text,                      -- 1ª mensagem (resposta privada + botão)
  welcome_button_label text,

  -- Resposta entregue (DM direta, ou 2ª mensagem do fluxo de comentário)
  reply_type           text not null default 'text'
                       check (reply_type in ('text', 'image', 'buttons')),
  reply_text           text,
  reply_image_url      text,
  reply_buttons        jsonb,                     -- [{ "title": "...", "url": "..." }] (máx. 3)

  delay_seconds        int  not null default 3 check (delay_seconds between 2 and 5),
  is_active            boolean not null default true,
  priority             int  not null default 0,   -- menor = avaliada primeiro
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists rules_account_active_idx
  on public.rules (account_id, priority) where is_active;

comment on column public.rules.trigger_type is
  'dm: dispara ao receber uma DM. comment: dispara ao receber um comentário numa publicação/Reel.';
comment on column public.rules.media_refs is
  'Snapshot das publicações/Reels alvo quando media_mode = specific (evita nova chamada à Graph API só para exibir a lista).';
comment on column public.rules.welcome_text is
  'Resposta privada enviada ao comentário-gatilho (recipient.comment_id), com botão postback. reply_text/reply_buttons guardam a 2ª mensagem, enviada quando o botão é tocado.';

-- ── Conversas: controla a janela de 24h do Meta ─────────────────────────────
create table if not exists public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id       text not null,
  ig_sender_username text,
  last_inbound_at    timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (account_id, ig_sender_id)
);

-- ── Anti-duplicidade: cada regra dispara no máximo 1x por usuário ───────────
create table if not exists public.rule_triggers (
  rule_id           uuid not null references public.rules (id) on delete cascade,
  account_id        uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id      text not null,
  triggered_at      timestamptz not null default now(),
  link_delivered_at timestamptz,
  primary key (rule_id, ig_sender_id)
);

comment on column public.rule_triggers.link_delivered_at is
  'Trava da 2ª etapa do fluxo de comentário: evita entregar o link 2x caso o botão seja tocado mais de uma vez (ou o webhook do postback seja reentregue sem "mid" para dedupe em processed_events).';

-- ── Idempotência: webhooks do Meta podem ser reentregues ────────────────────
create table if not exists public.processed_events (
  mid        text primary key,                    -- message id do Meta
  created_at timestamptz not null default now()
);

-- ── Sequências: o grafo (nós + arestas) é salvo como JSONB no formato do
--    React Flow; o runtime do webhook percorre o mesmo JSON ────────────────
create table if not exists public.sequences (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  graph      jsonb not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sequences_account_active_idx
  on public.sequences (account_id) where is_active;

comment on table public.sequences is
  'Fluxos de mensagens (canvas estilo n8n). graph = {nodes[], edges[]} no formato do React Flow; o gatilho é um nó do próprio grafo.';

-- ── Execuções: uma pessoa dentro de um fluxo (máquina de estados) ──────────
-- Espelha rule_triggers: cada pessoa entra no máximo 1x em cada sequência.
create table if not exists public.sequence_runs (
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
create index if not exists sequence_runs_due_idx on public.sequence_runs (next_run_at)
  where status = 'waiting_delay';
-- Retomada por resposta: busca pelo remetente que está esperando
create index if not exists sequence_runs_waiting_idx on public.sequence_runs (account_id, ig_sender_id)
  where status in ('waiting_reply', 'waiting_postback');

comment on column public.sequence_runs.current_node_id is
  'Id do nó do grafo em que a execução parou: o nó de espera (waiting_reply/waiting_postback) ou o nó de atraso (waiting_delay).';

-- ── Log de interações (alimenta métricas e tela de logs) ────────────────────
create table if not exists public.interactions (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id    text not null,
  message_text    text,
  matched_rule_id uuid references public.rules (id) on delete set null,
  matched_keyword text,
  sequence_id     uuid references public.sequences (id) on delete set null,
  status          text not null
                  check (status in ('replied', 'no_match', 'duplicate_skip', 'window_expired', 'error')),
  reply_type      text,
  error_detail    text,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create index if not exists interactions_account_created_idx
  on public.interactions (account_id, created_at desc);
create index if not exists interactions_status_idx
  on public.interactions (account_id, status);

-- ══════════════════════════════════════════════════════════════════════════
-- RLS — usuários enxergam apenas os próprios dados.
-- O webhook usa a service role key (bypass de RLS) no servidor.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.ig_accounts      enable row level security;
alter table public.rules            enable row level security;
alter table public.conversations    enable row level security;
alter table public.rule_triggers    enable row level security;
alter table public.processed_events enable row level security;
alter table public.interactions     enable row level security;
alter table public.sequences        enable row level security;
alter table public.sequence_runs    enable row level security;

drop policy if exists "own accounts" on public.ig_accounts;
create policy "own accounts" on public.ig_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own rules" on public.rules;
create policy "own rules" on public.rules
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own triggers" on public.rule_triggers;
create policy "own triggers" on public.rule_triggers
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own interactions" on public.interactions;
create policy "own interactions" on public.interactions
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own sequences" on public.sequences;
create policy "own sequences" on public.sequences
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own sequence runs" on public.sequence_runs;
create policy "own sequence runs" on public.sequence_runs
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- processed_events: apenas service role (nenhuma policy = sem acesso via anon)

-- ══════════════════════════════════════════════════════════════════════════
-- Compatibilidade — bancos criados por uma versão anterior deste schema.
-- Em banco novo, tudo abaixo é no-op.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.ig_accounts alter column page_id drop not null;
alter table public.rules       alter column keyword drop not null;

alter table public.rules
  add column if not exists name                 text,
  add column if not exists trigger_type         text not null default 'dm'
                                                check (trigger_type in ('dm', 'comment')),
  add column if not exists media_mode           text
                                                check (media_mode in ('specific', 'any')),
  add column if not exists media_refs           jsonb,
  add column if not exists comment_any_word     boolean not null default false,
  add column if not exists public_reply_enabled boolean not null default false,
  add column if not exists public_reply_text    text,
  add column if not exists welcome_text         text,
  add column if not exists welcome_button_label text;

alter table public.rule_triggers
  add column if not exists link_delivered_at timestamptz;

alter table public.interactions
  add column if not exists sequence_id uuid references public.sequences (id) on delete set null;
