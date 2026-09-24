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
import { processWebhookPayload } from "@/lib/meta/process";
import { processDueRuns } from "@/lib/sequences/runtime";
import { sleep } from "@/lib/utils";

import { expireAutomations } from "./sweep";

/**
 * Sweep de expiração (`expireAutomations`) e a defesa no matching do webhook:
 * automação/workflow vencido não dispara mesmo antes do sweep rodar.
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

const { sendRuleReplyMock, sendTextMessageMock, sendPrivateReplyWithButtonMock } = vi.hoisted(() => ({
  sendRuleReplyMock: vi.fn(async () => {}),
  sendTextMessageMock: vi.fn(async () => {}),
  sendPrivateReplyWithButtonMock: vi.fn(async () => {}),
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
    sendPrivateReplyWithButton: sendPrivateReplyWithButtonMock,
    replyToComment: vi.fn(async () => {}),
    sendTypingAction: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, sleep: vi.fn(async () => {}) };
});

const HOUR = 60 * 60 * 1000;
const past = () => new Date(Date.now() - HOUR).toISOString();
const future = () => new Date(Date.now() + HOUR).toISOString();

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeAdmin();
  setAdmin(fake.client);
  vi.clearAllMocks();
});

function dmPayload(accountIgId: string, text: string, mid = "mid-1") {
  return {
    object: "instagram",
    entry: [
      {
        id: accountIgId,
        messaging: [
          {
            sender: { id: "sender-1" },
            recipient: { id: accountIgId },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

describe("expireAutomations", () => {
  it("exclui as vencidas com ação excluir, pausa as de pausar e ignora o resto", async () => {
    const del = makeRule({ expires_at: past(), expire_action: "delete" });
    const pause = makeRule({ expires_at: past(), expire_action: "pause" });
    const alive = makeRule({ expires_at: future(), expire_action: "delete" });
    const permanent = makeRule();
    fake.tables.rules.push(del, pause, alive, permanent);

    const seqDel = makeSequence({ expires_at: past(), expire_action: "delete" });
    const seqPause = makeSequence({ expires_at: past(), expire_action: "pause" });
    fake.tables.sequences.push(seqDel, seqPause);

    const result = await expireAutomations(fake.client as never);

    expect(result).toEqual({ deleted: 2, paused: 2 });
    expect(fake.tables.rules.map((r) => r.id)).toEqual([pause.id, alive.id, permanent.id]);
    expect(fake.tables.rules.find((r) => r.id === pause.id)?.is_active).toBe(false);
    expect(fake.tables.rules.find((r) => r.id === pause.id)?.paused_by_expiry).toBe(true);
    expect(fake.tables.rules.find((r) => r.id === alive.id)?.paused_by_expiry).toBeFalsy();
    // Pausada mantém a data: a lista mostra "Expirada".
    expect(fake.tables.rules.find((r) => r.id === pause.id)?.expires_at).toBe(pause.expires_at);
    expect(fake.tables.rules.find((r) => r.id === alive.id)?.is_active).toBe(true);
    expect(fake.tables.sequences.map((s) => s.id)).toEqual([seqPause.id]);
    expect(fake.tables.sequences[0].is_active).toBe(false);
  });

  it("não repausa o que já está pausado (idempotente)", async () => {
    fake.tables.rules.push(makeRule({ expires_at: past(), expire_action: "pause" }));
    expect(await expireAutomations(fake.client as never)).toEqual({ deleted: 0, paused: 1 });
    expect(await expireAutomations(fake.client as never)).toEqual({ deleted: 0, paused: 0 });
  });
});

describe("matching ignora vencidas antes do sweep", () => {
  it("DM: rule vencida não responde", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, keyword: "oi", expires_at: past(), expire_action: "pause" });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);

    await processWebhookPayload(dmPayload(account.ig_user_id, "oi"));

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("no_match");
    // O tick ao fim do webhook aplicou o sweep.
    expect(fake.tables.rules[0].is_active).toBe(false);
  });

  it("DM: rule com expiração futura responde normalmente", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, keyword: "oi", expires_at: future() });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);

    await processWebhookPayload(dmPayload(account.ig_user_id, "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(fake.tables.interactions[0].status).toBe("replied");
  });

  it("comentário: rule vencida não envia a resposta privada", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      trigger_type: "comment",
      keyword: "eu quero",
      media_mode: "any",
      welcome_text: "Oi",
      welcome_button_label: "Link",
      expires_at: past(),
      expire_action: "pause",
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);

    await processWebhookPayload({
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          time: Math.floor(Date.now() / 1000),
          field: "comments",
          value: { id: "c-1", text: "eu quero", from: { id: "fan-1" }, media: { id: "media-1" } },
        },
      ],
    });

    expect(sendPrivateReplyWithButtonMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("no_match");
  });

  it("workflow por palavra-chave vencido não inicia; o seguinte ativo sim", async () => {
    const account = makeAccount();
    const expired = makeSequence({
      account_id: account.id,
      name: "Vencido",
      expires_at: past(),
      expire_action: "pause",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const alive = makeSequence({
      account_id: account.id,
      name: "Vivo",
      graph: { nodes: [triggerNode(), messageNode("m1", "Do vivo")], edges: [edge("trigger", "m1")] },
      created_at: "2026-02-01T00:00:00.000Z",
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(expired, alive);

    await processWebhookPayload(dmPayload(account.ig_user_id, "oi"));

    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-1", "Do vivo");
    expect(fake.tables.sequence_runs).toHaveLength(1);
    expect(fake.tables.sequence_runs[0].sequence_id).toBe(alive.id);
  });

  it("handoff rule → workflow: workflow de entrada vencido não continua", async () => {
    const account = makeAccount();
    const rule = makeRule({ account_id: account.id, keyword: "oi" });
    const sequence = makeSequence({
      account_id: account.id,
      entry_rule_id: rule.id,
      expires_at: past(),
      expire_action: "pause",
      graph: {
        nodes: [triggerNode({ source: "automation" }), automationNode("entry", rule.id), messageNode("m2", "Segue")],
        edges: [edge("trigger", "entry"), edge("entry", "m2")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(
      row({ account_id: account.id, ig_sender_id: "sender-1", last_inbound_at: new Date().toISOString() })
    );

    await processWebhookPayload(dmPayload(account.ig_user_id, "oi"));

    expect(sendRuleReplyMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).not.toHaveBeenCalled();
    expect(fake.tables.sequence_runs).toHaveLength(0);
  });

  it("DM: rule que vence durante a pausa humanizada não envia", async () => {
    const account = makeAccount();
    const rule = makeRule({
      account_id: account.id,
      keyword: "oi",
      expires_at: new Date(Date.now() + 40).toISOString(),
      expire_action: "pause",
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.rules.push(rule);
    vi.mocked(sleep).mockImplementationOnce(() => new Promise((r) => setTimeout(r, 80)));

    await processWebhookPayload(dmPayload(account.ig_user_id, "oi"));

    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(fake.tables.interactions[0].status).toBe("no_match");
    expect(fake.tables.interactions[0].error_detail).toBe("A automação expirou antes do envio.");
    expect(fake.tables.rule_triggers).toHaveLength(0);
  });
});

describe("workflow vencido no meio do fluxo (antes do sweep)", () => {
  function seedWaitingRun(
    accountId: string,
    sequenceId: string,
    status: "waiting_reply" | "waiting_postback" | "waiting_delay",
    nodeId: string
  ) {
    const run = row({
      sequence_id: sequenceId,
      account_id: accountId,
      ig_sender_id: "sender-1",
      status,
      current_node_id: nodeId,
      next_run_at: status === "waiting_delay" ? past() : null,
      steps_executed: 1,
      last_error: null,
      entry_rule_id: null,
      variables: {},
      started_at: past(),
      updated_at: past(),
    });
    fake.tables.sequence_runs.push(run);
    return run;
  }

  it("resposta livre não continua um workflow vencido", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      name: "Vencido",
      expires_at: past(),
      expire_action: "pause",
      graph: {
        nodes: [triggerNode({ keyword: "zzz" }), waitReplyNode("w1"), messageNode("m1", "Depois da espera")],
        edges: [edge("trigger", "w1"), edge("w1", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-1"));
    seedWaitingRun(account.id, sequence.id, "waiting_reply", "w1");

    await processWebhookPayload(dmPayload(account.ig_user_id, "qualquer coisa"));

    expect(sendTextMessageMock).not.toHaveBeenCalled();
    // O sweep do fim do webhook pausou o workflow.
    expect(fake.tables.sequences[0].is_active).toBe(false);
  });

  it("toque em botão de um workflow vencido encerra o run sem enviar", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      expires_at: past(),
      expire_action: "pause",
      graph: {
        nodes: [triggerNode({ keyword: "zzz" }), branchButtonsNode("b1"), messageNode("m1", "Ramo A")],
        edges: [edge("trigger", "b1"), edge("b1", "m1", buttonHandle(0))],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-1"));
    const run = seedWaitingRun(account.id, sequence.id, "waiting_postback", "b1");

    await processWebhookPayload({
      object: "instagram",
      entry: [
        {
          id: account.ig_user_id,
          messaging: [
            {
              sender: { id: "sender-1" },
              recipient: { id: account.ig_user_id },
              timestamp: Date.now(),
              postback: { mid: "pb-1", payload: `falow:seq:${run.id}:b1:${buttonHandle(0)}` },
            },
          ],
        },
      ],
    });

    expect(sendTextMessageMock).not.toHaveBeenCalled();
    const closed = fake.tables.sequence_runs.find((r) => r.id === run.id)!;
    expect(closed.status).toBe("completed");
    expect(closed.last_error).toBe("Sequência expirada");
  });

  it("tick de atrasos encerra run de workflow vencido em vez de retomar", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      expires_at: past(),
      expire_action: "pause",
      graph: {
        nodes: [
          triggerNode({ keyword: "zzz" }),
          node("d1", "delay", { amount: 2, unit: "hours" }),
          messageNode("m1", "Depois do atraso"),
        ],
        edges: [edge("trigger", "d1"), edge("d1", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-1"));
    const run = seedWaitingRun(account.id, sequence.id, "waiting_delay", "d1");

    await processDueRuns(5);

    expect(sendTextMessageMock).not.toHaveBeenCalled();
    const closed = fake.tables.sequence_runs.find((r) => r.id === run.id)!;
    expect(closed.status).toBe("completed");
    expect(closed.last_error).toBe("Sequência expirada");
  });

  it("tick de atrasos continua retomando workflow com expiração futura", async () => {
    const account = makeAccount();
    const sequence = makeSequence({
      account_id: account.id,
      expires_at: future(),
      graph: {
        nodes: [
          triggerNode({ keyword: "zzz" }),
          node("d1", "delay", { amount: 2, unit: "hours" }),
          messageNode("m1", "Depois do atraso"),
        ],
        edges: [edge("trigger", "d1"), edge("d1", "m1")],
      },
    });
    fake.tables.ig_accounts.push(account);
    fake.tables.sequences.push(sequence);
    fake.tables.conversations.push(makeOpenConversation(account.id, "sender-1"));
    seedWaitingRun(account.id, sequence.id, "waiting_delay", "d1");

    await processDueRuns(5);

    expect(sendTextMessageMock).toHaveBeenCalledWith(expect.any(String), "sender-1", "Depois do atraso");
  });
});
