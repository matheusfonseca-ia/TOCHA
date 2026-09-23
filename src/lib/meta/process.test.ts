import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import {
  automationNode,
  edge,
  makeAccount,
  makeRule,
  makeSequence,
  messageNode,
  row,
  triggerNode,
} from "@/lib/sequences/__tests__/fixtures";
import { processWebhookPayload, type MetaWebhookPayload } from "@/lib/meta/process";

/**
 * Testes de integração do pipeline de webhooks (`processWebhookPayload`):
 * handoff rule → workflow (nó "Automação", `entry_rule_id`), correções B1/B4
 * (postback atualiza a janela de 24h com o timestamp do evento) e a decisão
 * de que `duplicate_skip` da regra não bloqueia o workflow por palavra-chave.
 *
 * Supabase admin, envio via Graph API e `sendRuleReply` são todos mockados —
 * nada de rede nem banco real.
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
} = vi.hoisted(() => ({
  sendRuleReplyMock: vi.fn(async (_token: string, _recipientId: string, _rule: { id: string; reply_text: string | null }) => {}),
  sendTextMessageMock: vi.fn(async () => {}),
  sendImageMessageMock: vi.fn(async () => {}),
  sendButtonsMessageMock: vi.fn(async () => {}),
  sendPrivateReplyWithButtonMock: vi.fn(async () => {}),
  replyToCommentMock: vi.fn(async () => {}),
  sendQuickRepliesMessageMock: vi.fn(async () => {}),
  sendTemplateButtonsMessageMock: vi.fn(async () => {}),
  sendTypingActionMock: vi.fn(async () => {}),
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
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, sleep: vi.fn(async () => {}) };
});

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeAdmin();
  setAdmin(fake.client);
  vi.clearAllMocks();
});

describe("processWebhookPayload — handoff rule → workflow", () => {
  it("DM casa rule ativa que é entrada de workflow ativo: rule responde e o workflow inicia a partir da saída do nó automação", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      keyword: "oi",
      reply_type: "text",
      reply_text: "Oi! Tudo bem?",
    });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation" }), automationNode("entry", rule.id), messageNode("m2", "Segue o fluxo")],
        edges: [edge("trigger", "entry"), edge("entry", "m2")],
      },
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-1" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-1", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    // A rule respondeu.
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendRuleReplyMock.mock.calls[0][2].id).toBe(rule.id);
    expect(fake.tables.rule_triggers).toHaveLength(1);

    // O workflow iniciou a partir da SAÍDA do nó automação (não reexecuta a
    // rule): só a mensagem "m2" foi enviada pelo runtime.
    expect(sendTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-1", "Segue o fluxo");

    expect(fake.tables.sequence_runs).toHaveLength(1);
    const run = fake.tables.sequence_runs[0];
    expect(run.sequence_id).toBe(sequence.id);
    expect(run.entry_rule_id).toBe(rule.id);
    expect(run.status).toBe("completed");

    // Duas interações logadas: a resposta da rule e o handoff do workflow.
    expect(fake.tables.interactions).toHaveLength(2);
    expect(fake.tables.interactions[0].status).toBe("replied");
    expect(fake.tables.interactions[0].matched_rule_id).toBe(rule.id);
    expect(fake.tables.interactions[1].sequence_id).toBe(sequence.id);
    expect(fake.tables.interactions[1].status).toBe("replied");
  });

  it("workflow pausado: rule responde sozinha, nenhum run é criado", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      keyword: "oi",
      reply_type: "text",
      reply_text: "Oi! Tudo bem?",
    });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: false, // workflow pausado
      graph: {
        nodes: [triggerNode({ source: "automation" }), automationNode("entry", rule.id), messageNode("m2")],
        edges: [edge("trigger", "entry"), edge("entry", "m2")],
      },
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-2" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-2", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(fake.tables.sequence_runs).toHaveLength(0);
    expect(sendTextMessageMock).not.toHaveBeenCalled();
    // Só a interação da rule — sem handoff, já que o workflow está pausado.
    expect(fake.tables.interactions).toHaveLength(1);
    expect(fake.tables.interactions[0].status).toBe("replied");
  });

  it("rule em duplicate_skip não bloqueia o workflow por palavra-chave (decisão do usuário)", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      keyword: "oi",
      reply_type: "text",
      reply_text: "Oi! Tudo bem?",
    });
    // Pessoa já recebeu esta rule antes → próximo toque cai em duplicate_skip.
    fake.tables.rule_triggers.push(
      row({ rule_id: rule.id, account_id: account.id, ig_sender_id: "sender-3", link_delivered_at: null })
    );

    // Workflow por palavra-chave (source "dm", não ligado à rule por entry_rule_id).
    const sequence = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "oi", matchType: "contains" }), messageNode("m1", "Bem-vindo ao fluxo")],
        edges: [edge("trigger", "m1")],
      },
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-3" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-3", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    // A rule NÃO respondeu de novo (duplicate_skip corta antes do envio).
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    // O workflow por palavra-chave iniciou normalmente.
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-3", "Bem-vindo ao fluxo");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(fake.tables.sequence_runs[0].sequence_id).toBe(sequence.id);
    expect(fake.tables.interactions).toHaveLength(1);
    expect(fake.tables.interactions[0].sequence_id).toBe(sequence.id);
  });

  it("postback falow:comment_link entregue inicia o workflow com entry_rule_id da rule de comentário e atualiza last_inbound_at com o timestamp do evento (B1/B4)", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "comment",
      keyword: "preço",
      welcome_text: "Vou te mandar o link!",
      welcome_button_label: "Quero o link",
      reply_type: "text",
      reply_text: "Aqui está: https://exemplo.com",
    });
    // Simula que a resposta privada do comentário já saiu (1ª etapa), sem o
    // link ainda entregue.
    fake.tables.rule_triggers.push(
      row({ rule_id: rule.id, account_id: account.id, ig_sender_id: "sender-4", link_delivered_at: null })
    );

    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation" }), automationNode("entry", rule.id), messageNode("m2", "Continuação do fluxo")],
        edges: [edge("trigger", "entry"), edge("entry", "m2")],
      },
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);

    const eventTimestampMs = Date.now() - 60_000; // 1 minuto atrás
    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-4" },
              recipient: { id: account.ig_user_id },
              timestamp: eventTimestampMs,
              postback: {
                mid: "pb-1",
                title: "Quero o link",
                payload: `falow:comment_link:${rule.id}`,
              },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    // B1: conversations foi atualizado (antes só a DM fazia isso).
    expect(fake.tables.conversations).toHaveLength(1);
    const conversation = fake.tables.conversations[0];
    expect(conversation.account_id).toBe(account.id);
    expect(conversation.ig_sender_id).toBe("sender-4");
    // B4: usa o timestamp do EVENTO, não o de processamento.
    expect(conversation.last_inbound_at).toBe(new Date(eventTimestampMs).toISOString());

    // Trava de entrega 1x: link_delivered_at foi marcado.
    expect(fake.tables.rule_triggers[0].link_delivered_at).not.toBeNull();

    // O link (2ª mensagem da rule) foi enviado.
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendRuleReplyMock.mock.calls[0][2].id).toBe(rule.id);

    // O workflow iniciou a partir da saída do nó automação.
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-4", "Continuação do fluxo");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(fake.tables.sequence_runs[0].entry_rule_id).toBe(rule.id);
    expect(fake.tables.sequence_runs[0].status).toBe("completed");
  });
});
