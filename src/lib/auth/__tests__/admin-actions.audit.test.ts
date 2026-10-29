import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Trava de auditoria do multiusuário. Toda server action exportada de um
 * arquivo "use server" que usa a service role precisa estar neste manifesto,
 * com a checagem de posse que faz antes de escrever. Action nova = teste
 * vermelho até alguém conferir a posse e registrar aqui.
 */
const ADMIN_ACTIONS: Record<string, string> = {
  "app/(dashboard)/accounts/actions.ts#disconnectAccount": "ownedAccountId",
  "app/admin/actions.ts#grantCourtesyAction": "requireAdmin",
  "app/admin/actions.ts#revokeCourtesyAction": "requireAdmin",
  "app/admin/actions.ts#blockUserAction": "requireAdmin",
  "app/admin/actions.ts#unblockUserAction": "requireAdmin",
  "app/admin/actions.ts#resendAccessAction": "requireAdmin",
  "app/admin/actions.ts#inviteWithCourtesyAction": "requireAdmin",
  "modules/ai-settings/actions.ts#saveAiSettings": "getUser + hasActiveAccess; escreve só a linha do user_id da sessão",
  "modules/ai-settings/actions.ts#removeAiSettings": "só client do usuário (RLS)",
  "modules/crm/handoff/services/handoff.actions.ts#assumeConversation": "ownConversationId",
  "modules/crm/handoff/services/handoff.actions.ts#returnToBot": "ownConversationId",
  "modules/crm/history-import/services/history-import.actions.ts#importHistoryStep": "ig_accounts via client do usuário",
  "modules/crm/inbox/services/composer.actions.ts#sendMessage": "ownConversation",
  "modules/crm/inbox/services/composer.actions.ts#uploadComposerAttachment": "ownConversation",
  "modules/crm/inbox/services/inbox.actions.ts#markConversationRead": "conversations via client do usuário",
  "modules/crm/inbox/services/message-actions.ts#hideMessageForMe": "messages via client do usuário",
  "modules/crm/inbox/services/status.actions.ts#setConversationStatus": "ownConversationId",
  "modules/crm/lead-profile/services/lead-profile.actions.ts#refreshLeadPhoto": "conversations via client do usuário",
  "modules/crm/lead-profile/services/lead-profile.actions.ts#refreshLeadPhotos": "activeUserId + conversations via client do usuário",
  "modules/crm/notes/services/notes.actions.ts#createNote": "ownAccountId",
  "modules/crm/notes/services/notes.actions.ts#updateNote": "ownNoteAccountId",
  "modules/crm/notes/services/notes.actions.ts#deleteNote": "ownNoteAccountId",
  "modules/crm/pipeline/services/pipeline.actions.ts#moveLeadAction": "leads via client do usuário + moveLead filtra etapa por conta",
  "modules/crm/pipeline/services/pipeline.actions.ts#getLeadDetailAction": "só client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#loadMoreLeadsAction": "só client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#updateLeadValueAction": "leads via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#bringExistingConversationsAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#toggleAutoEnrollAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#createStageAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#updateStageAction": "pipeline_stages + sequences via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#reorderStagesAction": "pipelines via client do usuário + update filtrado por pipeline_id",
  "modules/crm/pipeline/services/pipeline.actions.ts#deleteStageAction": "pipeline_stages via client do usuário (origem e destino)",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#createQuickReply": "ownAccountId",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#updateQuickReply": "ownQuickReplyAccountId",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#deleteQuickReply": "ownQuickReplyAccountId",
  "modules/crm/tags/services/contact-fields.actions.ts#saveContactField": "assertOwnsAccount",
  "modules/crm/tags/services/contact-fields.actions.ts#deleteContactField": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#openTagManager": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#createTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#renameTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#updateTagColor": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#deleteTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#getTagWorkflowUsage": "só client do usuário (RLS)",
  "modules/crm/tags/services/tags.actions.ts#applyTagToLead": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#applyTagToLeadsBulk": "assertOwnsAccount",
};

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Resolve um import `@/x` ou relativo para o arquivo .ts/.tsx em src (pacotes externos: null). */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const ADMIN_CLIENT_MODULE = path.join(SRC, "lib", "supabase", "admin.ts");

/**
 * O arquivo usa a service role, direto (`createAdminClient` no texto) ou por
 * um módulo que importa (um nível: helper com `admin = createAdminClient()`
 * como parâmetro padrão escaparia de uma busca só pela literal). `import type`
 * não conta: não executa nada.
 */
function usesServiceRole(file: string, text: string): boolean {
  if (text.includes("createAdminClient")) return true;
  for (const m of text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) {
    const target = resolveImport(file, m[1]);
    if (target && target !== ADMIN_CLIENT_MODULE && readFileSync(target, "utf8").includes("createAdminClient")) return true;
  }
  return false;
}

describe("auditoria das server actions com service role", () => {
  const found: string[] = [];
  // Outras formas de export (`export const f = async`, `export default`, `export { f }`)
  // escapariam da varredura: em TODO arquivo "use server" só vale `export async function`.
  const otherExports: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use server["']/m.test(text)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    for (const m of text.matchAll(/^export (?!async function|type |interface )(.+)$/gm)) {
      otherExports.push(`${rel}: export ${m[1]}`);
    }
    if (!usesServiceRole(file, text)) continue;
    for (const m of text.matchAll(/export async function (\w+)/g)) found.push(`${rel}#${m[1]}`);
  }

  it("toda action com service role está no manifesto", () => {
    expect(found.filter((k) => !(k in ADMIN_ACTIONS))).toEqual([]);
  });

  it("o manifesto não lista action que não existe mais", () => {
    expect(Object.keys(ADMIN_ACTIONS).filter((k) => !found.includes(k))).toEqual([]);
  });

  it("arquivos 'use server' só exportam async function (ou tipos)", () => {
    expect(otherExports).toEqual([]);
  });

  it("createAdminClient() como parâmetro padrão só nos helpers já conhecidos", () => {
    // Parâmetro padrão esconde a service role de quem chama. Novo uso = revisar
    // quem importa o helper (e, se for action, registrar no manifesto).
    const KNOWN = new Set(["lib/expiry/sweep.ts"]);
    const offenders = walk(SRC)
      .filter((file) => /=\s*createAdminClient\(\)\s*[,)]/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file).split(path.sep).join("/"))
      .filter((rel) => !KNOWN.has(rel));
    expect(offenders).toEqual([]);
  });
});

describe("auditoria das actions do painel /admin", () => {
  // Primeira instrução do corpo (até o primeiro `;`) precisa ser a trava de admin.
  const FIRST_STATEMENT = /^\s*(const\s*\{\s*adminId\s*\}\s*=\s*await\s+requireAdmin\(|return\s+guarded\()/;
  const ADMIN_DIR = path.join(SRC, "app", "admin");
  const unguarded: string[] = [];
  let checked = 0;
  for (const file of walk(ADMIN_DIR)) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use server["']/m.test(text)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    for (const m of text.matchAll(/export async function (\w+)\s*\([^)]*\)[^{]*\{([^;]*;)/g)) {
      checked++;
      if (!FIRST_STATEMENT.test(m[2])) unguarded.push(`${rel}#${m[1]}`);
    }
  }

  it("toda action de src/app/admin começa com requireAdmin() ou guarded()", () => {
    expect(checked).toBeGreaterThan(0);
    expect(unguarded).toEqual([]);
  });
});
