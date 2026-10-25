// Confere o RLS com dois usuários de teste reais (criados à mão no Supabase,
// sem assinatura). Uso:
//   TENANT_A_EMAIL=... TENANT_A_PASSWORD=... TENANT_B_EMAIL=... TENANT_B_PASSWORD=... node scripts/check-tenant-isolation.mjs
//
// Pré-requisitos:
// - A precisa ter ao menos uma linha em ig_accounts (pode ser inserida à mão
//   com status 'disconnected'): é nela que o ataque de update é testado.
// - B tem que ser um usuário RECÉM-CRIADO e VAZIO: sem conta de Instagram, sem
//   assinatura, sem dados. Como B não é dono de nada, qualquer linha que ele
//   enxergar em qualquer tabela é vazamento (os dados reais do dono e dos
//   clientes em produção servem de isca). Se B tiver dados próprios, o script
//   acusa FAIL por engano: use um usuário novo.
//
// Códigos de saída:
//   0 = tudo certo;
//   1 = pelo menos um FAIL (problema de segurança);
//   2 = nenhum FAIL, mas alguma checagem ficou INCONCLUSIVA (erro que não é
//       "acesso negado": JWT, 5xx, rede...). Não vale como aprovada: rode de novo;
//   3 = PRÉ-REQUISITO FALHOU (variáveis faltando, login de A ou B, ou A sem
//       linha em ig_accounts): nada foi testado.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function prerequisiteFailed(message) {
  console.log(`PRÉ-REQUISITO FALHOU: ${message}`);
  process.exit(3);
}

if (!url || !anon) prerequisiteFailed("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente no .env.local.");

async function login(label, email, password) {
  if (!email || !password) prerequisiteFailed(`TENANT_${label}_EMAIL ou TENANT_${label}_PASSWORD não definido.`);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) prerequisiteFailed(`login de ${label} (${email}) recusado: ${error.message}`);
  return client;
}

const a = await login("A", process.env.TENANT_A_EMAIL, process.env.TENANT_A_PASSWORD);
const b = await login("B", process.env.TENANT_B_EMAIL, process.env.TENANT_B_PASSWORD);

const { data: aAccounts, error: aAccountsError } = await a.from("ig_accounts").select("id");
if (aAccountsError) prerequisiteFailed(`não consegui ler as ig_accounts de A (${aAccountsError.message}).`);
if (!aAccounts?.length) prerequisiteFailed("A não tem ig_accounts; crie a linha de teste antes (passo 2 do runbook).");
const aIds = aAccounts.map((r) => r.id);

const { data: { user: bUser }, error: bUserError } = await b.auth.getUser();
if (bUserError || !bUser) prerequisiteFailed(`não consegui ler o usuário B (${bUserError?.message ?? "sem usuário"}).`);

// Todas as tabelas de public criadas nas migrations (0001 a 0022), menos
// subscriptions, que tem checagem própria logo abaixo (com mensagem própria
// para o caso de B não ser um usuário vazio).
const tables = [
  "ig_accounts", "rules", "rule_triggers", "conversations", "processed_events",
  "sequences", "sequence_runs", "sequence_versions", "interactions", "contacts",
  "messages", "message_signals_pending", "quick_replies", "crm_notes", "crm_tags",
  "pipelines", "pipeline_stages", "leads", "lead_stage_events",
  "message_presets", "folders", "user_ai_settings", "stripe_events", "access_grants",
  "admin_audit_log",
];

let failures = 0;
let inconclusive = 0;

// Erro numa leitura de B. Só "permission denied" (42501) é acesso negado, que
// também é isolamento. Tabela inexistente (nome errado, migration faltando) é
// checagem furada = FAIL. Qualquer outro erro (JWT, 5xx, rede) não prova nada.
function readError(table, error) {
  if (error.code === "42501") {
    console.log(`ok   ${table} (acesso negado: ${error.message})`);
  } else if (error.code === "42P01" || error.code === "PGRST205") {
    failures++;
    console.log(`FAIL ${table}: tabela não encontrada (${error.message})`);
  } else {
    inconclusive++;
    console.log(`INCONCLUSIVO ${table}: a leitura falhou sem ser acesso negado (${error.code ?? "sem código"}: ${error.message}). Rode de novo.`);
  }
}

// Leitura: B não é dono de nada, então QUALQUER linha visível é vazamento.
// Sem filtro por conta: não dependemos de A ter dados em cada tabela.
for (const table of tables) {
  const { data, error } = await b.from(table).select("*").limit(1);
  if (error) readError(table, error);
  else if (data?.length) {
    failures++;
    console.log(`FAIL ${table}: B enxergou linha (B deveria estar vazio; se B é um usuário novo, é vazamento)`);
  } else console.log(`ok   ${table}`);
}

// subscriptions: B não tem assinatura, então também não pode ver nenhuma linha
// (nem a dele, nem a de outros).
const { data: subs, error: subsError } = await b.from("subscriptions").select("user_id").limit(1);
if (subsError) readError("subscriptions", subsError);
else if (subs?.length) {
  failures++;
  console.log("FAIL subscriptions: B enxergou assinatura (de outro usuário = vazamento; dele = B não é um usuário vazio)");
} else console.log("ok   subscriptions");

// Escrita direta em ig_accounts pela API (migration 0022): tem que ser recusada.
// Sem isso, um usuário "reserva" o @ de outra pessoa ou desvia os eventos do webhook.
const forged = await b.from("ig_accounts").insert({
  user_id: bUser.id, ig_user_id: "99999999999999", ig_username: "teste_isolamento",
  access_token_enc: "x", status: "disconnected",
}).select();
if (!forged.error && forged.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: B conseguiu INSERIR uma conta direto pela API (0022 não aplicada?)");
  await b.from("ig_accounts").delete().eq("id", forged.data[0].id);
} else if (forged.error?.code === "42501") {
  console.log("ok   ig_accounts: insert direto recusado");
} else {
  // Recusa do RLS vem como 42501; outro erro (ou nenhum erro sem linha) não prova a recusa.
  inconclusive++;
  console.log(`INCONCLUSIVO ig_accounts insert: resposta inesperada (${forged.error ? `${forged.error.code ?? "sem código"}: ${forged.error.message}` : "sem erro e sem linha"}). Rode de novo.`);
}

const { data: before, error: beforeError } = await a.from("ig_accounts").select("ig_username").eq("id", aIds[0]).single();
if (beforeError || !before) {
  console.log(`AVISO não consegui ler o @ atual da conta de A (${beforeError?.message ?? "sem linha"}): se o update abaixo passar, o restauro automático fica desligado e o @ de teste precisa ser corrigido à mão.`);
}
const tamper = await a.from("ig_accounts").update({ ig_username: "alterado_pela_api" }).eq("id", aIds[0]).select();
if (tamper.error && tamper.error.code !== "42501") {
  // Sem policy de update o RLS filtra as linhas (0 alteradas, sem erro) ou nega (42501).
  inconclusive++;
  console.log(`INCONCLUSIVO ig_accounts update: a chamada falhou sem ser acesso negado (${tamper.error.code ?? "sem código"}: ${tamper.error.message}). Rode de novo.`);
} else if (!tamper.error && tamper.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: A conseguiu ALTERAR a própria conta direto pela API (0022 não aplicada?)");
  if (before?.ig_username != null) {
    await a.from("ig_accounts").update({ ig_username: before.ig_username }).eq("id", aIds[0]);
  } else {
    console.log(`AVISO restauro não feito: a conta ${aIds[0]} ficou com ig_username = alterado_pela_api. Corrija à mão ou apague a linha de teste.`);
  }
} else console.log("ok   ig_accounts: update direto recusado");

// Cadastro público: só vale como "fechado" se o erro for o de cadastro desativado.
// Qualquer outro erro (ex.: limite de e-mails, rede) não prova nada.
const { data: signUpData, error: signUpError } = await createClient(url, anon, { auth: { persistSession: false } })
  .auth.signUp({ email: `teste+${Date.now()}@falow.app.br`, password: "xxxxxxxx1" });
if (!signUpError) {
  failures++;
  console.log(`FAIL cadastro público ainda aberto no Supabase (criou o usuário ${signUpData?.user?.email ?? "?"}: apague-o em Authentication -> Users)`);
} else if (signUpError.code === "signup_disabled" || /signups? not allowed/i.test(signUpError.message ?? "")) {
  console.log("ok   cadastro público fechado");
} else {
  inconclusive++;
  console.log(`INCONCLUSIVO cadastro público: o erro não foi o de cadastro desativado (${signUpError.code ?? "sem código"}: ${signUpError.message}). Isto NÃO conta como aprovado: confira "Allow new users to sign up" no Supabase e rode de novo.`);
}

if (failures) console.log(`\n${failures} FAIL: problema de segurança, não abra a venda.`);
else if (inconclusive) console.log(`\nNenhum FAIL, mas ${inconclusive} checagem(ns) inconclusiva(s): não vale como aprovado.`);
else console.log("\nTudo ok.");

process.exit(failures ? 1 : inconclusive ? 2 : 0);
