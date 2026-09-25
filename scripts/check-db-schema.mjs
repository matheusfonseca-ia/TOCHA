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
  conversations: ["automation_paused_until"],
  contacts: ["id", "account_id", "fields", "tags"],
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
  console.error("[schema] Aplique supabase/migrations/0002 a 0006 neste projeto antes do deploy.");
  process.exit(1);
}

console.log("[schema] Banco compatível com o build da Vercel.");
