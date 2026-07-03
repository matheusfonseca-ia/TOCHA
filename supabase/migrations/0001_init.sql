-- ══════════════════════════════════════════════════════════════════════════
-- InstaReply — schema inicial
-- Execute no SQL Editor do Supabase (ou via `supabase db push`)
-- ══════════════════════════════════════════════════════════════════════════

-- ── Contas do Instagram conectadas via OAuth Meta ──────────────────────────
create table public.ig_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  ig_user_id          text not null,              -- ID da conta IG Business
  ig_username         text not null,
  page_id             text not null,              -- Página do Facebook vinculada
  page_name           text,
  profile_picture_url text,
  access_token_enc    text not null,              -- Page token criptografado (AES-256-GCM)
  token_expires_at    timestamptz,
  status              text not null default 'active'
                      check (status in ('active', 'expired', 'disconnected')),
  connected_at        timestamptz not null default now(),
  unique (user_id, ig_user_id)
);

create index ig_accounts_ig_user_id_idx on public.ig_accounts (ig_user_id) where status = 'active';

-- ── Regras de palavra-chave ─────────────────────────────────────────────────
create table public.rules (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.ig_accounts (id) on delete cascade,
  keyword         text not null check (length(trim(keyword)) > 0),
  match_type      text not null default 'contains'
                  check (match_type in ('exact', 'contains', 'starts_with')),
  reply_type      text not null default 'text'
                  check (reply_type in ('text', 'image', 'buttons')),
  reply_text      text,
  reply_image_url text,
  reply_buttons   jsonb,                          -- [{ "title": "...", "url": "..." }] (máx. 3)
  delay_seconds   int  not null default 3 check (delay_seconds between 2 and 5),
  is_active       boolean not null default true,
  priority        int  not null default 0,        -- menor = avaliada primeiro
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index rules_account_active_idx on public.rules (account_id, priority) where is_active;

-- ── Conversas: controla a janela de 24h do Meta ─────────────────────────────
create table public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id       text not null,
  ig_sender_username text,
  last_inbound_at    timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (account_id, ig_sender_id)
);

-- ── Anti-duplicidade: cada regra dispara no máximo 1x por usuário ───────────
create table public.rule_triggers (
  rule_id      uuid not null references public.rules (id) on delete cascade,
  account_id   uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id text not null,
  triggered_at timestamptz not null default now(),
  primary key (rule_id, ig_sender_id)
);

-- ── Idempotência: webhooks do Meta podem ser reentregues ────────────────────
create table public.processed_events (
  mid        text primary key,                    -- message id do Meta
  created_at timestamptz not null default now()
);

-- ── Log de interações (alimenta métricas e tela de logs) ────────────────────
create table public.interactions (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.ig_accounts (id) on delete cascade,
  ig_sender_id    text not null,
  message_text    text,
  matched_rule_id uuid references public.rules (id) on delete set null,
  matched_keyword text,
  status          text not null
                  check (status in ('replied', 'no_match', 'duplicate_skip', 'window_expired', 'error')),
  reply_type      text,
  error_detail    text,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create index interactions_account_created_idx on public.interactions (account_id, created_at desc);
create index interactions_status_idx on public.interactions (account_id, status);

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

create policy "own accounts" on public.ig_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own rules" on public.rules
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

create policy "own conversations" on public.conversations
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

create policy "own triggers" on public.rule_triggers
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

create policy "own interactions" on public.interactions
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- processed_events: apenas service role (nenhuma policy = sem acesso via anon)
