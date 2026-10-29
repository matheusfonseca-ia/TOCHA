import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  console.error("[schema] Faltam as variáveis do Supabase para validar o build.");
  process.exit(1);
}

const requiredColumns = {
  rules: ["expires_at", "expire_action", "paused_by_expiry", "public_reply_variants", "welcome_text_variants"],
  sequences: ["entry_rule_id", "expires_at", "expire_action", "paused_by_expiry"],
  sequence_runs: ["entry_rule_id", "variables"],
  conversations: ["automation_paused_until", "last_message_at", "unread_count", "human_takeover_at", "ig_profile_pic_url", "ig_profile_fetched_at"],
  messages: ["id", "conversation_id", "mid", "source", "reaction_emoji", "original_text"],
  message_signals_pending: ["id", "mid", "payload"],
  contacts: ["id", "account_id", "fields", "tags"],
  quick_replies: ["id", "account_id", "title", "text"],
  crm_notes: ["id", "account_id", "ig_sender_id", "text"],
  crm_tags: ["id", "account_id", "name", "color"],
  pipelines: ["id", "account_id", "is_default", "auto_enroll"],
  pipeline_stages: ["id", "pipeline_id", "position", "stage_type", "on_enter_sequence_id"],
  leads: ["id", "pipeline_id", "conversation_id", "stage_id", "position", "closed_at"],
  lead_stage_events: ["id", "lead_id", "to_stage_id", "source"],
  subscriptions: ["user_id", "stripe_customer_id", "stripe_subscription_id", "status", "current_period_end", "canceled_at", "purge_after"],
  stripe_events: ["id", "received_at"],
  access_grants: ["user_id", "kind", "expires_at", "reason", "granted_by"],
  admin_audit_log: ["id", "admin_id", "action", "target_user_id", "details"],
  processed_events: ["mid", "created_at"],
};

const checks = await Promise.all(
  Object.entries(requiredColumns).map(async ([table, columns]) => {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set("select", columns.join(","));
    url.searchParams.set("limit", "0");

    try {
      const response = await fetch(url, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) return null;
      const error = await response.json().catch(() => ({}));
      return `${table}: ${error.message ?? `HTTP ${response.status}`}`;
    } catch (error) {
      return `${table}: ${error instanceof Error ? error.message : String(error)}`;
    }
  })
);

const failures = checks.filter(Boolean);
if (failures.length) {
  console.error("[schema] O banco não acompanha o código deste commit:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("[schema] Aplique as migrations de supabase/migrations (até a 0023; a 0022 e a 0024 só depois do deploy) neste projeto antes do deploy.");
  process.exit(1);
}

// RLS e privilégios (migration 0024, função falow_rls_report): falha o build se
// alguma tabela de public estiver sem RLS, se ig_accounts/user_ai_settings (ou
// as tabelas só de leitura) tiverem policy/privilégio de escrita para o
// usuário, se access_grants expuser reason/granted_by ou se o registro de
// auditoria tiver perdido o trigger de somente inserção. Sem a 0024 aplicada
// (ela vai depois do deploy) a função não existe: só avisa, não bloqueia.
const rlsFailures = await (async () => {
  const url = new URL("/rest/v1/rpc/falow_rls_report", baseUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404 || body?.code === "PGRST202" || body?.code === "42883") {
        console.warn("[schema] AVISO: falow_rls_report não existe (migration 0024 ainda não aplicada). RLS não conferido neste build; aplique a 0024 logo após o deploy.");
        return [];
      }
      return [`falow_rls_report: ${body?.message ?? `HTTP ${response.status}`}`];
    }
    if (!Array.isArray(body)) return ["falow_rls_report: resposta inesperada"];
    return body.map((row) => `${row.kind} em ${row.table_name}${row.detail ? `: ${row.detail}` : ""}`);
  } catch (error) {
    return [`falow_rls_report: ${error instanceof Error ? error.message : String(error)}`];
  }
})();

if (rlsFailures.length) {
  console.error("[schema] RLS/privilégios do banco inseguros (ver migrations 0022 e 0024):");
  for (const failure of rlsFailures) console.error(`  ${failure}`);
  console.error("[schema] Corrija no Supabase (rode de novo a 0024) antes do deploy.");
  process.exit(1);
}

console.log("[schema] Banco compatível com o build.");
