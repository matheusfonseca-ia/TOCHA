-- ══════════════════════════════════════════════════════════════════════════
-- Falow: variantes de resposta nas automações de comentário
--
-- Em vez de um único texto fixo, a automação de comentário pode ter várias
-- opções de resposta pública e de mensagem de boas-vindas: a cada disparo o
-- Falow sorteia uma delas, para não repetir sempre o mesmo texto.
--
-- As colunas existentes `public_reply_text` e `welcome_text` continuam sendo
-- a fonte de verdade da "variante 1" (compatibilidade com regras já salvas e
-- com todo código que só lê essas colunas). As colunas novas guardam só as
-- variantes EXTRAS (2ª em diante) como array de strings; nulo/vazio = sem
-- variante extra, comportamento idêntico ao de hoje.
--
-- Seguro para rodar de novo: tudo usa `if not exists`.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.rules
  add column if not exists public_reply_variants jsonb;

alter table public.rules
  add column if not exists welcome_text_variants jsonb;

comment on column public.rules.public_reply_variants is
  'Variantes extras (2ª em diante) da resposta pública ao comentário. public_reply_text é sempre a 1ª variante. Array de strings em JSONB, nulo = sem variante extra. Sorteio em src/lib/rules/variants.ts.';

comment on column public.rules.welcome_text_variants is
  'Variantes extras (2ª em diante) da mensagem privada de boas-vindas. welcome_text é sempre a 1ª variante. Array de strings em JSONB, nulo = sem variante extra. Sorteio em src/lib/rules/variants.ts.';

-- Nada muda em RLS: as políticas "own rules" da 0001 cobrem as colunas novas.
