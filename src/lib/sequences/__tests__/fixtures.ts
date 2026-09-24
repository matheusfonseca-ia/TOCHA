import { randomUUID } from "node:crypto";

import { encryptToken } from "@/lib/crypto";
import type { IgAccount, Rule } from "@/types/database";
import {
  OUT_HANDLE,
  buttonHandle,
  quickReplyHandle,
  type AutomationNodeData,
  type ButtonsNodeData,
  type MessageNodeData,
  type Sequence,
  type SequenceGraph,
  type SequenceGraphEdge,
  type SequenceGraphNode,
  type SequenceNodeData,
  type SequenceNodeType,
  type TriggerNodeData,
  type TriggerSource,
  type WaitReplyNodeData,
} from "@/types/sequence";

/**
 * Fixtures compartilhadas pelos testes de integração de `process.ts` e
 * `runtime.ts`. Fica fora de `fake-supabase.ts` porque aquele arquivo é só o
 * fake do client — isto aqui é dado de teste.
 */

// getFreshToken (src/lib/meta/token.ts) descriptografa o token de toda conta
// antes de qualquer envio, mesmo quando o envio em si está mockado — por
// isso toda conta de teste precisa de um access_token_enc de verdade.
process.env.TOKEN_ENCRYPTION_KEY ??= "a".repeat(64);

export function node(
  id: string,
  type: SequenceNodeType,
  data: SequenceNodeData
): SequenceGraphNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

export function edge(source: string, target: string, handle = OUT_HANDLE): SequenceGraphEdge {
  return { id: `${source}-${handle}-${target}`, source, sourceHandle: handle, target };
}

export const triggerNode = (
  data: Partial<TriggerNodeData & { source: TriggerSource }> = {}
): SequenceGraphNode =>
  node("trigger", "trigger", {
    anyMessage: false,
    keyword: "oi",
    matchType: "contains",
    ...data,
  });

export const messageNode = (id: string, text = "Olá"): SequenceGraphNode =>
  node(id, "message", { kind: "text", text, imageUrl: "" } satisfies MessageNodeData);

export const waitReplyNode = (id: string): SequenceGraphNode =>
  node(id, "waitReply", {} satisfies WaitReplyNodeData);

export const automationNode = (id: string, ruleId: string): SequenceGraphNode =>
  node(id, "automation", { ruleId } satisfies AutomationNodeData);

export const branchButtonsNode = (id: string, text = "Escolha", title = "Opção A"): SequenceGraphNode =>
  node(id, "buttons", {
    text,
    buttons: [{ title, kind: "branch", url: "" }],
  } satisfies ButtonsNodeData);

export { OUT_HANDLE, buttonHandle, quickReplyHandle };

export function makeAccount(overrides: Partial<IgAccount> = {}): IgAccount {
  return {
    id: overrides.id ?? randomUUID(),
    user_id: "user-1",
    ig_user_id: "17841400000000000",
    ig_username: "conta_teste",
    page_id: null,
    page_name: null,
    profile_picture_url: null,
    access_token_enc: encryptToken("token-valido-de-teste"),
    // Bem longe do limiar de renovação (15 dias) — getFreshToken não chama
    // refreshLongLivedToken (rede real) durante os testes.
    token_expires_at: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
    status: "active",
    connected_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeRule(overrides: Partial<Rule> = {}): Rule {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? randomUUID(),
    account_id: overrides.account_id ?? "acc-1",
    name: "Regra de teste",
    trigger_type: "dm",
    keyword: "oi",
    match_type: "contains",
    media_mode: null,
    media_refs: null,
    comment_any_word: false,
    public_reply_enabled: false,
    public_reply_text: null,
    public_reply_variants: null,
    welcome_text: null,
    welcome_text_variants: null,
    welcome_button_label: null,
    reply_type: "text",
    reply_text: "Resposta da regra",
    reply_image_url: null,
    reply_buttons: null,
    delay_seconds: 2,
    is_active: true,
    priority: 0,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeGraph(nodes: SequenceGraphNode[], edges: SequenceGraphEdge[]): SequenceGraph {
  return { nodes, edges };
}

export function makeSequence(overrides: Partial<Sequence> = {}): Sequence {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? randomUUID(),
    account_id: overrides.account_id ?? "acc-1",
    name: overrides.name ?? "Fluxo de teste",
    graph:
      overrides.graph ??
      makeGraph([triggerNode(), messageNode("m1")], [edge("trigger", "m1")]),
    is_active: overrides.is_active ?? true,
    entry_rule_id: overrides.entry_rule_id ?? null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Linha crua para semear uma tabela do fake diretamente (id sempre presente). */
export function row<T extends Record<string, unknown>>(data: T): T & { id: string } {
  return { id: randomUUID(), ...data };
}

/**
 * Linha de `conversations` com a janela de 24h aberta agora — todo nó que
 * manda mensagem (`ensureWindowOpen` em runtime.ts) exige isso. Fora do
 * pipeline de webhook (que chama `touchConversation` sozinho), os testes do
 * runtime precisam semear isto manualmente antes de iniciar/retomar um fluxo.
 */
export function makeOpenConversation(accountId: string, senderId: string) {
  return row({
    account_id: accountId,
    ig_sender_id: senderId,
    last_inbound_at: new Date().toISOString(),
  });
}
