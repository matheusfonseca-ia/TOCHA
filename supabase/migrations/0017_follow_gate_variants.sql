-- ══════════════════════════════════════════════════════════════════════════
-- Falow: variações nas mensagens do portão "Seguir para liberar"
--
-- As duas mensagens do portão (a de quem ainda não segue e a de "ainda não
-- apareceu que você segue") passam a aceitar mais de um texto: a cada envio o
-- Falow sorteia um deles, igual à resposta pública do comentário (0005).
--
-- As colunas `follow_gate_text` e `follow_gate_retry_text` (0007) continuam
-- sendo a "variante 1" de cada mensagem (nulo = texto padrão). As colunas
-- novas guardam só as variantes EXTRAS (2ª em diante) como array de strings
-- em JSONB, no mesmo formato de `public_reply_variants`. Nulo/vazio = sem
-- variante extra, comportamento idêntico ao de hoje.
--
-- Só adiciona colunas: seguro para aplicar com a versão anterior do app no
-- ar, e para rodar de novo (`if not exists`). O app tolera o banco sem esta
-- migration: salva e lê a regra normalmente, só sem as variações.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.rules
  add column if not exists follow_gate_text_variants jsonb;

alter table public.rules
  add column if not exists follow_gate_retry_variants jsonb;

comment on column public.rules.follow_gate_text_variants is
  'Variantes extras (2ª em diante) da mensagem do portão para quem não segue. follow_gate_text é sempre a 1ª variante (nulo = texto padrão). Array de strings em JSONB, nulo = sem variante extra. Sorteio em src/lib/follow-gate/copy.ts.';

comment on column public.rules.follow_gate_retry_variants is
  'Variantes extras (2ª em diante) da mensagem de "Já segui" sem seguir ainda. follow_gate_retry_text é sempre a 1ª variante (nulo = texto padrão). Array de strings em JSONB, nulo = sem variante extra. Sorteio em src/lib/follow-gate/copy.ts.';

-- Nada muda em RLS: as políticas "own rules" da 0001 cobrem as colunas novas.
