-- ══════════════════════════════════════════════════════════════════════════
-- Falow: nó "Pausar automações" (extras estilo ManyChat)
--
-- Marca até quando uma conversa fica fora do alcance de NOVAS automações
-- (regras de DM/comentário e início de workflows). Quem já está no meio de
-- um fluxo continua normalmente — o nó só bloqueia entrada nova, nunca
-- interrompe uma execução em andamento.
--
-- Seguro para rodar de novo: `if not exists`.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists automation_paused_until timestamptz;

comment on column public.conversations.automation_paused_until is
  'Enquanto no futuro, regras (DM/comentário) e workflows não iniciam para esta pessoa (nó "Pausar automações"). Runs de sequência já em andamento não são afetados.';
