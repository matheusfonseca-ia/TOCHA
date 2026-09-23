-- ══════════════════════════════════════════════════════════════════════════
-- Falow: nó "Automação" dentro do workflow (sequences ↔ rules)
--
-- Uma automação (rule) pode ser a porta de entrada de um workflow: quando ela
-- dispara (DM respondida, ou link do comentário entregue após o toque no
-- botão), o workflow ATIVO que a tem como entrada continua a partir da saída
-- do nó. `entry_rule_id` é espelho desnormalizado do grafo, gravado pelo save,
-- para o webhook achar esse workflow sem varrer o JSONB de todas as sequências.
--
-- Seguro para rodar de novo: tudo usa `if not exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Sequências: qual rule dá entrada no fluxo ──────────────────────────────
-- on delete set null: excluir a rule não apaga o workflow; ele só deixa de
-- ser iniciado (o editor mostra o nó como "Automação removida").
alter table public.sequences
  add column if not exists entry_rule_id uuid
    references public.rules (id) on delete set null;

-- Busca do webhook: "workflow ativo cuja entrada é a rule X" (parcial: só os
-- ativos interessam, workflow pausado = rule responde sozinha).
create index if not exists sequences_entry_rule_active_idx
  on public.sequences (entry_rule_id) where is_active and entry_rule_id is not null;

-- "Usada em N workflows" ao excluir uma rule (inclui os pausados).
create index if not exists sequences_entry_rule_idx
  on public.sequences (entry_rule_id) where entry_rule_id is not null;

comment on column public.sequences.entry_rule_id is
  'Rule (automação) que inicia este workflow: gatilho em source "automation", com o nó Automação ligado direto ao gatilho. Espelho do grafo, gravado pelo save.';

-- ── Execuções: rule que iniciou o run (auditoria / painel de execuções) ────
alter table public.sequence_runs
  add column if not exists entry_rule_id uuid
    references public.rules (id) on delete set null;

comment on column public.sequence_runs.entry_rule_id is
  'Rule que iniciou esta execução (entrada por automação). Nulo em runs iniciados por palavra-chave na DM.';

-- Nada muda em RLS: as políticas "own sequences" / "own sequence runs" da
-- 0001 cobrem as colunas novas.
