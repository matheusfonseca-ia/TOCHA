import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import {
  automationNode,
  edge,
  makeAccount,
  makeOpenConversation,
  makeRule,
  makeSequence,
  messageNode,
  row,
  triggerNode,
  waitReplyNode,
} from "@/lib/sequences/__tests__/fixtures";
import { FOLLOW_GATE_DEFAULTS } from "@/lib/follow-gate/copy";
import { GraphApiError } from "@/lib/meta/graph";
import { processWebhookPayload, type MetaWebhookPayload } from "@/lib/meta/process";
import type { IgAccount, Rule } from "@/types/database";

/**
 * QA adversarial do portão "Seguir para liberar" (backend). Mesmo setup de
 * mocks de process.test.ts: Supabase admin em memória, Graph API e
 * sendRuleReply mockados, sleep instantâneo.
 *
 * Os casos com comentário acima do `it` descrevendo um bug são regressões
 * de bugs reais achados nesta revisão (25/09/2026) e já corrigidos.
 */

const { getAdmin, setAdmin } = vi.hoisted(() => {
  let current: unknown = null;
  return {
    getAdmin: () => current,
    setAdmin: (value: unknown) => {
      current = value;
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => getAdmin(),
}));

const {
  sendRuleReplyMock,
  sendTextMessageMock,
  sendImageMessageMock,
  sendButtonsMessageMock,
  sendPrivateReplyWithButtonMock,
  replyToCommentMock,
  sendQuickRepliesMessageMock,
  sendTemplateButtonsMessageMock,
  sendTypingActionMock,
  getFollowsBusinessMock,
} = vi.hoisted(() => ({
  sendRuleReplyMock: vi.fn(
    async (_token: string, _recipientId: string, _rule: { id: string; reply_text: string | null }) => {}
  ),
  sendTextMessageMock: vi.fn(async (_token: string, _recipientId: string, _text: string) => {}),
  sendImageMessageMock: vi.fn(async () => {}),
  sendButtonsMessageMock: vi.fn(async () => {}),
  sendPrivateReplyWithButtonMock: vi.fn(async () => {}),
  replyToCommentMock: vi.fn(async () => {}),
  sendQuickRepliesMessageMock: vi.fn(async () => {}),
  sendTemplateButtonsMessageMock: vi.fn(
    async (_token: string, _recipientId: string, _text: string, _buttons: unknown[]) => {}
  ),
  sendTypingActionMock: vi.fn(async () => {}),
  getFollowsBusinessMock: vi.fn(async (_token: string, _id: string) => true),
}));

vi.mock("@/lib/sequences/automation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sequences/automation")>();
  return { ...actual, sendRuleReply: sendRuleReplyMock };
});

vi.mock("@/lib/meta/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/graph")>();
  return {
    ...actual,
    sendTextMessage: sendTextMessageMock,
    sendImageMessage: sendImageMessageMock,
    sendButtonsMessage: sendButtonsMessageMock,
    sendPrivateReplyWithButton: sendPrivateReplyWithButtonMock,
    replyToComment: replyToCommentMock,
    sendQuickRepliesMessage: sendQuickRepliesMessageMock,
    sendTemplateButtonsMessage: sendTemplateButtonsMessageMock,
    sendTypingAction: sendTypingActionMock,
    getFollowsBusiness: getFollowsBusinessMock,
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, sleep: vi.fn(async () => {}) };
});

// Perfil atual da conta (o portão busca o @ na hora de montar o link).
const { getInstagramProfileMock } = vi.hoisted(() => ({
  getInstagramProfileMock: vi.fn(async (_token: string) => ({
    igUserId: "17841400000000000",
    username: "conta_teste",
    profilePictureUrl: null as string | null,
  })),
}));

vi.mock("@/lib/meta/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/oauth")>();
  return { ...actual, getInstagramProfile: getInstagramProfileMock };
});

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeAdmin();
  setAdmin(fake.client);
  vi.clearAllMocks();
  sendRuleReplyMock.mockImplementation(async () => {});
  sendTemplateButtonsMessageMock.mockImplementation(async () => {});
  getFollowsBusinessMock.mockImplementation(async () => true);
});

// ── Helpers ───────────────────────────────────────────────────────────────

const ENTRY_TEXT = "Continuação do fluxo";
const KEYWORD_FLOW_TEXT = "Fluxo por palavra-chave";
const HOUR = 60 * 60 * 1000;

function postback(
  account: IgAccount,
  senderId: string,
  mid: string | undefined,
  payload: string,
  timestamp = Date.now()
): MetaWebhookPayload {
  return {
    object: "instagram",
    entry: [
      {
        id: account.ig_user_id,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: account.ig_user_id },
            timestamp,
            postback: { ...(mid ? { mid } : {}), title: "botão", payload },
          },
        ],
      },
    ],
  };
}

function dm(
  account: IgAccount,
  senderId: string,
  mid: string,
  text: string,
  opts: { timestamp?: number; storyReply?: boolean } = {}
): MetaWebhookPayload {
  return {
    object: "instagram",
    entry: [
      {
        id: account.ig_user_id,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: account.ig_user_id },
            timestamp: opts.timestamp ?? Date.now(),
            message: {
              mid,
              text,
              is_echo: false,
              ...(opts.storyReply
                ? { reply_to: { story: { id: "story-1", url: "https://cdn/x.jpg" } } }
                : {}),
            },
          },
        ],
      },
    ],
  };
}

function comment(account: IgAccount, senderId: string, commentId: string, text: string): MetaWebhookPayload {
  return {
    object: "instagram",
    entry: [
      {
        id: account.ig_user_id,
        time: Math.floor(Date.now() / 1000),
        field: "comments",
        value: { id: commentId, text, from: { id: senderId }, media: { id: "media-1" } },
      },
    ],
  };
}

const followCheck = (rule: Rule) => `falow:follow_check:${rule.id}`;
const commentLink = (rule: Rule) => `falow:comment_link:${rule.id}`;
const sentAt = () => ({ follow_gate_sent_at: new Date().toISOString() });

function entrySequence(account: IgAccount, rule: Rule) {
  const sequence = makeSequence({
    account_id: account.id,
    entry_rule_id: rule.id,
    is_active: true,
    graph: {
      nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m2", ENTRY_TEXT)],
      edges: [edge("trigger", "m2")],
    },
  });
  fake.tables.sequences.push(sequence);
  return sequence;
}

function keywordSequence(account: IgAccount, keyword: string) {
  const sequence = makeSequence({
    account_id: account.id,
    is_active: true,
    graph: {
      nodes: [triggerNode({ source: "dm", keyword }), messageNode("k1", KEYWORD_FLOW_TEXT)],
      edges: [edge("trigger", "k1")],
    },
  });
  fake.tables.sequences.push(sequence);
  return sequence;
}

/** Conta + automação de DM "oi" com portão + workflow de entrada. */
function seedDm(overrides: Partial<Rule> = {}, accountOverrides: Partial<IgAccount> = {}) {
  const account = makeAccount(accountOverrides);
  const rule = makeRule({
    account_id: account.id,
    trigger_type: "dm",
    keyword: "oi",
    reply_text: "Resposta liberada",
    follow_gate_enabled: true,
    ...overrides,
  });
  fake.tables.ig_accounts.push(account);
  fake.tables.rules.push(rule);
  const entry = entrySequence(account, rule);
  return { account, rule, entry };
}

/** Conta + automação de comentário com portão + workflow de entrada. */
function seedComment(overrides: Partial<Rule> = {}, accountOverrides: Partial<IgAccount> = {}) {
  const account = makeAccount(accountOverrides);
  const rule = makeRule({
    account_id: account.id,
    trigger_type: "comment",
    keyword: "preço",
    media_mode: "any",
    welcome_text: "Vou te mandar o link!",
    welcome_button_label: "Quero o link",
    reply_text: "Aqui está: https://exemplo.com",
    follow_gate_enabled: true,
    ...overrides,
  });
  fake.tables.ig_accounts.push(account);
  fake.tables.rules.push(rule);
  const entry = entrySequence(account, rule);
  return { account, rule, entry };
}

function seedTrigger(rule: Rule, account: IgAccount, senderId: string, extra: Record<string, unknown> = {}) {
  const trigger = row({
    rule_id: rule.id,
    account_id: account.id,
    ig_sender_id: senderId,
    link_delivered_at: null,
    follow_gate_sent_at: null,
    ...extra,
  });
  fake.tables.rule_triggers.push(trigger);
  return trigger;
}

function textsSent(text: string): number {
  return (sendTextMessageMock.mock.calls as unknown as unknown[][]).filter((c) => c[2] === text).length;
}

function runsOf(sequenceId: string) {
  return fake.tables.sequence_runs.filter((r) => r.sequence_id === sequenceId);
}

function triggerOf(rule: Rule, senderId: string) {
  return fake.tables.rule_triggers.find((t) => t.rule_id === rule.id && t.ig_sender_id === senderId);
}

// ── 1. Toques simultâneos ─────────────────────────────────────────────────

describe("QA portão: toques simultâneos", () => {
  it("dois toques em Já segui ao mesmo tempo (mids diferentes): entrega 1x e workflow 1x", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-1", sentAt());

    await Promise.all([
      processWebhookPayload(postback(account, "s-1", "pb-1", followCheck(rule))),
      processWebhookPayload(postback(account, "s-1", "pb-2", followCheck(rule))),
    ]);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
    expect(textsSent(ENTRY_TEXT)).toBe(1);
    expect(triggerOf(rule, "s-1")?.link_delivered_at).not.toBeNull();
    const delivered = fake.tables.interactions.filter(
      (i) => i.message_text === "[conteúdo entregue após seguir a conta]"
    );
    expect(delivered).toHaveLength(1);
  });

  it("toque no botão do comentário e em Já segui ao mesmo tempo: entrega 1x", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-2", sentAt());

    await Promise.all([
      processWebhookPayload(postback(account, "s-2", "pb-1", commentLink(rule))),
      processWebhookPayload(postback(account, "s-2", "pb-2", followCheck(rule))),
    ]);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("DM retida: Já segui e palavra-chave de novo ao mesmo tempo entregam 1x e o workflow de entrada roda 1x", async () => {
    const { account, rule, entry } = seedDm();
    seedTrigger(rule, account, "s-3", sentAt());

    await Promise.all([
      processWebhookPayload(postback(account, "s-3", "pb-1", followCheck(rule))),
      processWebhookPayload(dm(account, "s-3", "m-1", "oi")),
    ]);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
    expect(textsSent(ENTRY_TEXT)).toBe(1);
  });

  it("dois toques em Já segui sem seguir: nenhum conteúdo, nenhum workflow, trava intacta", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-4", sentAt());
    getFollowsBusinessMock.mockImplementation(async () => false);

    await Promise.all([
      processWebhookPayload(postback(account, "s-4", "pb-1", followCheck(rule))),
      processWebhookPayload(postback(account, "s-4", "pb-2", followCheck(rule))),
    ]);

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(runsOf(entry.id)).toHaveLength(0);
    expect(triggerOf(rule, "s-4")?.link_delivered_at).toBeNull();
    expect(fake.tables.interactions.every((i) => i.status === "awaiting_follow")).toBe(true);
  });
});

// ── 2. Reentrega do webhook ───────────────────────────────────────────────

describe("QA portão: reentrega do postback", () => {
  it("mesmo mid reentregue (em sequência e em paralelo): processa 1x só", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-10", sentAt());

    const event = postback(account, "s-10", "pb-dup", followCheck(rule));
    await Promise.all([processWebhookPayload(event), processWebhookPayload(event)]);
    await processWebhookPayload(event);

    expect(getFollowsBusinessMock).toHaveBeenCalledTimes(1);
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
    expect(fake.tables.interactions).toHaveLength(2); // entrega + handoff do workflow
  });

  it("postback sem mid depois da entrega: não consulta a Meta nem reenvia", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-11", sentAt());

    await processWebhookPayload(postback(account, "s-11", "pb-1", followCheck(rule)));
    getFollowsBusinessMock.mockClear();
    await processWebhookPayload(postback(account, "s-11", undefined, followCheck(rule)));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
  });

  it("dois postbacks sem mid ao mesmo tempo: a trava atômica entrega 1x", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-12", sentAt());

    await Promise.all([
      processWebhookPayload(postback(account, "s-12", undefined, followCheck(rule))),
      processWebhookPayload(postback(account, "s-12", undefined, followCheck(rule))),
    ]);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });
});

// ── 3. Regra mudou entre o portão e o "Já segui" / payload ruim ────────────

describe("QA portão: regra alterada e payload inválido", () => {
  it("regra pausada entre o portão e o Já segui: nada sai e a trava não é tomada; reativada, entrega", async () => {
    const { account, rule, entry } = seedComment({ is_active: false });
    seedTrigger(rule, account, "s-20", sentAt());

    await processWebhookPayload(postback(account, "s-20", "pb-1", followCheck(rule)));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-20")?.link_delivered_at).toBeNull();

    fake.tables.rules[0].is_active = true;
    await processWebhookPayload(postback(account, "s-20", "pb-2", followCheck(rule)));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("regra excluída: Já segui não lança nem envia nada", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-21", sentAt());
    fake.tables.rules.length = 0;

    await expect(
      processWebhookPayload(postback(account, "s-21", "pb-1", followCheck(rule)))
    ).resolves.toBeUndefined();

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions).toHaveLength(0);
  });

  it("regra de outra conta no payload: não entrega nem mexe na trava da outra conta", async () => {
    const accountA = makeAccount({ ig_user_id: "ig-A" });
    const { account: accountB, rule: ruleB } = seedComment({}, { ig_user_id: "ig-B" });
    fake.tables.ig_accounts.push(accountA);
    seedTrigger(ruleB, accountB, "s-22", sentAt());

    await processWebhookPayload(postback(accountA, "s-22", "pb-1", followCheck(ruleB)));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(ruleB, "s-22")?.link_delivered_at).toBeNull();
    expect(fake.tables.interactions).toHaveLength(0);
  });

  it("payloads com lixo não lançam nem entregam", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-23", sentAt());

    const payloads = [
      "falow:follow_check:",
      "falow:follow_check:    ",
      "falow:follow_check:lixo-que-nao-existe",
      `falow:follow_check:${rule.id} extra`,
      `falow:follow_check:falow:comment_link:${rule.id}`,
      `FALOW:FOLLOW_CHECK:${rule.id}`,
      "falow:follow_check:'; drop table rules; --",
    ];
    for (const [i, payload] of payloads.entries()) {
      await expect(
        processWebhookPayload(postback(account, "s-23", `pb-lixo-${i}`, payload))
      ).resolves.toBeUndefined();
    }

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-23")?.link_delivered_at).toBeNull();
  });

  it("Já segui de quem nunca recebeu o portão (sem linha em rule_triggers): não entrega", async () => {
    const { account, rule } = seedDm();

    await processWebhookPayload(postback(account, "s-24", "pb-1", followCheck(rule)));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.rule_triggers).toHaveLength(0);
  });
});

// ── 4. Payload legado ─────────────────────────────────────────────────────

describe("QA portão: payload legado instareply:comment_link", () => {
  it("com portão ligado e sem seguir: manda o portão com o payload novo; Já segui depois de seguir entrega 1x", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-30");
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(postback(account, "s-30", "pb-1", `instareply:comment_link:${rule.id}`));

    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(1);
    const buttons = sendTemplateButtonsMessageMock.mock.calls[0][3] as { type: string; payload?: string }[];
    expect(buttons.find((b) => b.type === "postback")?.payload).toBe(followCheck(rule));
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-30")?.follow_gate_sent_at).not.toBeNull();

    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(postback(account, "s-30", "pb-2", followCheck(rule)));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("payload legado de uma regra de DM é ignorado (comment_link exige trigger_type comment)", async () => {
    const { account, rule } = seedDm();
    seedTrigger(rule, account, "s-31", sentAt());

    await processWebhookPayload(postback(account, "s-31", "pb-1", `instareply:comment_link:${rule.id}`));

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
  });
});

// ── 5. Pausar automações / workflow em andamento ──────────────────────────

describe("QA portão: pausa e workflow em andamento", () => {
  function pause(accountId: string, senderId: string) {
    fake.tables.conversations.push(
      row({
        account_id: accountId,
        ig_sender_id: senderId,
        last_inbound_at: new Date().toISOString(),
        automation_paused_until: new Date(Date.now() + HOUR).toISOString(),
      })
    );
  }

  it("DM com portão e pessoa pausada: não consulta, não manda portão, loga no_match", async () => {
    const { account } = seedDm();
    pause(account.id, "s-40");
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-40", "m-1", "oi"));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.rule_triggers).toHaveLength(0);
    expect(fake.tables.interactions[0].status).toBe("no_match");
    expect(fake.tables.interactions[0].error_detail).toContain("pausadas");
  });

  it("DM retida e pessoa pausada: palavra-chave de novo não confere nem libera", async () => {
    const { account, rule } = seedDm();
    seedTrigger(rule, account, "s-41", sentAt());
    pause(account.id, "s-41");

    await processWebhookPayload(dm(account, "s-41", "m-1", "oi"));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-41")?.link_delivered_at).toBeNull();
  });

  // Inconsistência com o caminho de DM: a mesma pessoa pausada que manda a
  // palavra-chave é barrada (acima), mas o toque em "Já segui" entrega o
  // conteúdo E inicia o workflow de entrada (processPostbackEvent não
  // consulta automationPausedUntil). O botão de boas-vindas do comentário já
  // tinha o mesmo comportamento antes do portão.
  it("Já segui com a pessoa pausada não entrega nem inicia o workflow de entrada", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-42", sentAt());
    pause(account.id, "s-42");

    await processWebhookPayload(postback(account, "s-42", "pb-1", followCheck(rule)));

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(runsOf(entry.id)).toHaveLength(0);
  });

  it("DM com portão enquanto a pessoa está num workflow esperando resposta: o workflow consome a mensagem", async () => {
    const { account, rule } = seedDm();
    const waiting = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "cadastro" }), waitReplyNode("w1"), messageNode("after", "Recebi sua resposta")],
        edges: [edge("trigger", "w1"), edge("w1", "after")],
      },
    });
    fake.tables.sequences.push(waiting);
    fake.tables.conversations.push(makeOpenConversation(account.id, "s-43"));
    fake.tables.sequence_runs.push(
      row({
        sequence_id: waiting.id,
        account_id: account.id,
        ig_sender_id: "s-43",
        status: "waiting_reply",
        current_node_id: "w1",
        next_run_at: null,
        steps_executed: 2,
        last_error: null,
        entry_rule_id: null,
        variables: {},
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-43", "m-1", "oi"));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendTemplateButtonsMessageMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(textsSent("Recebi sua resposta")).toBe(1);
    expect(triggerOf(rule, "s-43")).toBeUndefined();
  });
});

// ── 6. Token inválido (190) ───────────────────────────────────────────────

describe("QA portão: erro 190", () => {
  const tokenError = () => new GraphApiError("Error validating access token", 190);

  it("DM: 190 ao enviar o portão marca a conta expired, loga error e não entrega nem retém", async () => {
    const { account, rule } = seedDm();
    getFollowsBusinessMock.mockImplementation(async () => false);
    sendTemplateButtonsMessageMock.mockImplementation(async () => {
      throw tokenError();
    });

    await processWebhookPayload(dm(account, "s-50", "m-1", "oi"));

    expect(fake.tables.ig_accounts[0].status).toBe("expired");
    expect(fake.tables.interactions[0].status).toBe("error");
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-50")).toBeUndefined();
    expect(fake.tables.sequence_runs).toHaveLength(0);
  });

  it("toque no botão do comentário: 190 ao enviar o portão marca expired, loga error e não trava", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-51");
    getFollowsBusinessMock.mockImplementation(async () => false);
    sendTemplateButtonsMessageMock.mockImplementation(async () => {
      throw tokenError();
    });

    await processWebhookPayload(postback(account, "s-51", "pb-1", commentLink(rule)));

    expect(fake.tables.ig_accounts[0].status).toBe("expired");
    expect(fake.tables.interactions[0].status).toBe("error");
    expect(fake.tables.interactions[0].message_text).toBe("[falha ao enviar o portão de seguidor]");
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-51")?.link_delivered_at).toBeNull();
  });

  it("Já segui: 190 ao reenviar o portão marca expired e mantém o conteúdo retido", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-52", sentAt());
    getFollowsBusinessMock.mockImplementation(async () => false);
    sendTemplateButtonsMessageMock.mockImplementation(async () => {
      throw tokenError();
    });

    await processWebhookPayload(postback(account, "s-52", "pb-1", followCheck(rule)));

    expect(fake.tables.ig_accounts[0].status).toBe("expired");
    expect(fake.tables.interactions[0].status).toBe("error");
    expect(triggerOf(rule, "s-52")?.link_delivered_at).toBeNull();
  });

  // Token vencido: getFollowsBusiness dá 190, checkFollow engole como
  // "unknown" (D2), lockDelivery grava link_delivered_at e só então o envio
  // falha com 190. Depois de reconectar a conta, o "Já segui" é ignorado em
  // silêncio: o conteúdo nunca mais sai para essa pessoa.
  it("190 no Já segui marca a conta expirada sem travar; depois de reconectar, novo toque entrega", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-53", sentAt());
    getFollowsBusinessMock.mockImplementation(async () => {
      throw tokenError();
    });

    await processWebhookPayload(postback(account, "s-53", "pb-1", followCheck(rule)));
    expect(fake.tables.ig_accounts[0].status).toBe("expired");
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-53")?.link_delivered_at).toBeNull();

    // Usuário reconecta a conta; a pessoa toca de novo.
    fake.tables.ig_accounts[0].status = "active";
    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(postback(account, "s-53", "pb-2", followCheck(rule)));

    // O 190 aparece já na consulta: nada foi enviado nem travado no 1º toque.
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(fake.tables.interactions.at(-1)?.status).toBe("replied");
  });

  it("conta expirada: Já segui é ignorado sem tomar a trava; reconectada, entrega", async () => {
    const { account, rule } = seedComment({}, { status: "expired" });
    seedTrigger(rule, account, "s-54", sentAt());

    await processWebhookPayload(postback(account, "s-54", "pb-1", followCheck(rule)));
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(triggerOf(rule, "s-54")?.link_delivered_at).toBeNull();

    fake.tables.ig_accounts[0].status = "active";
    await processWebhookPayload(postback(account, "s-54", "pb-2", followCheck(rule)));
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
  });
});

// ── 7. Janela de 24h ──────────────────────────────────────────────────────

describe("QA portão: janela de 24h", () => {
  it("DM retida + palavra-chave reentregue com mais de 24h: window_expired, sem consulta, continua retida, sem workflow de palavra-chave; DM nova libera", async () => {
    const { account, rule, entry } = seedDm();
    const keyword = keywordSequence(account, "oi");
    seedTrigger(rule, account, "s-60", sentAt());

    await processWebhookPayload(dm(account, "s-60", "m-old", "oi", { timestamp: Date.now() - 25 * HOUR }));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("window_expired");
    expect(triggerOf(rule, "s-60")?.link_delivered_at).toBeNull();
    expect(runsOf(keyword.id)).toHaveLength(0);

    await processWebhookPayload(dm(account, "s-60", "m-new", "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
    expect(runsOf(keyword.id)).toHaveLength(0);
  });

  // A trava (link_delivered_at) é gravada ANTES do envio e nunca é desfeita
  // se o envio falhar. Um "Já segui" processado quando a Meta recusa o envio
  // (janela fechada, erro transitório) perde o conteúdo: o toque seguinte cai
  // em `trigger.link_delivered_at` e é ignorado em silêncio.
  it("envio recusado pela Meta no Já segui devolve a trava; novo toque entrega", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-61", sentAt());
    sendRuleReplyMock.mockImplementationOnce(async () => {
      throw new GraphApiError("This message is sent outside of allowed window.", 10, 2534022);
    });

    // Webhook do toque reentregue pela Meta horas depois.
    await processWebhookPayload(postback(account, "s-61", "pb-1", followCheck(rule), Date.now() - 25 * HOUR));
    expect(fake.tables.interactions[0].status).toBe("error");

    // A pessoa toca de novo agora (janela reaberta pelo próprio toque).
    await processWebhookPayload(postback(account, "s-61", "pb-2", followCheck(rule)));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(2);
  });
});

// ── 8. Resposta a story ───────────────────────────────────────────────────

describe("QA portão: resposta a story com a palavra-chave", () => {
  it("sem seguir: portão no lugar do conteúdo; resposta a story de novo depois de seguir entrega e inicia o workflow 1x", async () => {
    const { account, rule, entry } = seedDm();
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-70", "m-1", "oi", { storyReply: true }));

    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateButtonsMessageMock.mock.calls[0][2]).toBe(FOLLOW_GATE_DEFAULTS.text);
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("awaiting_follow");
    expect(triggerOf(rule, "s-70")?.follow_gate_sent_at).not.toBeNull();

    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(dm(account, "s-70", "m-2", "oi", { storyReply: true }));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("workflow específico de resposta a story tem prioridade: o portão nem é consultado", async () => {
    const { account, rule } = seedDm();
    const story = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ source: "storyReply", keyword: "" }), messageNode("st", "Resposta do story")],
        edges: [edge("trigger", "st")],
      },
    });
    fake.tables.sequences.push(story);
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-71", "m-1", "oi", { storyReply: true }));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(textsSent("Resposta do story")).toBe(1);
    expect(triggerOf(rule, "s-71")).toBeUndefined();
  });
});

// ── 9. Workflow de palavra-chave x conteúdo retido ────────────────────────

describe("QA portão: workflow de palavra-chave com a mesma keyword", () => {
  it("retido e ainda sem seguir: pedir de novo manda o texto de ainda não e NÃO inicia o workflow de palavra-chave", async () => {
    const { account, rule, entry } = seedDm();
    const keyword = keywordSequence(account, "oi");
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-80", "m-1", "oi"));
    await processWebhookPayload(dm(account, "s-80", "m-2", "oi"));

    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(2);
    expect(sendTemplateButtonsMessageMock.mock.calls[0][2]).toBe(FOLLOW_GATE_DEFAULTS.text);
    expect(sendTemplateButtonsMessageMock.mock.calls[1][2]).toBe(FOLLOW_GATE_DEFAULTS.retryText);
    expect(runsOf(keyword.id)).toHaveLength(0);
    expect(runsOf(entry.id)).toHaveLength(0);
    expect(fake.tables.interactions.map((i) => i.status)).toEqual(["awaiting_follow", "awaiting_follow"]);
    expect(triggerOf(rule, "s-80")?.link_delivered_at).toBeNull();
  });

  it("entregue pelo Já segui: workflow de entrada roda 1x; palavra-chave depois vira duplicate_skip e não repete a entrada", async () => {
    const { account, rule, entry } = seedDm();
    const keyword = keywordSequence(account, "oi");
    getFollowsBusinessMock.mockImplementation(async () => false);
    await processWebhookPayload(dm(account, "s-81", "m-1", "oi"));

    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(postback(account, "s-81", "pb-1", followCheck(rule)));
    await processWebhookPayload(dm(account, "s-81", "m-2", "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
    expect(textsSent(ENTRY_TEXT)).toBe(1);
    // Decisão existente: duplicate_skip da regra não bloqueia o workflow de palavra-chave.
    expect(runsOf(keyword.id)).toHaveLength(1);
  });
});

// ── 10. Outros caminhos suspeitos ─────────────────────────────────────────

describe("QA portão: outros caminhos", () => {
  it("controle (sem portão): falha transitória no envio da DM permite nova tentativa na próxima mensagem", async () => {
    const { account } = seedDm({ follow_gate_enabled: false });
    sendRuleReplyMock.mockImplementationOnce(async () => {
      throw new GraphApiError("An unexpected error has occurred. Please retry your request later.", 2);
    });

    await processWebhookPayload(dm(account, "s-90", "m-1", "oi"));
    await processWebhookPayload(dm(account, "s-90", "m-2", "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(2);
    expect(fake.tables.interactions.map((i) => i.status)).toContain("replied");
  });

  // Mesma causa do BUG de lockDelivery acima, agora no caminho de DM, e é uma
  // regressão: sem portão a falha não grava rule_triggers e a pessoa pode
  // pedir de novo (teste de controle acima). Com o conteúdo retido,
  // lockDelivery grava link_delivered_at antes do envio; o envio falha; o
  // próximo pedido vira duplicate_skip, o conteúdo nunca sai e o workflow de
  // palavra-chave "oi" roda no lugar.
  it("DM retida + falha transitória no envio devolve a trava; próximo pedido entrega", async () => {
    const { account, rule } = seedDm();
    const keyword = keywordSequence(account, "oi");
    getFollowsBusinessMock.mockImplementation(async () => false);
    await processWebhookPayload(dm(account, "s-91", "m-1", "oi"));

    getFollowsBusinessMock.mockImplementation(async () => true);
    sendRuleReplyMock.mockImplementationOnce(async () => {
      throw new GraphApiError("An unexpected error has occurred. Please retry your request later.", 2);
    });
    await processWebhookPayload(dm(account, "s-91", "m-2", "oi"));
    expect(fake.tables.interactions.at(-1)?.status).toBe("error");

    await processWebhookPayload(dm(account, "s-91", "m-3", "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(2);
    expect(runsOf(keyword.id)).toHaveLength(0);
    expect(triggerOf(rule, "s-91")?.link_delivered_at).not.toBeNull();
  });

  // runtime.ts (case "automation") chama sendRuleReply direto: uma automação
  // com "Só entregar para quem me segue" usada num nó Automação no meio de
  // um workflow entrega o conteúdo para quem não segue, sem consultar nada.
  it("nó Automação de workflow com portão não entrega para quem não segue", async () => {
    const { account, rule } = seedDm({ keyword: "ebook" });
    const flow = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "dm", keyword: "quero" }), automationNode("a1", rule.id)],
        edges: [edge("trigger", "a1")],
      },
    });
    fake.tables.sequences.push(flow);
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-92", "m-1", "quero"));

    expect(runsOf(flow.id)).toHaveLength(1);
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
  });

  it("nó Automação com portão: Já segui retoma o próprio run, confere de novo e segue o fluxo", async () => {
    const { account, rule } = seedDm({ keyword: "ebook" });
    const flow = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [
          triggerNode({ source: "dm", keyword: "quero" }),
          automationNode("a1", rule.id),
          messageNode("m2", "Depois do conteúdo"),
        ],
        edges: [edge("trigger", "a1"), edge("a1", "m2")],
      },
    });
    fake.tables.sequences.push(flow);
    getFollowsBusinessMock.mockImplementation(async () => false);

    await processWebhookPayload(dm(account, "s-93", "m-1", "quero"));

    const [run] = runsOf(flow.id);
    expect(run.status).toBe("waiting_postback");
    expect(run.current_node_id).toBe("a1");
    const gateButtons = sendTemplateButtonsMessageMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { type: string; payload?: string }[],
    ];
    const confirmPayload = gateButtons[3][1].payload!;
    expect(confirmPayload).toBe(`falow:seq:${run.id}:a1:follow-check`);

    // Tocou sem seguir: "ainda não", run continua esperando no nó.
    await processWebhookPayload(postback(account, "s-93", "pb-1", confirmPayload));
    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(2);
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(runsOf(flow.id)[0].status).toBe("waiting_postback");

    // Seguiu e tocou de novo: conteúdo sai e o fluxo continua.
    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(postback(account, "s-93", "pb-2", confirmPayload));
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "s-93", "Depois do conteúdo");
    expect(runsOf(flow.id)[0].status).toBe("completed");

    // Toque antigo depois do fim: ignorado.
    await processWebhookPayload(postback(account, "s-93", "pb-3", confirmPayload));
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
  });

  // Corrida: dois pedidos de DM quase juntos, a 1ª consulta diz "não segue" e a
  // 2ª "segue" (ou "unknown", D2). O 2º entrega sem gravar link_delivered_at
  // (applyRule só trava quando a linha JÁ estava retida), e o 1º marca
  // follow_gate_sent_at na mesma linha: o conteúdo já entregue fica "retido"
  // e o "Já segui" entrega de novo. O plano (tasks/todo.md) previa: "com
  // portão ligado, a entrega de DM passa a gravar link_delivered_at".
  it("corrida entre dois pedidos de DM: conteúdo entregue fica marcado e o Já segui não entrega 2x", async () => {
    const { account, rule } = seedDm();
    getFollowsBusinessMock
      .mockImplementationOnce(async () => false)
      .mockImplementationOnce(async () => true);

    await Promise.all([
      processWebhookPayload(dm(account, "s-93", "m-1", "oi")),
      processWebhookPayload(dm(account, "s-93", "m-2", "oi")),
    ]);
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(1);

    getFollowsBusinessMock.mockImplementation(async () => true);
    await processWebhookPayload(postback(account, "s-93", "pb-1", followCheck(rule)));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
  });

  it("não deu para conferir (230) na DM retida: entrega, trava e registra o motivo", async () => {
    const { account, rule, entry } = seedDm();
    seedTrigger(rule, account, "s-94", sentAt());
    getFollowsBusinessMock.mockImplementation(async () => {
      throw new GraphApiError("User consent is required to access user profile", 230);
    });

    await processWebhookPayload(dm(account, "s-94", "m-1", "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(triggerOf(rule, "s-94")?.link_delivered_at).not.toBeNull();
    expect(fake.tables.interactions[0].status).toBe("replied");
    expect(fake.tables.interactions[0].error_detail).toContain("Não deu para conferir");
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("botão de boas-vindas tocado de novo depois do portão, já seguindo: entrega 1x", async () => {
    const { account, rule, entry } = seedComment();
    seedTrigger(rule, account, "s-95", sentAt());

    await processWebhookPayload(postback(account, "s-95", "pb-1", commentLink(rule)));
    await processWebhookPayload(postback(account, "s-95", "pb-2", followCheck(rule)));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(runsOf(entry.id)).toHaveLength(1);
  });

  it("comentar de novo com o conteúdo retido: duplicate_skip, sem nova resposta privada (o caminho é o Já segui)", async () => {
    const { account, rule } = seedComment();
    seedTrigger(rule, account, "s-96", sentAt());

    await processWebhookPayload(comment(account, "s-96", "c-1", "preço"));

    expect(sendPrivateReplyWithButtonMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("duplicate_skip");
    expect(triggerOf(rule, "s-96")?.link_delivered_at).toBeNull();
  });

  it("portão desligado com conteúdo retido na DM: palavra-chave de novo entrega direto e trava", async () => {
    const { account, rule } = seedDm({ follow_gate_enabled: false });
    seedTrigger(rule, account, "s-97", sentAt());

    await processWebhookPayload(dm(account, "s-97", "m-1", "oi"));
    await processWebhookPayload(postback(account, "s-97", "pb-1", followCheck(rule)));

    expect(getFollowsBusinessMock).not.toHaveBeenCalled();
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(triggerOf(rule, "s-97")?.link_delivered_at).not.toBeNull();
  });

  it("portão enviado na DM leva o link do perfil da conta e o payload da regra (perfil fora do ar: usa o @ salvo, sem o @)", async () => {
    const { account, rule } = seedDm({}, { ig_username: "@minha.conta" });
    getFollowsBusinessMock.mockImplementation(async () => false);
    getInstagramProfileMock.mockRejectedValueOnce(new Error("rede"));

    await processWebhookPayload(dm(account, "s-98", "m-1", "oi"));

    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledWith(expect.any(String), "s-98", FOLLOW_GATE_DEFAULTS.text, [
      { type: "web_url", title: FOLLOW_GATE_DEFAULTS.followLabel, url: "https://www.instagram.com/minha.conta/" },
      { type: "postback", title: FOLLOW_GATE_DEFAULTS.confirmLabel, payload: followCheck(rule) },
    ]);
  });
});
