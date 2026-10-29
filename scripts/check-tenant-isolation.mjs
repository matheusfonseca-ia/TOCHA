// Confere o RLS com dois usuários de teste reais (criados à mão no Supabase,
// sem assinatura). Uso:
//   TENANT_A_EMAIL=... TENANT_A_PASSWORD=... TENANT_B_EMAIL=... TENANT_B_PASSWORD=... node scripts/check-tenant-isolation.mjs
//
// Pré-requisitos:
// - A precisa ter ao menos uma linha em ig_accounts (pode ser inserida à mão
//   com status 'disconnected'): é nela que o ataque de update é testado.
//   O script cria e apaga uma pasta temporária ("teste_isolamento") nessa
//   conta para testar a troca de account_id; nada mais de A é alterado.
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

// Todas as tabelas de public criadas nas migrations (0001 a 0024), menos
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
// access_grants: desde a 0024 o usuário só tem SELECT em algumas colunas
// (`select=*` dá 42501); lê as permitidas para a checagem de vazamento valer.
const selectColumns = { access_grants: "user_id, kind, expires_at, created_at" };

for (const table of tables) {
  const { data, error } = await b.from(table).select(selectColumns[table] ?? "*").limit(1);
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

// ── Escrita cruzada e escrita em tabelas só do servidor (A1-044) ─────────────
// Recusa do RLS/privilégio vem como 42501. Qualquer sucesso é FAIL (e o script
// tenta desfazer). Outro erro não prova a recusa: INCONCLUSIVO.
function writeResult(label, error, succeeded, cleanupHint) {
  if (succeeded) {
    failures++;
    console.log(`FAIL ${label}: escrita ACEITA pela API${cleanupHint ? ` (${cleanupHint})` : ""}`);
  } else if (error?.code === "42501") {
    console.log(`ok   ${label}: recusado`);
  } else {
    inconclusive++;
    console.log(`INCONCLUSIVO ${label}: resposta inesperada (${error ? `${error.code ?? "sem código"}: ${error.message}` : "sem erro e sem linha"}). Rode de novo.`);
  }
}

const MARK = "teste_isolamento";
const aAccount = aIds[0];
const fakeUuid = "00000000-0000-4000-8000-000000000000";

// 1) B insere linhas na conta de A, em toda tabela com account_id. Nas que têm
//    policy de escrita, o `with check` tem que barrar; nas outras, a falta de
//    policy/privilégio.
const crossInserts = {
  rules: { account_id: aAccount, keyword: MARK, reply_text: MARK },
  sequences: { account_id: aAccount, name: MARK, graph: { nodes: [], edges: [] }, is_active: false },
  sequence_versions: { account_id: aAccount, sequence_id: fakeUuid, name: MARK, graph: { nodes: [], edges: [] } },
  folders: { account_id: aAccount, name: MARK },
  message_presets: { account_id: aAccount, scope: "text", label: MARK, text: MARK },
  quick_replies: { account_id: aAccount, title: MARK, text: MARK },
  crm_notes: { account_id: aAccount, ig_sender_id: "0", text: MARK },
  crm_tags: { account_id: aAccount, name: MARK },
  contacts: { account_id: aAccount, ig_sender_id: MARK },
  conversations: { account_id: aAccount, ig_sender_id: MARK },
  interactions: { account_id: aAccount, ig_sender_id: MARK, status: "no_match" },
  pipelines: { account_id: aAccount, name: MARK },
};
for (const [table, row] of Object.entries(crossInserts)) {
  const { data, error } = await b.from(table).insert(row).select("id");
  const id = data?.[0]?.id;
  if (id) await b.from(table).delete().eq("id", id);
  writeResult(`${table} insert de B na conta de A`, error, Boolean(id), id ? `linha ${id}: confira se foi apagada` : "");
}

// 2) B tenta alterar linhas de A (sem mudar valor nenhum): o RLS tem que
//    filtrar tudo (0 linhas) ou negar.
for (const table of ["rules", "sequences", "sequence_versions", "folders", "message_presets",
  "quick_replies", "crm_notes", "crm_tags", "contacts", "conversations"]) {
  const { data, error } = await b.from(table).update({ account_id: aAccount }).eq("account_id", aAccount).select("id");
  if (error && error.code !== "42501") {
    inconclusive++;
    console.log(`INCONCLUSIVO ${table} update de B: ${error.code ?? "sem código"}: ${error.message}. Rode de novo.`);
  } else if (!error && data?.length) {
    failures++;
    console.log(`FAIL ${table}: B ALTEROU ${data.length} linha(s) de A (valor reescrito igual, sem dano)`);
  } else console.log(`ok   ${table}: update de B nas linhas de A não alcança nada`);
}

// 3) A tenta mover uma linha própria para outra conta (account_id que não é
//    dele): o `with check` tem que recusar. Usa uma pasta temporária.
{
  const { data: folder, error: folderError } = await a.from("folders").insert({ account_id: aAccount, name: MARK }).select("id").single();
  if (folderError || !folder) {
    inconclusive++;
    console.log(`INCONCLUSIVO folders: não consegui criar a pasta de teste de A (${folderError?.message ?? "sem linha"}).`);
  } else {
    const { data: moved, error: moveError } = await a.from("folders").update({ account_id: fakeUuid }).eq("id", folder.id).select("id");
    if (moveError?.code === "42501") console.log("ok   folders: A não move linha para conta alheia (with check)");
    else if (moveError?.code === "23503") {
      failures++;
      console.log("FAIL folders: o RLS deixou trocar account_id para conta alheia (só a FK segurou porque o id era falso)");
    } else if (!moveError && moved?.length) {
      failures++;
      console.log("FAIL folders: A moveu a pasta para outra conta");
    } else {
      inconclusive++;
      console.log(`INCONCLUSIVO folders move: ${moveError ? `${moveError.code ?? "sem código"}: ${moveError.message}` : "sem erro e sem linha"}.`);
    }
    const { error: delError } = await a.from("folders").delete().eq("id", folder.id);
    if (delError) console.log(`AVISO a pasta de teste ${folder.id} ("${MARK}") ficou na conta de A: apague à mão.`);
  }
}

// 4) B grava nas tabelas que só o servidor escreve, com o PRÓPRIO user_id.
//    user_ai_settings (0024): sem isso, grava chave/modelo pulando a validação.
//    access_grants/subscriptions: sem isso, B se daria cortesia/assinatura.
const ownInserts = [
  ["user_ai_settings", { user_id: bUser.id, api_key_enc: MARK }, "user_id"],
  ["access_grants", { user_id: bUser.id, kind: "courtesy", reason: MARK, granted_by: bUser.id }, "user_id"],
  ["subscriptions", { user_id: bUser.id, stripe_customer_id: `cus_${MARK}`, status: "active" }, "user_id"],
  ["admin_audit_log", { admin_id: bUser.id, action: "block", target_user_id: bUser.id }, null],
  ["processed_events", { mid: MARK }, "mid"],
  ["stripe_events", { id: MARK }, "id"],
];
for (const [table, row, key] of ownInserts) {
  const { error } = await b.from(table).insert(row);
  if (!error && key) await b.from(table).delete().eq(key, row[key]);
  writeResult(`${table} insert de B`, error, !error, !error ? `apague a linha de teste de ${table} se ainda existir` : "");
}
{
  const { data, error } = await b.from("user_ai_settings").update({ model: MARK }).eq("user_id", bUser.id).select("user_id");
  if (error?.code === "42501" || (!error && !data?.length)) console.log("ok   user_ai_settings: update de B recusado");
  else if (!error) {
    failures++;
    console.log("FAIL user_ai_settings: B alterou a própria linha direto pela API (0024 não aplicada?)");
  } else {
    inconclusive++;
    console.log(`INCONCLUSIVO user_ai_settings update: ${error.code ?? "sem código"}: ${error.message}.`);
  }
}

// 5) access_grants: reason e granted_by são internos (0024). A leitura tem que
//    dar 42501 mesmo sem linha (privilégio de coluna, não RLS).
for (const column of ["reason", "granted_by"]) {
  const { error } = await b.from("access_grants").select(column).limit(1);
  if (error?.code === "42501") console.log(`ok   access_grants.${column}: leitura negada`);
  else if (!error) {
    failures++;
    console.log(`FAIL access_grants.${column}: o usuário consegue ler a coluna (0024 não aplicada?)`);
  } else {
    inconclusive++;
    console.log(`INCONCLUSIVO access_grants.${column}: ${error.code ?? "sem código"}: ${error.message}.`);
  }
}

// 6) Funções só da service role: authenticated tem que levar 42501. Os
//    argumentos são inofensivos se a função rodasse (tag inexistente, e-mail
//    inexistente, retenção de 100 anos).
const rpcs = [
  ["crm_tag_rename", { p_account_id: aAccount, p_old_name: `${MARK}_x`, p_new_name: `${MARK}_y` }],
  ["crm_tag_remove", { p_account_id: aAccount, p_tag_name: `${MARK}_x` }],
  ["falow_user_id_by_email", { p_email: `${MARK}@invalido.local` }],
  ["falow_prune_old_events", { p_days: 36500 }],
  ["falow_rls_report", {}],
];
for (const [fn, args] of rpcs) {
  const { error } = await b.rpc(fn, args);
  if (error?.code === "42501") console.log(`ok   rpc ${fn}: negado para usuário`);
  else if (!error) {
    failures++;
    console.log(`FAIL rpc ${fn}: usuário logado conseguiu executar`);
  } else if (error.code === "PGRST202" || error.code === "42883") {
    inconclusive++;
    console.log(`INCONCLUSIVO rpc ${fn}: função não existe (aplique a migration que a cria).`);
  } else {
    inconclusive++;
    console.log(`INCONCLUSIVO rpc ${fn}: ${error.code ?? "sem código"}: ${error.message}.`);
  }
}

// 7) Bucket crm-uploads: público para LER por URL (a Meta baixa o anexo), mas
//    ninguém pode LISTAR os arquivos (exigiria policy em storage.objects).
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
for (const [label, client, prefix] of [["anon", anonClient, ""], ["anon", anonClient, aAccount], ["B", b, ""], ["B", b, aAccount]]) {
  const { data, error } = await client.storage.from("crm-uploads").list(prefix, { limit: 1 });
  if (!error && data?.length) {
    failures++;
    console.log(`FAIL crm-uploads: ${label} listou arquivos em "${prefix || "/"}" (policy de select em storage.objects?)`);
  } else console.log(`ok   crm-uploads: ${label} não lista "${prefix || "/"}"`);
}

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
