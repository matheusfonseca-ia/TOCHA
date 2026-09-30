-- ══════════════════════════════════════════════════════════════════════════
-- Falow: chave de IA por usuário
--
-- Cada usuário do painel cadastra a própria chave da OpenRouter (tela
-- Contas). A chave fica CRIPTOGRAFADA (AES-256-GCM com TOKEN_ENCRYPTION_KEY,
-- mesmo esquema dos tokens do Instagram) e só o servidor decifra: o
-- navegador nunca recebe a chave de volta, só os 4 últimos caracteres.
--
-- Sem linha aqui, o Falow usa OPENROUTER_API_KEY do ambiente (se existir).
--
-- Seguro para rodar de novo: `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_ai_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  api_key_enc text not null,
  model       text,
  updated_at  timestamptz not null default now()
);

comment on table public.user_ai_settings is
  'Chave OpenRouter (criptografada) e modelo do botão de IA, uma linha por usuário do painel.';

alter table public.user_ai_settings enable row level security;

drop policy if exists "own ai settings" on public.user_ai_settings;
create policy "own ai settings" on public.user_ai_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
