-- ══════════════════════════════════════════════════════════════════════════
-- Falow: multiusuário (assinatura Stripe)
--
-- `subscriptions`: uma linha por usuário, espelho do status da Stripe. Só o
-- webhook da Stripe (service role) escreve; o dono da linha só lê.
-- `stripe_events`: idempotência do webhook (só service role).
-- Índice único de @ ativo: um ig_user_id ativo pertence a um usuário só
-- (o webhook da Meta acha a conta só pelo ig_user_id).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 text not null,
  current_period_end     timestamptz,
  canceled_at            timestamptz,
  purge_after            timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_purge_idx
  on public.subscriptions (purge_after) where purge_after is not null;

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription select" on public.subscriptions;
create policy "own subscription select" on public.subscriptions
  for select using (user_id = auth.uid());

create table if not exists public.stripe_events (
  id          text primary key,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- sem policy: só service role

-- O 0001 criou ig_accounts_ig_user_id_idx com a mesma expressão, mas sem
-- unique. "create unique index if not exists" com o mesmo nome não faria nada.
drop index if exists public.ig_accounts_ig_user_id_idx;
create unique index if not exists ig_accounts_active_ig_user_id_key
  on public.ig_accounts (ig_user_id) where status = 'active';

-- Achar usuário pelo e-mail da compra (supabase-js não tem getUserByEmail).
create or replace function public.falow_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke all on function public.falow_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.falow_user_id_by_email(text) to service_role;
