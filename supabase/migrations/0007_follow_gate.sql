-- ══════════════════════════════════════════════════════════════════════════
-- Falow: "Seguir para liberar" (portão de seguidor)
--
-- Com o portão ligado numa automação (comentário ou DM), quem não segue a
-- conta recebe, antes do conteúdo, uma DM com 2 botões: "Seguir perfil"
-- (abre o perfil) e "Já segui" (confere de novo e entrega). A checagem usa o
-- campo is_user_follow_business da User Profile API.
--
-- Só adiciona colunas e amplia um check: seguro para aplicar com a versão
-- anterior do app no ar, e para rodar de novo (`if not exists`).
-- ══════════════════════════════════════════════════════════════════════════

alter table public.rules
  add column if not exists follow_gate_enabled boolean not null default false;
alter table public.rules
  add column if not exists follow_gate_text text;
alter table public.rules
  add column if not exists follow_gate_follow_label text;
alter table public.rules
  add column if not exists follow_gate_confirm_label text;
alter table public.rules
  add column if not exists follow_gate_retry_text text;

comment on column public.rules.follow_gate_enabled is
  'Portão de seguidor: só entrega o conteúdo da automação para quem segue a conta. Lógica em src/lib/follow-gate/.';
comment on column public.rules.follow_gate_text is
  'Mensagem do portão para quem não segue. Nulo = texto padrão (src/lib/follow-gate/copy.ts).';
comment on column public.rules.follow_gate_follow_label is
  'Rótulo do botão que abre o perfil da conta (até 20 caracteres). Nulo = padrão.';
comment on column public.rules.follow_gate_confirm_label is
  'Rótulo do botão "Já segui" (postback falow:follow_check:<rule_id>, até 20 caracteres). Nulo = padrão.';
comment on column public.rules.follow_gate_retry_text is
  'Mensagem quando a pessoa toca em "Já segui" mas ainda não segue. Nulo = padrão.';

alter table public.rule_triggers
  add column if not exists follow_gate_sent_at timestamptz;

comment on column public.rule_triggers.follow_gate_sent_at is
  'Último envio do portão de seguidor para esta pessoa. Preenchido e link_delivered_at nulo = conteúdo ainda retido esperando ela seguir.';

-- Status novo no log: a pessoa pediu a automação e recebeu o portão.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.interactions'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%duplicate_skip%'
  loop
    execute format('alter table public.interactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.interactions
  add constraint interactions_status_check
  check (status in ('replied', 'no_match', 'duplicate_skip', 'window_expired', 'error', 'awaiting_follow'));

-- Nada muda em RLS: as políticas da 0001 cobrem as colunas novas.
