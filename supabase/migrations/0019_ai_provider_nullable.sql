-- ══════════════════════════════════════════════════════════════════════════
-- Falow: provider da chave de IA passa a aceitar nulo ("deduzir pelo prefixo")
--
-- A 0018 criou `provider` como NOT NULL DEFAULT 'openrouter'. Quem salvou uma
-- chave da OpenAI com o app rodando num banco SEM a 0018 teve a chave guardada
-- sem o provedor; ao rodar a 0018 essa linha virou 'openrouter' e a chave da
-- OpenAI passou a ser enviada para a OpenRouter (401). Não dá para corrigir
-- por SQL pelo conteúdo da chave, porque ela é criptografada.
--
-- Solução: nulo significa "deduzir pelo prefixo da chave" (sk-or- é
-- OpenRouter, outra sk- é OpenAI, sem prefixo é OpenRouter). Aqui o valor
-- 'openrouter' que veio só do default volta a nulo. Chave OpenRouter de
-- verdade continua OpenRouter pelo prefixo; chave OpenAI rotulada errado passa
-- a ser OpenAI. O app grava o provedor explicitamente a cada salvamento.
--
-- Idempotente e independente da 0018: cria a coluna se ela não existir.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.user_ai_settings
  add column if not exists provider text;

alter table public.user_ai_settings
  alter column provider drop not null;
alter table public.user_ai_settings
  alter column provider drop default;

-- O check da 0018 já aceita nulo, mas recria para o banco que nunca rodou a 0018.
alter table public.user_ai_settings
  drop constraint if exists user_ai_settings_provider_check;
alter table public.user_ai_settings
  add constraint user_ai_settings_provider_check
  check (provider in ('openrouter', 'openai'));

update public.user_ai_settings
  set provider = null
  where provider = 'openrouter';

comment on column public.user_ai_settings.provider is
  'Provedor da chave guardada em api_key_enc: openrouter, openai ou nulo (deduzir pelo prefixo da chave). Catálogo em src/lib/ai/providers.ts.';
