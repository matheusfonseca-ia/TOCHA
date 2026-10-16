// Confere o RLS com dois usuários de teste reais (criados à mão no Supabase,
// sem assinatura). Uso:
//   TENANT_A_EMAIL=... TENANT_A_PASSWORD=... TENANT_B_EMAIL=... TENANT_B_PASSWORD=... node scripts/check-tenant-isolation.mjs
// A precisa ter ao menos uma linha em ig_accounts (pode ser inserida à mão
// com status 'disconnected'). B tenta ler tudo de A e não pode ver nada.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function login(email, password) {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

const a = await login(process.env.TENANT_A_EMAIL, process.env.TENANT_A_PASSWORD);
const b = await login(process.env.TENANT_B_EMAIL, process.env.TENANT_B_PASSWORD);

const { data: aAccounts } = await a.from("ig_accounts").select("id");
if (!aAccounts?.length) throw new Error("A não tem ig_accounts; crie uma linha antes.");
const aIds = aAccounts.map((r) => r.id);

const tables = ["ig_accounts", "rules", "sequences", "sequence_runs", "conversations", "interactions", "contacts",
  "messages", "quick_replies", "crm_notes", "crm_tags", "pipelines", "leads", "message_presets", "folders", "sequence_versions"];

let failures = 0;
for (const table of tables) {
  const column = table === "ig_accounts" ? "id" : "account_id";
  const { data, error } = await b.from(table).select("*").in(column, aIds).limit(1);
  if (error) console.log(`ok   ${table} (erro: ${error.message})`);
  else if (data.length) { failures++; console.log(`FAIL ${table}: B leu dado de A`); }
  else console.log(`ok   ${table}`);
}

const { data: subs } = await b.from("subscriptions").select("user_id");
const { data: { user: bUser } } = await b.auth.getUser();
if (subs?.some((s) => s.user_id !== bUser.id)) { failures++; console.log("FAIL subscriptions: B leu assinatura alheia"); }

// Escrita direta em ig_accounts pela API (migration 0017): tem que ser recusada.
// Sem isso, um usuário "reserva" o @ de outra pessoa ou desvia os eventos do webhook.
const forged = await b.from("ig_accounts").insert({
  user_id: bUser.id, ig_user_id: "99999999999999", ig_username: "teste_isolamento",
  access_token_enc: "x", status: "disconnected",
}).select();
if (!forged.error && forged.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: B conseguiu INSERIR uma conta direto pela API (0017 não aplicada?)");
  await b.from("ig_accounts").delete().eq("id", forged.data[0].id);
} else console.log("ok   ig_accounts: insert direto recusado");

const { data: before } = await a.from("ig_accounts").select("ig_username").eq("id", aIds[0]).single();
const tamper = await a.from("ig_accounts").update({ ig_username: "alterado_pela_api" }).eq("id", aIds[0]).select();
if (!tamper.error && tamper.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: A conseguiu ALTERAR a própria conta direto pela API (0017 não aplicada?)");
  await a.from("ig_accounts").update({ ig_username: before.ig_username }).eq("id", aIds[0]);
} else console.log("ok   ig_accounts: update direto recusado");

const { error: signUpError } = await createClient(url, anon).auth.signUp({ email: `teste+${Date.now()}@falow.app.br`, password: "xxxxxxxx1" });
if (!signUpError) { failures++; console.log("FAIL cadastro público ainda aberto no Supabase"); } else console.log("ok   cadastro público fechado");

process.exit(failures ? 1 : 0);
