-- ══════════════════════════════════════════════════════════════════════════
-- InstaReply — nome próprio para a automação (independente da keyword)
-- Execute no SQL Editor do Supabase (ou via `supabase db push`)
-- ══════════════════════════════════════════════════════════════════════════

alter table public.rules
  add column name text;
