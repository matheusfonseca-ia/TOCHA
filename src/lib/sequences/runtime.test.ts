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
  node,
  row,
  triggerNode,
  waitReplyNode,
} from "@/lib/sequences/__tests__/fixtures";
import { randomizerHandle } from "@/types/sequence";

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
  startSequenceFromRule,
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

    const started = await maybeStartSequence(admin, account, "sender-5", { kind: "dm", text: "menu" });
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

    await maybeStartSequence(admin, account, "sender-6", { kind: "dm", text: "menu" });
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

    await maybeStartSequence(admin, account, "sender-7", { kind: "dm", text: "menu" });
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

    const failed = await maybeStartSequence(admin, account, "sender-8", { kind: "dm", text: "start" });
    expect(failed?.status).toBe("error");
    expect(fake.tables.sequence_runs).toHaveLength(0);

    // Nova tentativa (a mensagem de novo, ou reentrega do webhook): o unique
    // (sequence_id, ig_sender_id) não bloqueia porque o run anterior sumiu.
    const retried = await maybeStartSequence(admin, account, "sender-8", { kind: "dm", text: "start" });
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

    const outcome = await maybeStartSequence(admin, account, "sender-9", { kind: "dm", text: "fluxo" });

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

    const started = await maybeStartSequence(admin, account, "sender-10", { kind: "dm", text: "fluxo2" });
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

    const started = await maybeStartSequence(admin, account, "sender-11", { kind: "dm", text: "loop" });
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

    const outcome = await maybeStartSequence(admin, account, "sender-12", { kind: "dm", text: "badloop" });

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

describe("startSequenceFromRule — rule direto no gatilho e formato legado", () => {
  it("rule direto no gatilho (ruleId): inicia a partir da saída do próprio gatilho", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, trigger_type: "dm" });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m1", "Direto no gatilho")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-13"));

    const outcome = await startSequenceFromRule(admin, account, "sender-13", rule);

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-13", "Direto no gatilho");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(fake.tables.sequence_runs[0].entry_rule_id).toBe(rule.id);
  });

  it("formato legado (nó Automação ligado ao gatilho): continua iniciando a partir da saída do nó", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, trigger_type: "dm" });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation" }), automationNode("entry", rule.id), messageNode("m1", "Depois do nó")],
        edges: [edge("trigger", "entry"), edge("entry", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-14"));

    const outcome = await startSequenceFromRule(admin, account, "sender-14", rule);

    expect(outcome?.status).toBe("replied");
    // Só "Depois do nó" saiu — o nó Automação não reenvia a rule (a rule já
    // respondeu antes de chamar startSequenceFromRule).
    expect(sendTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-14", "Depois do nó");
  });

  it("workflow pausado (is_active false) não inicia", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, trigger_type: "dm" });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: false,
      graph: {
        nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m1")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);

    const outcome = await startSequenceFromRule(admin, account, "sender-15", rule);

    expect(outcome).toBeNull();
    expect(fake.tables.sequence_runs).toHaveLength(0);
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it("segunda entrada da mesma pessoa no mesmo workflow: duplicate_skip", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, trigger_type: "dm" });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ source: "automation", ruleId: rule.id }), messageNode("m1")],
        edges: [edge("trigger", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-16"));

    const first = await startSequenceFromRule(admin, account, "sender-16", rule);
    const second = await startSequenceFromRule(admin, account, "sender-16", rule);

    expect(first?.status).toBe("replied");
    expect(second?.status).toBe("duplicate_skip");
    expect(fake.tables.sequence_runs).toHaveLength(1);
  });
});

describe("nó Aleatório", () => {
  it("sorteia o caminho pelo peso (Math.random mockado) e segue o handle correto", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [
          triggerNode({ keyword: "sorteio" }),
          node("r", "randomizer", {
            branches: [
              { label: "A", weight: 20 },
              { label: "B", weight: 80 },
            ],
          }),
          messageNode("a", "Caminho A"),
          messageNode("b", "Caminho B"),
        ],
        edges: [
          edge("trigger", "r"),
          edge("r", "a", randomizerHandle(0)),
          edge("r", "b", randomizerHandle(1)),
        ],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-17"));

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const outcome = await maybeStartSequence(admin, account, "sender-17", { kind: "dm", text: "sorteio" });
    randomSpy.mockRestore();

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-17", "Caminho B");
    expect(sendTextMessageMock).not.toHaveBeenCalledWith(expect.any(String), "sender-17", "Caminho A");
  });
});

describe("nó Ir para workflow", () => {
  it("encerra o run atual e inicia o workflow alvo pra mesma pessoa", async () => {
    const account = makeAccount();
    const target = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "alvo" }), messageNode("ta", "Mensagem do alvo")],
        edges: [edge("trigger", "ta")],
      },
    });
    const source = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "origem" }), node("g", "goToSequence", { sequenceId: target.id })],
        edges: [edge("trigger", "g")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(source, target);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-18"));

    const outcome = await maybeStartSequence(admin, account, "sender-18", { kind: "dm", text: "origem" });

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-18", "Mensagem do alvo");

    const sourceRun = fake.tables.sequence_runs.find((r) => r.sequence_id === source.id);
    const targetRun = fake.tables.sequence_runs.find((r) => r.sequence_id === target.id);
    expect(sourceRun?.status).toBe("completed");
    expect(targetRun?.status).toBe("completed");
  });

  it("pessoa que já passou pelo alvo: encerra o run atual sem duplicar a entrada", async () => {
    const account = makeAccount();
    const target = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "alvo2" }), messageNode("ta", "Já visitado")],
        edges: [edge("trigger", "ta")],
      },
    });
    const source = makeSequence({
      account_id: account.id,
      is_active: true,
      graph: {
        nodes: [triggerNode({ keyword: "origem2" }), node("g", "goToSequence", { sequenceId: target.id })],
        edges: [edge("trigger", "g")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(source, target);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-19"));
    // A pessoa já tem um run concluído no workflow alvo.
    fake.tables.sequence_runs.push(
      row({
        sequence_id: target.id,
        account_id: account.id,
        ig_sender_id: "sender-19",
        status: "completed",
        current_node_id: null,
        next_run_at: null,
        steps_executed: 1,
        last_error: null,
        entry_rule_id: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );

    const outcome = await maybeStartSequence(admin, account, "sender-19", { kind: "dm", text: "origem2" });

    expect(outcome?.status).toBe("duplicate_skip");
    expect(sendTextMessageMock).not.toHaveBeenCalledWith(expect.any(String), "sender-19", "Já visitado");
    const sourceRun = fake.tables.sequence_runs.find((r) => r.sequence_id === source.id);
    expect(sourceRun?.status).toBe("completed");
  });
});

describe("nó Pausar automações", () => {
  it("grava conversations.automation_paused_until e segue pra saída", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      graph: {
        nodes: [
          triggerNode({ keyword: "pausar" }),
          node("s", "stopAutomation", { hours: 24 }),
          messageNode("a", "Depois da pausa"),
        ],
        edges: [edge("trigger", "s"), edge("s", "a")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-20"));

    const before = Date.now();
    const outcome = await maybeStartSequence(admin, account, "sender-20", { kind: "dm", text: "pausar" });

    expect(outcome?.status).toBe("replied");
    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-20", "Depois da pausa");

    const conversation = fake.tables.conversations.find(
      (c) => c.account_id === account.id && c.ig_sender_id === "sender-20"
    );
    expect(conversation?.automation_paused_until).toBeDefined();
    expect(Date.parse(conversation!.automation_paused_until)).toBeGreaterThan(before + 23 * 3600 * 1000);
  });
});
