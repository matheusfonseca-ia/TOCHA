import type { createAdminClient } from "@/lib/supabase/admin";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import {
  collectInputNode,
  conditionNode,
  edge,
  makeAccount,
  makeOpenConversation,
  makeSequence,
  messageNode,
  row,
  setFieldNode,
  triggerNode,
} from "@/lib/sequences/__tests__/fixtures";
import { INVALID_HANDLE, NO_HANDLE, YES_HANDLE } from "@/types/sequence";

/**
 * Integração dos nós de dados (Coletar dado, Condição, Definir campo ou tag)
 * e das variáveis {{campo}} nos textos, com o mesmo fake de Supabase e os
 * mesmos mocks de envio de runtime.test.ts.
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

const { sendTextMessageMock, sendTypingActionMock } = vi.hoisted(() => ({
  sendTextMessageMock: vi.fn(async (_token: string, _recipient: string, _text: string) => {}),
  sendTypingActionMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/meta/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/graph")>();
  return {
    ...actual,
    sendTextMessage: sendTextMessageMock,
    sendImageMessage: vi.fn(async () => {}),
    sendQuickRepliesMessage: vi.fn(async () => {}),
    sendTemplateButtonsMessage: vi.fn(async () => {}),
    sendTypingAction: sendTypingActionMock,
  };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return { ...actual, sleep: vi.fn(async () => {}) };
});

import { handleSequenceReply, maybeStartSequence } from "@/lib/sequences/runtime";

type AdminClient = ReturnType<typeof createAdminClient>;

let fake: FakeSupabase;
let admin: AdminClient;

beforeEach(() => {
  fake = createFakeAdmin();
  admin = fake.client as unknown as AdminClient;
  setAdmin(fake.client);
  vi.clearAllMocks();
});

const sentTexts = () => sendTextMessageMock.mock.calls.map((c) => c[2]);

function setup(sequence: ReturnType<typeof makeSequence>, senderId: string) {
  const account = makeAccount({ id: sequence.account_id });
  fake.tables.ig_accounts.push(account);
  fake.tables.sequences.push(sequence);
  fake.tables.conversations.push(makeOpenConversation(account.id, senderId));
  return account;
}

describe("Coletar dado", () => {
  const collectFlow = () =>
    makeSequence({
      account_id: "acc-collect",
      graph: {
        nodes: [
          triggerNode({ keyword: "cadastro" }),
          collectInputNode("c1", { fieldKey: "email", inputType: "email", maxAttempts: 2 }),
          messageNode("ok", "Obrigado, {{email}}!"),
          messageNode("fail", "Tudo bem, seguimos sem o e-mail."),
        ],
        edges: [
          edge("trigger", "c1"),
          edge("c1", "ok"),
          edge("c1", "fail", INVALID_HANDLE),
        ],
      },
    });

  it("pergunta e fica esperando no próprio nó (waiting_reply)", async () => {
    const account = setup(collectFlow(), "s-1");

    const started = await maybeStartSequence(admin, account, "s-1", "cadastro");

    expect(started?.status).toBe("replied");
    expect(sentTexts()).toEqual(["Qual seu e-mail?"]);
    // Mesmo delay humanizado dos outros envios (typing antes da mensagem).
    expect(sendTypingActionMock).toHaveBeenCalledTimes(1);
    const run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("waiting_reply");
    expect(run.current_node_id).toBe("c1");
  });

  it("resposta válida grava no contato e nas variáveis e segue por 'out'", async () => {
    const account = setup(collectFlow(), "s-2");
    await maybeStartSequence(admin, account, "s-2", "cadastro");

    const resumed = await handleSequenceReply(
      admin, account, "s-2", undefined, "claro, é Ana@Exemplo.com"
    );

    expect(resumed?.status).toBe("replied");
    expect(sentTexts()).toEqual(["Qual seu e-mail?", "Obrigado, ana@exemplo.com!"]);

    expect(fake.tables.contacts).toHaveLength(1);
    const contact = fake.tables.contacts[0];
    expect(contact.account_id).toBe(account.id);
    expect(contact.ig_sender_id).toBe("s-2");
    expect(contact.fields).toEqual({ email: "ana@exemplo.com" });

    const run = fake.tables.sequence_runs[0];
    expect(run.variables.email).toBe("ana@exemplo.com");
    expect(run.status).toBe("completed");
  });

  it("resposta inválida reenvia o erro e, esgotadas as tentativas, segue por 'invalid'", async () => {
    const account = setup(collectFlow(), "s-3");
    await maybeStartSequence(admin, account, "s-3", "cadastro");

    const first = await handleSequenceReply(admin, account, "s-3", undefined, "não tenho");
    expect(first?.status).toBe("replied");
    let run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("waiting_reply");
    expect(run.current_node_id).toBe("c1");
    expect(run.variables.__attempts).toEqual({ c1: 1 });
    expect(sentTexts()).toEqual(["Qual seu e-mail?", "E-mail inválido, tente de novo."]);

    const second = await handleSequenceReply(admin, account, "s-3", undefined, "sei lá");
    expect(second?.status).toBe("replied");
    expect(sentTexts()).toEqual([
      "Qual seu e-mail?",
      "E-mail inválido, tente de novo.",
      "Tudo bem, seguimos sem o e-mail.",
    ]);
    run = fake.tables.sequence_runs[0];
    expect(run.status).toBe("completed");
    expect(run.variables.__attempts).toEqual({});
    expect(fake.tables.contacts).toHaveLength(0);
  });

  it("sem ligação em 'invalid', esgotar as tentativas encerra o run como completed", async () => {
    const sequence = makeSequence({
      account_id: "acc-collect-2",
      graph: {
        nodes: [
          triggerNode({ keyword: "idade" }),
          collectInputNode("c1", {
            question: "Quantos anos?",
            fieldKey: "idade",
            inputType: "number",
            maxAttempts: 1,
          }),
          messageNode("ok", "Anotado"),
        ],
        edges: [edge("trigger", "c1"), edge("c1", "ok")],
      },
    });
    const account = setup(sequence, "s-4");
    await maybeStartSequence(admin, account, "s-4", "idade");

    await handleSequenceReply(admin, account, "s-4", undefined, "muitos");

    expect(sentTexts()).toEqual(["Quantos anos?"]);
    expect(fake.tables.sequence_runs[0].status).toBe("completed");
  });
});

describe("Condição", () => {
  const conditionFlow = (accountId: string) =>
    makeSequence({
      account_id: accountId,
      graph: {
        nodes: [
          triggerNode({ keyword: "plano" }),
          conditionNode("cond", { fieldKey: "plano", operator: "equals", value: "pro" }),
          messageNode("yes", "Você é Pro"),
          messageNode("no", "Conheça o Pro"),
        ],
        edges: [
          edge("trigger", "cond"),
          edge("cond", "yes", YES_HANDLE),
          edge("cond", "no", NO_HANDLE),
        ],
      },
    });

  it("verdadeira segue por 'sim' (campo vindo do contato)", async () => {
    const account = setup(conditionFlow("acc-cond-1"), "s-6");
    fake.tables.contacts.push(
      row({ account_id: account.id, ig_sender_id: "s-6", ig_username: null, fields: { plano: "PRO" }, tags: [] })
    );

    await maybeStartSequence(admin, account, "s-6", "plano");

    expect(sentTexts()).toEqual(["Você é Pro"]);
  });

  it("falsa segue por 'não'", async () => {
    const account = setup(conditionFlow("acc-cond-2"), "s-7");

    await maybeStartSequence(admin, account, "s-7", "plano");

    expect(sentTexts()).toEqual(["Conheça o Pro"]);
  });

  it("hasTag lê as tags do contato", async () => {
    const sequence = makeSequence({
      account_id: "acc-cond-3",
      graph: {
        nodes: [
          triggerNode({ keyword: "vip" }),
          conditionNode("cond", { fieldKey: "", operator: "hasTag", value: "vip" }),
          messageNode("yes", "Oi VIP"),
        ],
        edges: [edge("trigger", "cond"), edge("cond", "yes", YES_HANDLE)],
      },
    });
    const account = setup(sequence, "s-8");
    fake.tables.contacts.push(
      row({ account_id: account.id, ig_sender_id: "s-8", ig_username: null, fields: {}, tags: ["VIP"] })
    );

    await maybeStartSequence(admin, account, "s-8", "vip");

    expect(sentTexts()).toEqual(["Oi VIP"]);
  });
});

describe("Definir campo ou tag", () => {
  it("adiciona tag ao contato e grava campo com variáveis", async () => {
    const sequence = makeSequence({
      account_id: "acc-set",
      graph: {
        nodes: [
          triggerNode({ keyword: "quero" }),
          setFieldNode("tag", { mode: "tag", value: "interessado", tagAction: "add" }),
          setFieldNode("f", { mode: "field", fieldKey: "origem", value: "dm de {{username}}" }),
          messageNode("m", "Origem: {{origem}}"),
        ],
        edges: [edge("trigger", "tag"), edge("tag", "f"), edge("f", "m")],
      },
    });
    const account = setup(sequence, "s-9");
    fake.tables.conversations[0].ig_sender_username = "ana.dev";

    const outcome = await maybeStartSequence(admin, account, "s-9", "quero");

    expect(outcome?.status).toBe("replied");
    const contact = fake.tables.contacts[0];
    expect(contact.tags).toEqual(["interessado"]);
    expect(contact.fields).toEqual({ origem: "dm de ana.dev" });
    expect(contact.ig_username).toBe("ana.dev");
    expect(fake.tables.sequence_runs[0].variables.origem).toBe("dm de ana.dev");
    expect(sentTexts()).toEqual(["Origem: dm de ana.dev"]);
  });

  it("remove tag sem duplicar nem apagar as outras", async () => {
    const sequence = makeSequence({
      account_id: "acc-set-2",
      graph: {
        nodes: [
          triggerNode({ keyword: "sair" }),
          setFieldNode("tag", { mode: "tag", value: "LEAD", tagAction: "remove" }),
          messageNode("m", "Pronto"),
        ],
        edges: [edge("trigger", "tag"), edge("tag", "m")],
      },
    });
    const account = setup(sequence, "s-10");
    fake.tables.contacts.push(
      row({ account_id: account.id, ig_sender_id: "s-10", ig_username: null, fields: { a: "1" }, tags: ["lead", "vip"] })
    );

    await maybeStartSequence(admin, account, "s-10", "sair");

    expect(fake.tables.contacts).toHaveLength(1);
    expect(fake.tables.contacts[0].tags).toEqual(["vip"]);
    expect(fake.tables.contacts[0].fields).toEqual({ a: "1" });
  });
});

describe("Variáveis nos textos", () => {
  it("renderiza {{campo}} do contato e deixa vazio o que não existe", async () => {
    const sequence = makeSequence({
      account_id: "acc-tpl",
      graph: {
        nodes: [triggerNode({ keyword: "oi" }), messageNode("m", "Oi {{nome}}{{sobrenome}}, seu plano é {{plano}}.")],
        edges: [edge("trigger", "m")],
      },
    });
    const account = setup(sequence, "s-11");
    fake.tables.contacts.push(
      row({ account_id: account.id, ig_sender_id: "s-11", ig_username: null, fields: { nome: "Bia", plano: "pro" }, tags: [] })
    );

    await maybeStartSequence(admin, account, "s-11", "oi");

    expect(sentTexts()).toEqual(["Oi Bia, seu plano é pro."]);
  });
});
