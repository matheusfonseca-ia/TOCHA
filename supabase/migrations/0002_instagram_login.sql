-- ══════════════════════════════════════════════════════════════════════════
-- InstaReply — migração para o Login do Instagram (Instagram API with
-- Instagram Login). A conexão deixa de passar por Páginas do Facebook,
-- então os campos de Página viram opcionais.
--
-- Execute no SQL Editor do Supabase, depois do 0001_init.sql.
-- Contas conectadas pelo fluxo antigo continuam válidas no banco, mas
-- precisam ser reconectadas pelo painel para receber um token novo.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.ig_accounts alter column page_id drop not null;

comment on column public.ig_accounts.page_id is
  'Legado do fluxo via Facebook; nulo para contas conectadas com Login do Instagram.';
comment on column public.ig_accounts.access_token_enc is
  'Token da conta profissional do Instagram, criptografado (AES-256-GCM). Expira em ~60 dias; renovado automaticamente pelo webhook.';
