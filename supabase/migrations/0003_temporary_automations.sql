-- ══════════════════════════════════════════════════════════════════════════
-- Falow: automações e workflows temporários
--
-- Uma automação (rule) ou workflow (sequence) pode ter data de expiração. Ao
-- vencer, o sweep (cron /api/cron/sequences e tick ao fim de cada webhook)
-- aplica a ação escolhida pelo usuário:
--   delete → apaga a linha (mesmo efeito da exclusão manual)
--   pause  → is_active = false e paused_by_expiry = true, mantendo
--            expires_at para a lista mostrar "Expirada" até o usuário
--            estender a expiração (só o que foi pausado PELA expiração volta
--            a ficar ativo ao estender; pausa manual continua pausada)
-- O matching do webhook também ignora itens vencidos, então nada dispara
-- depois do horário mesmo antes do sweep rodar.
--
-- Seguro para rodar de novo: tudo usa `if not exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Automações (rules) ─────────────────────────────────────────────────────
alter table public.rules
  add column if not exists expires_at timestamptz;

alter table public.rules
  add column if not exists expire_action text not null default 'delete'
    constraint rules_expire_action_check check (expire_action in ('delete', 'pause'));

alter table public.rules
  add column if not exists paused_by_expiry boolean not null default false;

create index if not exists rules_expires_at_idx
  on public.rules (expires_at) where expires_at is not null;

comment on column public.rules.expires_at is
  'Quando a automação expira. Nulo = permanente.';
comment on column public.rules.expire_action is
  'O que fazer ao expirar: delete (apaga) ou pause (desativa e mantém expires_at para a lista mostrar "Expirada").';
comment on column public.rules.paused_by_expiry is
  'true = pausada pelo sweep de expiração (não pelo usuário). "Estender expiração" só reativa nesse caso; qualquer edição da expiração zera o marcador.';

-- ── Workflows (sequences) ──────────────────────────────────────────────────
alter table public.sequences
  add column if not exists expires_at timestamptz;

alter table public.sequences
  add column if not exists expire_action text not null default 'delete'
    constraint sequences_expire_action_check check (expire_action in ('delete', 'pause'));

alter table public.sequences
  add column if not exists paused_by_expiry boolean not null default false;

create index if not exists sequences_expires_at_idx
  on public.sequences (expires_at) where expires_at is not null;

comment on column public.sequences.expires_at is
  'Quando o workflow expira. Nulo = permanente.';
comment on column public.sequences.expire_action is
  'O que fazer ao expirar: delete (apaga, execuções caem em cascata) ou pause (desativa e mantém expires_at para a lista mostrar "Expirado").';
comment on column public.sequences.paused_by_expiry is
  'true = pausado pelo sweep de expiração (não pelo usuário). "Estender expiração" só reativa nesse caso; qualquer edição da expiração zera o marcador.';

-- Nada muda em RLS: as políticas "own rules" / "own sequences" da 0001 cobrem
-- as colunas novas. O sweep roda com a service role.
