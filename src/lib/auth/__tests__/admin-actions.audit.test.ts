import { readdirSync, readFileSync, statSync } from "node:fs";
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
  "modules/crm/handoff/services/handoff.actions.ts#assumeConversation": "ownConversationId",
  "modules/crm/handoff/services/handoff.actions.ts#returnToBot": "ownConversationId",
  "modules/crm/history-import/services/history-import.actions.ts#importHistoryStep": "ig_accounts via client do usuário",
  "modules/crm/inbox/services/composer.actions.ts#sendMessage": "ownConversation",
  "modules/crm/inbox/services/composer.actions.ts#uploadComposerAttachment": "ownConversation",
  "modules/crm/inbox/services/inbox.actions.ts#markConversationRead": "conversations via client do usuário",
  "modules/crm/inbox/services/message-actions.ts#hideMessageForMe": "messages via client do usuário",
  "modules/crm/inbox/services/status.actions.ts#setConversationStatus": "ownConversationId",
  "modules/crm/lead-profile/services/lead-profile.actions.ts#refreshLeadPhoto": "conversations via client do usuário",
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

describe("auditoria das server actions com service role", () => {
  const found: string[] = [];
  // Outras formas de export (`export const f = async`, `export default`, `export { f }`)
  // escapariam da varredura acima: nesses arquivos só vale `export async function`.
  const otherExports: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use server["']/m.test(text) || !text.includes("createAdminClient")) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    for (const m of text.matchAll(/export async function (\w+)/g)) found.push(`${rel}#${m[1]}`);
    for (const m of text.matchAll(/^export (?!async function|type |interface )(.+)$/gm)) {
      otherExports.push(`${rel}: export ${m[1]}`);
    }
  }

  it("toda action com service role está no manifesto", () => {
    expect(found.filter((k) => !(k in ADMIN_ACTIONS))).toEqual([]);
  });

  it("o manifesto não lista action que não existe mais", () => {
    expect(Object.keys(ADMIN_ACTIONS).filter((k) => !found.includes(k))).toEqual([]);
  });

  it("arquivos 'use server' com service role só exportam async function (ou tipos)", () => {
    expect(otherExports).toEqual([]);
  });
});
