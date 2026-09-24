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

  it("DM casa rule ativa com a automação escolhida DIRETO no gatilho (formato novo, sem nó Automação): rule responde e o workflow inicia da saída do gatilho", async () => {
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
        nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m2", "Segue o fluxo novo")],
        edges: [edge("trigger", "m2")],
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
              sender: { id: "sender-5" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-5", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-5", "Segue o fluxo novo");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(fake.tables.sequence_runs[0].entry_rule_id).toBe(rule.id);
    expect(fake.tables.sequence_runs[0].status).toBe("completed");
  });

  it("regra pausada (is_active false) não responde nem inicia workflow: só loga no_match", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      keyword: "oi",
      is_active: false,
      reply_type: "text",
      reply_text: "Oi! Tudo bem?",
    });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m2")],
        edges: [edge("trigger", "m2")],
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
              sender: { id: "sender-6" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-6", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.sequence_runs).toHaveLength(0);
    expect(fake.tables.interactions).toHaveLength(1);
    expect(fake.tables.interactions[0].status).toBe("no_match");
  });
});

describe("processWebhookPayload — gatilhos novos (story reply, menção em story, link de referência)", () => {
  it("resposta a story dispara o workflow com source storyReply", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "storyReply", keyword: "" }), messageNode("m1", "Valeu por responder o story!")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-20" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: {
                mid: "mid-20",
                text: "adorei!",
                is_echo: false,
                reply_to: { story: { id: "story-1", url: "https://cdn/x.jpg" } },
              },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendTextMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      "sender-20",
      "Valeu por responder o story!"
    );
    expect(fake.tables.sequence_runs).toHaveLength(1);
  });

  it("menção em story dispara o workflow mesmo SEM texto (attachments story_mention)", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "storyMention", keyword: "" }), messageNode("m1", "Obrigado por marcar a gente!")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-21" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              // Menção em story não traz texto — só o attachment.
              message: {
                mid: "mid-21",
                is_echo: false,
                attachments: [{ type: "story_mention", payload: { url: "https://cdn/story.jpg" } }],
              },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendTextMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      "sender-21",
      "Obrigado por marcar a gente!"
    );
    expect(fake.tables.sequence_runs).toHaveLength(1);
  });

  it("link de referência (referral.ref) dispara o workflow com o refCode certo, mesmo sem mid", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [
          triggerNode({ source: "refLink", refCode: "promo10", keyword: "" }),
          messageNode("m1", "Aqui está seu desconto!"),
        ],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-22" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              // ig.me abrindo a conversa: sem "message", só o referral.
              referral: { ref: "promo10", source: "https://ig.me/m/conta?ref=promo10", type: "OPEN_THREAD" },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendTextMessageMock).toHaveBeenCalledWith(
      expect.any(String),
      "sender-22",
      "Aqui está seu desconto!"
    );
    expect(fake.tables.sequence_runs).toHaveLength(1);
  });
});

describe("processWebhookPayload — nó Pausar automações", () => {
  it("pessoa com automações pausadas não dispara regra nem inicia workflow novo", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      keyword: "oi",
      reply_type: "text",
      reply_text: "Oi!",
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.conversations.push(
      row({
        account_id: account.id,
        ig_sender_id: "sender-23",
        last_inbound_at: new Date().toISOString(),
        automation_paused_until: new Date(Date.now() + 3600_000).toISOString(),
      })
    );

    const payload: MetaWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-23" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              message: { mid: "mid-23", text: "oi", is_echo: false },
            },
          ],
        },
      ],
    };

    await processWebhookPayload(payload);

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions).toHaveLength(1);
    expect(fake.tables.interactions[0].status).toBe("no_match");
    expect(fake.tables.interactions[0].error_detail).toContain("pausadas");
  });
});

describe("processWebhookPayload: variantes de resposta em comentário", () => {
  function commentPayload(overrides: Partial<{
    commentId: string;
    senderId: string;
    text: string;
    mediaId: string;
  }> = {}): MetaWebhookPayload {
    return {
      object: "instagram",
      entry: [
        {
          id: "ig-business-1",
          time: Math.floor(Date.now() / 1000),
          field: "comments",
          value: {
            id: overrides.commentId ?? "comment-1",
            text: overrides.text ?? "preço",
            from: { id: overrides.senderId ?? "sender-10", username: "quem_comentou" },
            media: { id: overrides.mediaId ?? "media-1", media_product_type: "FEED" },
          },
        },
      ],
    };
  }

  it("sem variantes extras: comportamento igual ao de hoje (usa welcome_text e public_reply_text)", async () => {
    const account = makeAccount({ ig_user_id: "ig-business-1" });
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "comment",
      keyword: "preço",
      media_mode: "any",
      welcome_text: "Vou te mandar o link!",
      welcome_text_variants: null,
      welcome_button_label: "Quero o link",
      public_reply_enabled: true,
      public_reply_text: "Te chamei no direct!",
      public_reply_variants: null,
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);

    await processWebhookPayload(commentPayload());

    expect(sendPrivateReplyWithButtonMock).toHaveBeenCalledTimes(1);
    expect(sendPrivateReplyWithButtonMock).toHaveBeenCalledWith(
      expect.any(String),
      "comment-1",
      "Vou te mandar o link!",
      "Quero o link",
      expect.any(String)
    );
    expect(replyToCommentMock).toHaveBeenCalledTimes(1);
    expect(replyToCommentMock).toHaveBeenCalledWith(
      expect.any(String),
      "comment-1",
      "Te chamei no direct!"
    );
    expect(fake.tables.interactions[0].status).toBe("replied");
  });

  it("com variantes: envia sempre uma das opções cadastradas (boas-vindas e resposta pública)", async () => {
    const account = makeAccount({ ig_user_id: "ig-business-1" });
    const welcomeOptions = ["Boas-vindas 1", "Boas-vindas 2", "Boas-vindas 3"];
    const publicOptions = ["Pública 1", "Pública 2"];
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "comment",
      keyword: "preço",
      media_mode: "any",
      welcome_text: welcomeOptions[0],
      welcome_text_variants: welcomeOptions.slice(1),
      welcome_button_label: "Quero o link",
      public_reply_enabled: true,
      public_reply_text: publicOptions[0],
      public_reply_variants: publicOptions.slice(1),
    });

    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);

    // Roda várias vezes (senders diferentes p/ não cair em duplicate_skip) e
    // confirma que todo envio pertence ao conjunto de variantes cadastradas.
    for (let i = 0; i < 10; i++) {
      await processWebhookPayload(
        commentPayload({ commentId: `comment-${i}`, senderId: `sender-${i}` })
      );
    }

    expect(sendPrivateReplyWithButtonMock).toHaveBeenCalledTimes(10);
    for (const call of sendPrivateReplyWithButtonMock.mock.calls as unknown[][]) {
      expect(welcomeOptions).toContain(call[2]);
    }

    expect(replyToCommentMock).toHaveBeenCalledTimes(10);
    for (const call of replyToCommentMock.mock.calls as unknown[][]) {
      expect(publicOptions).toContain(call[2]);
    }
  });
});
