-- ══════════════════════════════════════════════════════════════════════════
-- Falow: provedor da chave de IA por usuário (OpenRouter ou OpenAI)
--
-- A 0016 guardava só chave da OpenRouter. Agora cada usuário escolhe de qual
-- provedor é a chave que cadastrou na tela Contas: 'openrouter' (padrão, o
-- que todas as linhas existentes já são) ou 'openai'.
--
-- Só adiciona uma coluna: seguro para aplicar com a versão anterior do app no
-- ar, e para rodar de novo. O app tolera o banco sem esta migration: lê e
-- salva a chave normalmente, deduzindo o provedor pelo prefixo (sk-or- é
-- OpenRouter).
-- ══════════════════════════════════════════════════════════════════════════

alter table public.user_ai_settings
  add column if not exists provider text not null default 'openrouter';

-- `add column if not exists` não recria o check ao rodar de novo.
alter table public.user_ai_settings
  drop constraint if exists user_ai_settings_provider_check;
alter table public.user_ai_settings
  add constraint user_ai_settings_provider_check
  check (provider in ('openrouter', 'openai'));

comment on column public.user_ai_settings.provider is
  'Provedor da chave guardada em api_key_enc: openrouter ou openai. Catálogo em src/lib/ai/providers.ts.';

-- Nada muda em RLS: a política "own ai settings" da 0016 cobre a coluna nova.
