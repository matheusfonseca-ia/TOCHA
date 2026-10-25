-- ══════════════════════════════════════════════════════════════════════════
-- Falow: admins (cortesia e bloqueio) e auditoria das ações de admin.
--
-- `access_grants`: no máximo uma linha por usuário — cortesia (com validade)
-- ou bloqueio. O usuário só LÊ a própria linha (o middleware precisa); só o
-- servidor (service role) grava, depois de conferir que quem pediu é admin.
-- `admin_audit_log`: toda ação de escrita do painel /admin. Só service role.
-- Aditiva: pode ser aplicada antes do deploy, junto com a 0020.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.access_grants (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('courtesy', 'block')),
  expires_at timestamptz,
  reason     text not null check (length(reason) between 1 and 200),
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  check (kind <> 'courtesy' or expires_at is not null)
);

alter table public.access_grants enable row level security;

drop policy if exists "own access grant select" on public.access_grants;
create policy "own access grant select" on public.access_grants
  for select using (user_id = auth.uid());

create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  admin_id       uuid not null,
  action         text not null check (action in (
                   'courtesy_grant', 'courtesy_revoke', 'block', 'unblock',
                   'invite_resend', 'courtesy_invite')),
  target_user_id uuid,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- sem policy: só service role
