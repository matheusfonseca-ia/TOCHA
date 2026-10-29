-- ══════════════════════════════════════════════════════════════════════════
-- Falow: endurecimento do banco (auditoria de 29/10/2026)
--
-- Achados cobertos (docs/auditoria-2026-10-29.md): A0-006, A0-016, A1-043,
-- A3-025, A0-033, A1-042, A1-008, A1-009, A2-015, A3-024, A1-040, A1-046,
-- A1-022, A1-021, A1-041, N-07, A1-018.
--
-- ORDEM DE APLICAÇÃO: só DEPOIS de publicar o código novo (igual à 0022).
-- Duas seções quebram o código antigo:
--   • access_grants (seção 3): o usuário deixa de ler `reason`/`granted_by`.
--     Código que faz `select("*")` em access_grants com o client do usuário
--     (accessGrantOf no middleware) passa a receber "permission denied" e o
--     acesso de TODO cliente vira "negado". O código publicado precisa ler
--     só colunas explícitas (user_id, kind, expires_at, created_at).
--   • user_ai_settings (seção 4): o usuário só lê e apaga a própria linha.
--     Salvar chave/modelo precisa ir pela service role.
-- O resto (índices, funções, checks NOT VALID, bucket) é aditivo.
--
-- Índices: `create index` comum (sem CONCURRENTLY, que não roda dentro da
-- transação do SQL Editor). Cada um trava ESCRITAS na tabela por alguns
-- segundos enquanto é construído; rode fora do horário de pico.
--
-- Seguro para rodar de novo: `if not exists` / `drop ... if exists` /
-- `create or replace` / blocos `do $$`.
-- ══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
-- 1. admin_audit_log somente inserção (A0-006)
--
-- O service role não ignora triggers: UPDATE, DELETE e TRUNCATE passam a ser
-- recusados para qualquer papel. Única exceção, estreita: o convite com
-- cortesia (src/app/admin/actions.ts, inviteWithCourtesyAction) grava a
-- linha 'requested' ANTES de criar a conta e depois completa a MESMA linha
-- com o usuário criado/encontrado. Só essa transição é aceita:
--   action = 'courtesy_invite', status 'requested' → 'created' | 'existing',
--   mesmo id/admin_id/action/created_at/e-mail, target_user_id preenchido
--   (e igual ao anterior, se já existia).
-- Depois dela a linha fica imutável (status não é mais 'requested').
-- Quem tem superusuário (SQL Editor) ainda pode desligar o trigger: isso fica
-- registrado no log do Postgres, não aqui.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.falow_admin_audit_log_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.action = 'courtesy_invite'
       and old.details ->> 'status' = 'requested'
       and new.details ->> 'status' in ('created', 'existing')
       and new.id = old.id
       and new.admin_id = old.admin_id
       and new.action = old.action
       and new.created_at = old.created_at
       and (new.details ->> 'email') is not distinct from (old.details ->> 'email')
       and new.target_user_id is not null
       and (old.target_user_id is null or new.target_user_id = old.target_user_id)
    then
      return new;
    end if;
  end if;

  raise exception 'admin_audit_log é somente inserção: % recusado', tg_op
    using errcode = '42501';
end;
$$;

revoke all on function public.falow_admin_audit_log_guard() from public, anon, authenticated;

drop trigger if exists admin_audit_log_append_only on public.admin_audit_log;
create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.falow_admin_audit_log_guard();

drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.falow_admin_audit_log_guard();

-- Sem policy o RLS já barra anon/authenticated; o revoke deixa explícito.
revoke insert, update, delete, truncate on public.admin_audit_log from anon, authenticated;

comment on table public.admin_audit_log is
  'Auditoria do painel /admin. Somente inserção (trigger admin_audit_log_append_only, migration 0024); única atualização aceita: completar o courtesy_invite ''requested''.';


-- ══════════════════════════════════════════════════════════════════════════
-- 2. Retenção de processed_events e stripe_events (A0-016, A1-043, A3-025)
--
-- A Meta reentrega webhook por horas (no máximo poucos dias) e a Stripe por
-- até 3 dias: depois disso a linha de dedupe não serve para nada. O cron
-- diário de purge chama:
--   admin.rpc("falow_prune_old_events", { p_days: 14 })
-- Apaga processed_events com mais de p_days dias e stripe_events com mais de
-- max(p_days, 30) dias, no máximo p_max_rows linhas de cada por chamada (o
-- primeiro purge de uma tabela grande drena em alguns dias, sem transação
-- longa). Nunca aceita menos de 7 dias.
-- `interactions` e `sequence_runs` concluídos NÃO entram aqui: alimentam
-- métricas e o histórico do painel; retenção deles é decisão de produto.
-- ══════════════════════════════════════════════════════════════════════════

create index if not exists processed_events_created_idx
  on public.processed_events (created_at);
create index if not exists stripe_events_received_idx
  on public.stripe_events (received_at);

create or replace function public.falow_prune_old_events(
  p_days     integer default 14,
  p_max_rows integer default 100000
)
returns table (processed_events_deleted bigint, stripe_events_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed bigint;
  v_stripe    bigint;
begin
  if p_days is null or p_days < 7 then
    raise exception 'falow_prune_old_events: p_days precisa ser >= 7 (recebido %)', p_days;
  end if;
  if p_max_rows is null or p_max_rows < 1 then
    raise exception 'falow_prune_old_events: p_max_rows precisa ser >= 1 (recebido %)', p_max_rows;
  end if;

  delete from public.processed_events
   where mid in (
     select pe.mid from public.processed_events pe
      where pe.created_at < now() - make_interval(days => p_days)
      order by pe.created_at
      limit p_max_rows
   );
  get diagnostics v_processed = row_count;

  delete from public.stripe_events
   where id in (
     select se.id from public.stripe_events se
      where se.received_at < now() - make_interval(days => greatest(p_days, 30))
      order by se.received_at
      limit p_max_rows
   );
  get diagnostics v_stripe = row_count;

  return query select v_processed, v_stripe;
end;
$$;

comment on function public.falow_prune_old_events(integer, integer) is
  'Retenção do dedupe de webhooks: apaga processed_events > p_days dias e stripe_events > max(p_days, 30) dias (até p_max_rows de cada). Só service role; chamado pelo cron diário de purge.';

revoke all on function public.falow_prune_old_events(integer, integer) from public, anon, authenticated;
grant execute on function public.falow_prune_old_events(integer, integer) to service_role;


-- ══════════════════════════════════════════════════════════════════════════
-- 3. access_grants: o usuário não lê `reason` nem `granted_by` (A0-033, A1-042)
--
-- Privilégio por coluna: o authenticated lê só user_id, kind, expires_at e
-- created_at da própria linha (a policy continua limitando à linha dele).
-- ATENÇÃO: `select=*` com o JWT do usuário passa a falhar com 42501 (o
-- Postgres exige privilégio em TODAS as colunas do `*`). O código tem que
-- pedir as colunas explicitamente antes desta migration.
-- O service role (painel /admin, purge, restauração em grants.ts) não muda.
-- ══════════════════════════════════════════════════════════════════════════

revoke all on public.access_grants from anon, authenticated;
grant select (user_id, kind, expires_at, created_at) on public.access_grants to authenticated;

drop policy if exists "own access grant select" on public.access_grants;
create policy "own access grant select" on public.access_grants
  for select using (user_id = (select auth.uid()));


-- ══════════════════════════════════════════════════════════════════════════
-- 4. user_ai_settings: usuário só lê e apaga (A1-041, N-07)
--
-- A policy `for all` deixava gravar api_key_enc/model/provider direto pela
-- API, sem a validação da server action. Agora a escrita (salvar chave,
-- trocar modelo) vai pela service role depois de validar; o usuário segue
-- lendo a própria linha (o servidor decifra a chave com o client dele) e
-- removendo a chave ("Remover" na tela Contas usa o client do usuário).
-- A coluna api_key_enc continua legível pelo dono: o código lê com o client
-- do usuário, e revogar a coluna quebraria o botão de IA.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "own ai settings" on public.user_ai_settings;
drop policy if exists "own ai settings select" on public.user_ai_settings;
drop policy if exists "own ai settings delete" on public.user_ai_settings;

create policy "own ai settings select" on public.user_ai_settings
  for select using (user_id = (select auth.uid()));
create policy "own ai settings delete" on public.user_ai_settings
  for delete using (user_id = (select auth.uid()));

revoke insert, update, truncate on public.user_ai_settings from anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 5. ig_accounts: sem escrita para o usuário também no nível de privilégio
--    (reforço da 0022, A1-008)
--
-- Se alguém recriar por engano uma policy de escrita, o revoke continua
-- barrando. Conectar/desconectar/sincronizar já usam a service role.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "own accounts" on public.ig_accounts;
revoke insert, update, delete, truncate on public.ig_accounts from anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 6. sequence_runs: índices das consultas quentes (A1-009, A2-015, A3-024)
-- ══════════════════════════════════════════════════════════════════════════

-- recoverStaleRuns (runtime.ts): status = 'running' and updated_at < cutoff
-- order by updated_at. Roda no cron a cada minuto e ao fim de cada webhook.
create index if not exists sequence_runs_running_updated_idx
  on public.sequence_runs (updated_at)
  where status = 'running';

-- Ficha do lead no Inbox (inbox.queries.ts, getThread): account_id +
-- ig_sender_id + status in (ACTIVE_RUN_STATUSES). O parcial da 0001 só cobre
-- waiting_reply/waiting_postback e não serve para esse IN.
create index if not exists sequence_runs_active_sender_idx
  on public.sequence_runs (account_id, ig_sender_id)
  where status in ('running', 'waiting_reply', 'waiting_postback', 'waiting_delay');


-- ══════════════════════════════════════════════════════════════════════════
-- 7. Índices em colunas FK usadas em delete/cascade (A1-040)
--
-- Sem eles, apagar uma rule/sequence/contato/etapa ou um usuário (purge LGPD)
-- varre a tabela filha inteira para aplicar `set null`/`cascade`/`restrict`.
-- Parciais (`is not null`) nas colunas anuláveis: só as linhas que apontam
-- para alguém interessam ao delete.
-- ══════════════════════════════════════════════════════════════════════════

create index if not exists interactions_matched_rule_idx
  on public.interactions (matched_rule_id) where matched_rule_id is not null;
create index if not exists interactions_sequence_idx
  on public.interactions (sequence_id) where sequence_id is not null;
create index if not exists sequence_runs_entry_rule_idx
  on public.sequence_runs (entry_rule_id) where entry_rule_id is not null;
create index if not exists sequence_runs_account_idx
  on public.sequence_runs (account_id);
create index if not exists conversations_contact_idx
  on public.conversations (contact_id) where contact_id is not null;
create index if not exists messages_sent_by_idx
  on public.messages (sent_by) where sent_by is not null;
create index if not exists crm_notes_author_idx
  on public.crm_notes (author_id) where author_id is not null;
create index if not exists lead_stage_events_moved_by_idx
  on public.lead_stage_events (moved_by) where moved_by is not null;
create index if not exists lead_stage_events_account_idx
  on public.lead_stage_events (account_id);
create index if not exists lead_stage_events_from_stage_idx
  on public.lead_stage_events (from_stage_id) where from_stage_id is not null;
create index if not exists lead_stage_events_to_stage_idx
  on public.lead_stage_events (to_stage_id) where to_stage_id is not null;
create index if not exists pipeline_stages_on_enter_sequence_idx
  on public.pipeline_stages (on_enter_sequence_id) where on_enter_sequence_id is not null;
create index if not exists leads_stage_idx
  on public.leads (stage_id);
create index if not exists leads_conversation_idx
  on public.leads (conversation_id);
create index if not exists rule_triggers_account_idx
  on public.rule_triggers (account_id);
create index if not exists sequence_versions_account_idx
  on public.sequence_versions (account_id);
-- rules/sequences só tinham índice parcial `where is_active`; as listagens do
-- painel e o cascade de ig_accounts não filtram is_active.
create index if not exists rules_account_idx
  on public.rules (account_id);
create index if not exists sequences_account_idx
  on public.sequences (account_id);


-- ══════════════════════════════════════════════════════════════════════════
-- 8. crm_on_message_insert sem corrida (A1-022)
--
-- A 0009 decidia "é a mais recente?" num SELECT separado, antes do UPDATE:
-- dois inserts concorrentes da mesma conversa liam o mesmo last_message_at e
-- o último a commitar vencia, mesmo sendo a mensagem mais antiga. Agora a
-- comparação fica dentro do próprio UPDATE, que enxerga a versão travada
-- (e, em READ COMMITTED, reavalia sobre a versão mais nova da linha).
-- Mesmo comportamento de antes em todo o resto.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.crm_on_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations c set
    last_message_at        = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                  then new.created_at else c.last_message_at end,
    last_message_text      = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                  then left(new.text, 280) else c.last_message_text end,
    last_message_kind      = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                  then new.kind else c.last_message_kind end,
    last_message_direction = case when c.last_message_at is null or new.created_at >= c.last_message_at
                                  then new.direction else c.last_message_direction end,
    unread_count           = c.unread_count
                             + case when new.direction = 'inbound' and new.source <> 'import'
                                    then 1 else 0 end
  where c.id = new.conversation_id;

  return new;
end;
$$;

-- O trigger da 0009 já aponta para esta função; recriado só por garantia.
drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.crm_on_message_insert();


-- ══════════════════════════════════════════════════════════════════════════
-- 9. Limites de tamanho nas colunas que o usuário grava (A1-021)
--
-- As server actions já limitam (zod/normalizadores); o banco só tinha "não
-- vazio". Estes checks são uma rede de segurança contra escrita direta pela
-- API (e contra um graph de dezenas de MB carregado a cada DM pelo webhook).
-- Os valores ficam BEM acima dos limites das actions, para nunca recusar uma
-- gravação legítima. NOT VALID: as linhas existentes não são conferidas
-- (nada quebra ao aplicar); só INSERT/UPDATE novos passam pelo check.
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- tabela, coluna, constraint, expressão
      -- rules (actions: nome/keyword 80, resposta pública 300, boas-vindas
      -- 640, DM 1000, rótulos 20, mídia 30 itens, variantes)
      ('rules', 'name', 'rules_name_len_check', 'length(name) <= 200'),
      ('rules', 'keyword', 'rules_keyword_len_check', 'length(keyword) <= 200'),
      ('rules', 'public_reply_text', 'rules_public_reply_text_len_check', 'length(public_reply_text) <= 2000'),
      ('rules', 'welcome_text', 'rules_welcome_text_len_check', 'length(welcome_text) <= 2000'),
      ('rules', 'welcome_button_label', 'rules_welcome_button_label_len_check', 'length(welcome_button_label) <= 100'),
      ('rules', 'reply_text', 'rules_reply_text_len_check', 'length(reply_text) <= 4000'),
      ('rules', 'reply_image_url', 'rules_reply_image_url_len_check', 'length(reply_image_url) <= 4000'),
      ('rules', 'follow_gate_text', 'rules_follow_gate_text_len_check', 'length(follow_gate_text) <= 2000'),
      ('rules', 'follow_gate_retry_text', 'rules_follow_gate_retry_text_len_check', 'length(follow_gate_retry_text) <= 2000'),
      ('rules', 'follow_gate_follow_label', 'rules_follow_gate_follow_label_len_check', 'length(follow_gate_follow_label) <= 100'),
      ('rules', 'follow_gate_confirm_label', 'rules_follow_gate_confirm_label_len_check', 'length(follow_gate_confirm_label) <= 100'),
      ('rules', 'media_refs', 'rules_media_refs_size_check', 'octet_length(media_refs::text) <= 524288'),
      ('rules', 'reply_buttons', 'rules_reply_buttons_size_check', 'octet_length(reply_buttons::text) <= 65536'),
      ('rules', 'public_reply_variants', 'rules_public_reply_variants_size_check', 'octet_length(public_reply_variants::text) <= 65536'),
      ('rules', 'welcome_text_variants', 'rules_welcome_text_variants_size_check', 'octet_length(welcome_text_variants::text) <= 65536'),
      ('rules', 'follow_gate_text_variants', 'rules_follow_gate_text_variants_size_check', 'octet_length(follow_gate_text_variants::text) <= 65536'),
      ('rules', 'follow_gate_retry_variants', 'rules_follow_gate_retry_variants_size_check', 'octet_length(follow_gate_retry_variants::text) <= 65536'),
      -- sequences / versões (action: nome 80, até 40 blocos e 200 arestas)
      ('sequences', 'name', 'sequences_name_len_check', 'length(name) <= 200'),
      ('sequences', 'graph', 'sequences_graph_size_check', 'octet_length(graph::text) <= 1048576'),
      ('sequence_versions', 'name', 'sequence_versions_name_len_check', 'length(name) <= 200'),
      ('sequence_versions', 'graph', 'sequence_versions_graph_size_check', 'octet_length(graph::text) <= 1048576'),
      -- pastas (action: nome 40)
      ('folders', 'name', 'folders_name_len_check', 'length(name) <= 100'),
      ('folders', 'color', 'folders_color_len_check', 'length(color) <= 32'),
      -- textos salvos (action: rótulo 40, texto 1000)
      ('message_presets', 'scope', 'message_presets_scope_len_check', 'length(scope) <= 64'),
      ('message_presets', 'label', 'message_presets_label_len_check', 'length(label) <= 100'),
      ('message_presets', 'text', 'message_presets_text_len_check', 'length(text) <= 4000'),
      -- respostas rápidas (action: título 40, texto 1000)
      ('quick_replies', 'title', 'quick_replies_title_len_check', 'length(title) <= 100'),
      ('quick_replies', 'text', 'quick_replies_text_len_check', 'length(text) <= 4000'),
      -- notas (action: 2000)
      ('crm_notes', 'text', 'crm_notes_text_len_check', 'length(text) <= 5000'),
      -- tags do catálogo (normalizador: 40; cores da paleta)
      ('crm_tags', 'name', 'crm_tags_name_len_check', 'length(name) <= 100'),
      ('crm_tags', 'color', 'crm_tags_color_len_check', 'length(color) <= 32'),
      -- contatos (o webhook também grava: valores até 1000 por campo)
      ('contacts', 'fields', 'contacts_fields_size_check', 'octet_length(fields::text) <= 262144'),
      ('contacts', 'tags', 'contacts_tags_count_check', 'coalesce(cardinality(tags), 0) <= 500'),
      -- chave de IA (só a service role grava a partir desta migration)
      ('user_ai_settings', 'model', 'user_ai_settings_model_len_check', 'length(model) <= 200'),
      ('user_ai_settings', 'api_key_enc', 'user_ai_settings_api_key_enc_len_check', 'length(api_key_enc) <= 4096')
    ) as t(tbl, col, conname, expr)
  loop
    -- Coluna de migration opcional ausente (ex.: 0017): pula com aviso.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = c.tbl and column_name = c.col
    ) then
      raise notice 'pulando %: coluna %.% não existe', c.conname, c.tbl, c.col;
      continue;
    end if;
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.conname);
    execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.conname, c.expr);
  end loop;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 10. Bucket crm-uploads: limite de tamanho e tipos aceitos (A1-018)
--
-- Continua PÚBLICO: a Meta baixa o anexo pela URL na hora do envio. Limite
-- de 25MB (o maior do classifyUpload) e só os Content-Types que
-- src/modules/crm/inbox/utils/attachment-types.ts aceita (os que ele grava
-- e as variantes de áudio que ele reconhece). Upload fora disso é recusado
-- pelo próprio Storage, mesmo vindo da service role.
-- ══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
       set file_size_limit    = 26214400,
           allowed_mime_types = array[
             'image/png', 'image/jpeg', 'application/pdf',
             'audio/mp4', 'audio/x-m4a', 'audio/m4a',
             'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'
           ]
     where id = 'crm-uploads';
  else
    raise notice 'storage.buckets sem allowed_mime_types: configure o bucket crm-uploads no painel (25MB, PNG/JPEG/PDF/M4A/WAV).';
  end if;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 11. Policies com (select auth.uid()) (A1-046)
--
-- `auth.uid()` solto é reavaliado por linha; `(select auth.uid())` vira
-- InitPlan e roda uma vez por consulta (lint auth_rls_initplan do Supabase).
-- ALTER POLICY troca só a expressão: nome, comando e papéis continuam os
-- mesmos. Percorre todas as policies de public, então cobre também as que
-- forem criadas por migrations anteriores com outro nome. search_path vazio
-- durante o laço: as expressões saem com nomes qualificados (public.x) e
-- voltam iguais. Rodar de novo não faz nada (já embrulhadas são puladas).
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare
  p          record;
  old_path   text := current_setting('search_path');
  new_qual   text;
  new_check  text;
  stmt       text;
begin
  perform set_config('search_path', '', true);

  for p in
    select tablename, policyname, qual, with_check
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    new_qual  := p.qual;
    new_check := p.with_check;
    if new_qual is not null and new_qual !~* 'select\s+auth\.uid\(\)' then
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
    end if;
    if new_check is not null and new_check !~* 'select\s+auth\.uid\(\)' then
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
    end if;

    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
      if new_qual is not null then
        stmt := stmt || ' using (' || new_qual || ')';
      end if;
      if new_check is not null then
        stmt := stmt || ' with check (' || new_check || ')';
      end if;
      execute stmt;
    end if;
  end loop;

  perform set_config('search_path', old_path, true);
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 12. Relatório de RLS para o check do build (A1-008)
--
-- scripts/check-db-schema.mjs chama esta função com a service role e falha o
-- build se ela devolver qualquer linha:
--   rls_disabled      tabela de public sem RLS ligado;
--   write_policy      policy de escrita para o usuário numa tabela que deve
--                     ser só leitura (ig_accounts, user_ai_settings só
--                     select/delete, tabelas de cobrança/admin/dedupe);
--   write_privilege   authenticated com INSERT/UPDATE em ig_accounts ou
--                     user_ai_settings (reforço da seção 4/5);
--   column_exposed    authenticated lendo reason/granted_by de access_grants;
--   audit_log_mutable trigger de somente inserção ausente/desligado.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.falow_rls_report()
returns table (kind text, table_name text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'rls_disabled'::text, c.relname::text, null::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity

  union all
  select 'write_policy', p.tablename::text, p.policyname || ' (' || p.cmd || ')'
    from pg_catalog.pg_policies p
   where p.schemaname = 'public'
     and (
       (p.tablename in ('ig_accounts', 'subscriptions', 'access_grants', 'admin_audit_log',
                        'processed_events', 'stripe_events', 'messages', 'message_signals_pending',
                        'conversations', 'interactions', 'rule_triggers', 'sequence_runs',
                        'pipelines', 'pipeline_stages', 'leads', 'lead_stage_events')
        and p.cmd <> 'SELECT')
       or (p.tablename = 'user_ai_settings' and p.cmd not in ('SELECT', 'DELETE'))
     )

  union all
  select 'write_privilege', t.tbl, t.priv
    from (values ('ig_accounts', 'INSERT'), ('ig_accounts', 'UPDATE'), ('ig_accounts', 'DELETE'),
                 ('user_ai_settings', 'INSERT'), ('user_ai_settings', 'UPDATE')) as t(tbl, priv)
   where pg_catalog.has_table_privilege('authenticated', 'public.' || t.tbl, t.priv)

  union all
  select 'column_exposed', 'access_grants', col
    from unnest(array['reason', 'granted_by']) as col
   where pg_catalog.has_column_privilege('authenticated', 'public.access_grants', col, 'SELECT')

  union all
  select 'audit_log_mutable', 'admin_audit_log', 'trigger admin_audit_log_append_only ausente ou desligado'
   where not exists (
     select 1 from pg_catalog.pg_trigger tg
      where tg.tgrelid = 'public.admin_audit_log'::regclass
        and tg.tgname = 'admin_audit_log_append_only'
        and tg.tgenabled <> 'D'
   )
$$;

comment on function public.falow_rls_report() is
  'Lista problemas de RLS/privilégio (vazio = ok). Chamada pelo scripts/check-db-schema.mjs no build, só service role.';

revoke all on function public.falow_rls_report() from public, anon, authenticated;
grant execute on function public.falow_rls_report() to service_role;
