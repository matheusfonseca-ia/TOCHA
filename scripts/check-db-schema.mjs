import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  console.error("[schema] Faltam as variáveis do Supabase para validar o build da Vercel.");
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
  console.error("[schema] O banco da Vercel não acompanha o código deste commit:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("[schema] Aplique as migrations de supabase/migrations (0002 a 0013) neste projeto antes do deploy.");
  process.exit(1);
}

console.log("[schema] Banco compatível com o build da Vercel.");
