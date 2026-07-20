-- ══════════════════════════════════════════════════════════════════════════
-- InstaReply — automação "Responder Comentário" (comentário → resposta
-- privada com botão → DM com link ao tocar no botão)
-- Execute no SQL Editor do Supabase (ou via `supabase db push`)
-- ══════════════════════════════════════════════════════════════════════════

alter table public.rules alter column keyword drop not null;

alter table public.rules
  add column trigger_type          text not null default 'dm'
                                    check (trigger_type in ('dm', 'comment')),
  add column media_mode            text
                                    check (media_mode in ('specific', 'any')),
  add column media_refs            jsonb,          -- [{id, thumbnail_url, permalink, media_type, caption}]
  add column comment_any_word      boolean not null default false,
  add column public_reply_enabled  boolean not null default false,
  add column public_reply_text     text,
  add column welcome_text          text,           -- 1ª mensagem (resposta privada + botão)
  add column welcome_button_label  text;

comment on column public.rules.trigger_type is
  'dm: dispara ao receber uma DM. comment: dispara ao receber um comentário numa publicação/Reel.';
comment on column public.rules.media_refs is
  'Snapshot das publicações/Reels alvo quando media_mode = specific (evita nova chamada à Graph API só para exibir a lista).';
comment on column public.rules.welcome_text is
  'Resposta privada enviada ao comentário-gatilho (recipient.comment_id), com botão postback. reply_text/reply_buttons (colunas já existentes) guardam a 2ª mensagem, enviada quando o botão é tocado.';

-- ── rule_triggers: trava separada para a 2ª etapa (entrega do link) ─────────
-- A trava original (rule_id, ig_sender_id) já impede a resposta privada de
-- disparar 2x pro mesmo usuário; esta nova coluna evita que o link seja
-- entregue 2x caso o botão seja tocado mais de uma vez (ou o webhook do
-- postback seja reentregue sem "mid" para dedupe em processed_events).
alter table public.rule_triggers
  add column link_delivered_at timestamptz;
