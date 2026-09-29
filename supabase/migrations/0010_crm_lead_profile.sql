-- ══════════════════════════════════════════════════════════════════════════
-- Falow: CRM: foto e perfil do lead
--
-- Guarda o que a User Profile API devolve sobre quem conversa com a conta:
-- foto, nome, seguidores, se segue a conta e se é verificado. A foto vem de
-- uma URL da CDN da Meta que expira (mesma política de mídia da migration
-- 0009: só a URL é guardada, nunca o arquivo). `ig_profile_fetched_at` marca
-- quando o perfil foi buscado pela última vez, inclusive quando a busca
-- falhou, para o Falow não repetir a chamada a cada mensagem nova.
--
-- Seguro para rodar de novo: tudo usa `add column if not exists`.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.conversations
  add column if not exists ig_profile_pic_url    text,
  add column if not exists ig_profile_name       text,
  add column if not exists ig_follower_count     int,
  add column if not exists ig_follows_business   boolean,
  add column if not exists ig_is_verified        boolean,
  add column if not exists ig_profile_fetched_at timestamptz;

comment on column public.conversations.ig_profile_pic_url is
  'URL da foto de perfil na CDN da Meta. Expira; o painel volta para as iniciais quando a imagem falha e busca de novo (no máximo 1x/hora).';
comment on column public.conversations.ig_profile_fetched_at is
  'Quando o perfil do lead foi buscado pela última vez na User Profile API, inclusive em caso de falha (evita repetir a chamada a cada mensagem nova).';
