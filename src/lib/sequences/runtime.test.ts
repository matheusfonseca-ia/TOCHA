import type { createAdminClient } from "@/lib/supabase/admin";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import {
  automationNode,
  branchButtonsNode,
  buttonHandle,
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

/**
 * Testes de integração do runtime das sequências: retomada de postback (v1 e
 * v2, incluindo o nó desatualizado do B2), toque duplo, run apagado quando o
 * 1º envio falha (B6), nó "Automação" no meio do fluxo (referência à rule,
 * não cópia) e a trava de ciclo sem espera (legado, sem passar pela
 * validação do editor).
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
  sendQuickRepliesMessageMock,
  sendTemplateButtonsMessageMock,
  sendTypingActionMock,
} = vi.hoisted(() => ({
  sendRuleReplyMock: vi.fn(async (_token: string, _recipientId: string, _rule: { id: string; reply_text: string | null }) => {}),
  sendTextMessageMock: vi.fn(async () => {}),
  sendImageMessageMock: vi.fn(async () => {}),
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
    sendQuickRepliesMessage: sendQuickRepliesMessageMock,
    sendTemplateButtonsMessage: sendTemplateButtonsMessageMock,
    sendTypingAction: sendTypingActionMock,
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, sleep: vi.fn(async () => {}) };
});

import {
  handleSequencePostback,
  handleSequenceReply,
  maybeStartSequence,
} from "@/lib/sequences/runtime";

type AdminClient = ReturnType<typeof createAdminClient>;

let fake: FakeSupabase;
let admin: AdminClient;

beforeEach(() => {
  fake = createFakeAdmin();
  admin = fake.client as unknown as AdminClient;
  setAdmin(fake.client);
  vi.clearAllMocks();
});

describe("handleSequencePostback — payload v1/v2 e toque duplo", () => {
  it("payload v2 com nó desatualizado é ignorado e o run fica intocado (B2)", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "menu" }), branchButtonsNode("b1", "Escolha", "Opção A"), messageNode("m1", "Você escolheu A")],
        edges: [edge("trigger", "b1"), edge("b1", "m1", buttonHandle(0))],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-5"));

    const started = await maybeStartSequence(admin, account, "sender-5", "menu");
    expect(started?.status).toBe("replied");
    expect(sendTemplateButtonsMessageMock).toHaveBeenCalledTimes(1);

    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("waiting_postback");
    expect(run.current_node_id).toBe("b1");

    // Botão de uma mensagem antiga: payload v2 carrega um nodeId que não é
    // mais onde o run está parado.
    const staleOutcome = await handleSequencePostback(
      admin,
      account,
      "sender-5",
      `falow:seq:${run.id}:no-antigo:${buttonHandle(0)}`
    );

    expect(staleOutcome).toBeNull();
    // O run não foi alterado: mesmo status, mesmo nó, nenhuma mensagem nova.
    const untouched = fake.tables.sequence_runs.find((r) => r.id === run.id)!;
    expect(untouched.status).toBe("waiting_postback");
    expect(untouched.current_node_id).toBe("b1");
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it("payload v1 legado (sem nodeId) continua aceito", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "menu" }), branchButtonsNode("b1", "Escolha", "Opção A"), messageNode("m1", "Você escolheu A")],
        edges: [edge("trigger", "b1"), edge("b1", "m1", buttonHandle(0))],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-6"));

    await maybeStartSequence(admin, account, "sender-6", "menu");
    const run = fake.tables.sequence_runs[0];

    // v1: falow:seq:<runId>:<handle>, sem o nó.
    const outcome = await handleSequencePostback(admin, account, "sender-6", `falow:seq:${run.id}:${buttonHandle(0)}`);

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-6", "Você escolheu A");
    const updated = fake.tables.sequence_runs.find((r) => r.id === run.id)!;
    expect(updated.status).toBe("completed");
  });

  it("toque duplo no mesmo botão gera só uma continuação", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "menu" }), branchButtonsNode("b1", "Escolha", "Opção A"), messageNode("m1", "Você escolheu A")],
        edges: [edge("trigger", "b1"), edge("b1", "m1", buttonHandle(0))],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-7"));

    await maybeStartSequence(admin, account, "sender-7", "menu");
    const run = fake.tables.sequence_runs[0];
    const payload = `falow:seq:${run.id}:b1:${buttonHandle(0)}`;

    const first = await handleSequencePostback(admin, account, "sender-7", payload);
    const second = await handleSequencePostback(admin, account, "sender-7", payload);

    expect(first?.status).toBe("replied");
    expect(second).toBeNull(); // o 2º toque não encontra mais o run em waiting_postback
    expect(sendTextMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe("maybeStartSequence — run apagado se o 1º envio falhar (B6)", () => {
  it("run é apagado quando o primeiro envio falha; a pessoa pode entrar de novo depois", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "start" }), messageNode("m1", "Oi")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-8"));

    sendTextMessageMock.mockRejectedValueOnce(new Error("Graph API indisponível"));

    const failed = await maybeStartSequence(admin, account, "sender-8", "start");
    expect(failed?.status).toBe("error");
    expect(fake.tables.sequence_runs).toHaveLength(0);

    // Nova tentativa (a mensagem de novo, ou reentrega do webhook): o unique
    // (sequence_id, ig_sender_id) não bloqueia porque o run anterior sumiu.
    const retried = await maybeStartSequence(admin, account, "sender-8", "start");
    expect(retried?.status).toBe("replied");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(sendTextMessageMock).toHaveBeenCalledTimes(2);
  });
});

describe("nó Automação no meio do fluxo", () => {
  it("envia a resposta ATUAL da rule (referência, não cópia) e segue para 'out'", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "dm",
      reply_type: "text",
      reply_text: "Original",
    });
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [
          triggerNode({ keyword: "fluxo" }),
          messageNode("m0", "Início"),
          automationNode("a1", rule.id),
          messageNode("m2", "Depois da automação"),
        ],
        edges: [edge("trigger", "m0"), edge("m0", "a1"), edge("a1", "m2")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-9"));

    // Rule editada depois de o fluxo ser salvo: o runtime deve buscar o
    // valor ATUAL no banco, não um snapshot antigo.
    fake.tables.rules[0].reply_text = "Atualizado";

    const outcome = await maybeStartSequence(admin, account, "sender-9", "fluxo");

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenNthCalledWith(1, expect.any(String), "sender-9", "Início");
    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendRuleReplyMock.mock.calls[0][2].reply_text).toBe("Atualizado");
    expect(sendTextMessageMock).toHaveBeenNthCalledWith(2, expect.any(String), "sender-9", "Depois da automação");

    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("completed");
  });

  it("rule excluída: o run termina em error com last_error 'Automação removida'", async () => {
    const account = makeAccount();
    // Fluxo passa por uma espera antes do nó Automação, para o nó ser
    // alcançado por uma RETOMADA (o caso "no meio do fluxo" de verdade —
    // na entrada, uma falha sem envio apagaria o run em vez de persistir o erro).
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [
          triggerNode({ keyword: "fluxo2" }),
          waitReplyNode("w1"),
          automationNode("a1", "rule-que-nao-existe-mais"),
          messageNode("m2", "Nunca chega aqui"),
        ],
        edges: [edge("trigger", "w1"), edge("w1", "a1"), edge("a1", "m2")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(
      row({ account_id: account.id, ig_sender_id: "sender-10", last_inbound_at: new Date().toISOString() })
    );

    const started = await maybeStartSequence(admin, account, "sender-10", "fluxo2");
    expect(started?.status).toBe("replied");
    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("waiting_reply");
    expect(run.current_node_id).toBe("w1");

    // Pessoa responde qualquer coisa → retoma no nó Automação, cuja rule já
    // foi excluída.
    const resumed = await handleSequenceReply(admin, account, "sender-10", undefined);

    expect(resumed?.status).toBe("error");
    expect(resumed?.errorDetail).toBe("Automação removida");
    const updated = fake.tables.sequence_runs.find((r) => r.id === run.id)!;
    expect(updated.status).toBe("error");
    expect(updated.last_error).toBe("Automação removida");
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
  });
});

describe("ciclos: nó de espera roda sem estourar limite; ciclo sem espera é barrado", () => {
  it("ciclo com nó de espera roda várias voltas sem atingir o limite de passos", async () => {
    const account = makeAccount();
    // trigger -> a (mensagem) -> w (esperar resposta) -> volta para "a".
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "loop" }), messageNode("a", "Mensagem do laço"), waitReplyNode("w")],
        edges: [edge("trigger", "a"), edge("a", "w"), edge("w", "a")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-11"));

    const started = await maybeStartSequence(admin, account, "sender-11", "loop");
    expect(started?.status).toBe("replied");

    for (let i = 0; i < 5; i++) {
      const resumed = await handleSequenceReply(admin, account, "sender-11", undefined);
      expect(resumed?.status).toBe("replied");
    }

    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("waiting_reply");
    expect(run.current_node_id).toBe("w");
    // 1 execução inicial + 5 retomadas, uma mensagem enviada por volta.
    expect(sendTextMessageMock).toHaveBeenCalledTimes(6);
  });

  it("ciclo sem nenhum nó de espera é barrado pelo limite de passos (grafo legado, sem passar pela validação do editor)", async () => {
    const account = makeAccount();
    // trigger -> a -> b -> a -> b -> ... sem nenhum nó de espera. O editor
    // bloquearia isso hoje (findCyclesWithoutWait), mas o runtime precisa
    // continuar protegendo grafos salvos antes dessa checagem existir.
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [triggerNode({ keyword: "badloop" }), messageNode("a", "A"), messageNode("b", "B")],
        edges: [edge("trigger", "a"), edge("a", "b"), edge("b", "a")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-12"));

    const outcome = await maybeStartSequence(admin, account, "sender-12", "badloop");

    expect(outcome?.status).toBe("error");
    expect(outcome?.errorDetail).toContain("Limite de passos");
    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("error");
    expect(run.last_error).toContain("Limite de passos");
    // Muitas mensagens saíram antes do freio — mostra que o guard existe
    // justamente porque o envio não para sozinho.
    expect(sendTextMessageMock.mock.calls.length).toBeGreaterThan(50);
  });
});
