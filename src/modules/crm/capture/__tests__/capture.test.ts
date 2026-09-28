import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";
import { sendTextMessage, sendTypingAction } from "@/lib/meta/graph";
import type { IgAccount } from "@/types/database";

import { captureMessagingEvent } from "../server/capture-event";
import { observeOutbound } from "../server/observe-outbound";

/**
 * Integração da captura do CRM: webhook (mensagem, eco, sinais) e envios
 * observados, contra o fake do Supabase. O envio usa a `sendTextMessage` real
 * do graph.ts com `fetch` mockado, para exercitar o observador de ponta a ponta.
 */

const { getAdmin, setAdmin } = vi.hoisted(() => {
  let current: unknown = null;
  return { getAdmin: () => current, setAdmin: (v: unknown) => { current = v; } };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => getAdmin() }));

const LEAD = "lead-1";
let fake: FakeSupabase;
let account: IgAccount;
let nextMid = 0;

function mockSendApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      // User Profile API (busca do @ do lead)
      if (!init?.body && String(url).includes("fields=username")) {
        return new Response(JSON.stringify({ username: "ion_comunnity", name: "Ion" }), { status: 200 });
      }
      const body = JSON.parse(init?.body ?? "{}");
      const json = body.message
        ? { recipient_id: body.recipient?.id ?? "lead-from-comment", message_id: `sent-${++nextMid}` }
        : { recipient_id: body.recipient?.id };
      return new Response(JSON.stringify(json), { status: 200 });
    })
  );
}

const inbound = (message: Record<string, unknown>, ts = Date.now() - 1000) => ({
  sender: { id: LEAD },
  recipient: { id: account.ig_user_id },
  timestamp: ts,
  message,
});
const echo = (mid: string, text: string) => ({
  sender: { id: account.ig_user_id },
  recipient: { id: LEAD },
  timestamp: Date.now() - 500,
  message: { mid, text, is_echo: true },
});
const leadSignal = (extra: Record<string, unknown>) => ({
  sender: { id: LEAD },
  recipient: { id: account.ig_user_id },
  timestamp: Date.now(),
  ...extra,
});

beforeEach(() => {
  fake = createFakeAdmin();
  setAdmin(fake.client);
  account = makeAccount({ status: "active" });
  fake.tables.ig_accounts.push(account);
  nextMid = 0;
  mockSendApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mensagens do webhook", () => {
  it("mensagem do lead cria a conversa (janela fechada até o webhook abrir) e grava como contato", async () => {
    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "oi" }));

    expect(fake.tables.conversations).toHaveLength(1);
    expect(fake.tables.conversations[0].last_inbound_at ?? null).toBeNull();
    expect(fake.tables.messages).toHaveLength(1);
    expect(fake.tables.messages[0]).toMatchObject({
      account_id: account.id,
      conversation_id: fake.tables.conversations[0].id,
      ig_sender_id: LEAD,
      direction: "inbound",
      source: "contact",
      mid: "m1",
      text: "oi",
    });
  });

  it("primeira DM do lead busca e guarda o @ (eco não busca)", async () => {
    await captureMessagingEvent(account.ig_user_id, echo("e1", "oi"));
    expect(fake.tables.conversations[0].ig_sender_username ?? null).toBeNull();

    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "oi" }));
    expect(fake.tables.conversations[0].ig_sender_username).toBe("ion_comunnity");
  });

  it("webhook reentregue não duplica", async () => {
    const event = inbound({ mid: "m1", text: "oi" });
    await captureMessagingEvent(account.ig_user_id, event);
    await captureMessagingEvent(account.ig_user_id, event);
    expect(fake.tables.messages).toHaveLength(1);
  });

  it("eco sem envio registrado pelo Falow vira instagram_app", async () => {
    await captureMessagingEvent(account.ig_user_id, echo("e1", "resposta pelo app"));
    expect(fake.tables.messages[0]).toMatchObject({ direction: "outbound", source: "instagram_app", ig_sender_id: LEAD });
  });

  it("conta inativa ou desconhecida: nada é gravado", async () => {
    await captureMessagingEvent("outra-conta", inbound({ mid: "m1", text: "oi" }));
    expect(fake.tables.messages).toHaveLength(0);
    expect(fake.tables.conversations).toHaveLength(0);
  });

  it("falha no banco nunca lança", async () => {
    setAdmin({ from: () => { throw new Error("banco fora"); } });
    await expect(captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "oi" }))).resolves.toBeUndefined();
  });
});

describe("envios observados", () => {
  it("envio grava com a origem do contexto; o eco depois não duplica nem troca a origem", async () => {
    await observeOutbound({ igUserId: account.ig_user_id, source: "automation" }, () =>
      sendTextMessage("tok", LEAD, "Oi! Tudo bem?")
    );
    expect(fake.tables.messages).toHaveLength(1);
    expect(fake.tables.messages[0]).toMatchObject({ source: "automation", mid: "sent-1", text: "Oi! Tudo bem?" });

    await captureMessagingEvent(account.ig_user_id, echo("sent-1", "Oi! Tudo bem?"));
    expect(fake.tables.messages).toHaveLength(1);
    expect(fake.tables.messages[0].source).toBe("automation");
  });

  it("eco que chega antes do registro do envio é corrigido para a origem certa", async () => {
    await captureMessagingEvent(account.ig_user_id, echo("sent-1", "Oi"));
    expect(fake.tables.messages[0].source).toBe("instagram_app");

    await observeOutbound({ accountId: account.id, source: "agent", sentBy: "user-1" }, () =>
      sendTextMessage("tok", LEAD, "Oi")
    );
    expect(fake.tables.messages).toHaveLength(1);
    expect(fake.tables.messages[0]).toMatchObject({ source: "agent", sent_by: "user-1" });
  });

  it("contexto mais interno vence: workflow iniciado por regra grava como workflow", async () => {
    await observeOutbound({ accountId: account.id, source: "automation" }, async () => {
      await sendTextMessage("tok", LEAD, "da regra");
      await observeOutbound({ accountId: account.id, source: "workflow" }, () =>
        sendTextMessage("tok", LEAD, "do fluxo")
      );
    });
    expect(fake.tables.messages.map((m) => [m.text, m.source])).toEqual([
      ["da regra", "automation"],
      ["do fluxo", "workflow"],
    ]);
  });

  it("digitando não é mensagem; envio fora de contexto não grava", async () => {
    await observeOutbound({ accountId: account.id, source: "automation" }, () => sendTypingAction("tok", LEAD));
    await sendTextMessage("tok", LEAD, "sem contexto");
    expect(fake.tables.messages).toHaveLength(0);
  });

  it("falha ao gravar não derruba o envio", async () => {
    setAdmin({ from: () => { throw new Error("banco fora"); } });
    const res = await observeOutbound({ accountId: account.id, source: "automation" }, () =>
      sendTextMessage("tok", LEAD, "Oi")
    );
    expect(res).toMatchObject({ message_id: "sent-1" });
  });
});

describe("sinais do lead", () => {
  it("reação que chega antes da mensagem espera na fila e é aplicada quando ela chega", async () => {
    await captureMessagingEvent(
      account.ig_user_id,
      leadSignal({ reaction: { mid: "m1", action: "react", reaction: "like", emoji: "👍" } })
    );
    expect(fake.tables.message_signals_pending).toHaveLength(1);

    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "teste de reação" }));
    expect(fake.tables.messages[0].reaction_emoji).toBe("👍");
    expect(fake.tables.message_signals_pending).toHaveLength(0);
  });

  it("edição antes da mensagem: texto novo, original preservado", async () => {
    await captureMessagingEvent(
      account.ig_user_id,
      leadSignal({ message_edit: { mid: "m1", text: "teste de edição - editado agora", num_edit: 1 } })
    );
    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "teste de edição" }));

    expect(fake.tables.messages[0]).toMatchObject({
      text: "teste de edição - editado agora",
      original_text: "teste de edição",
      edit_count: 1,
    });
    expect(fake.tables.messages[0].edited_at).toEqual(expect.any(String));
  });

  it("segunda edição mantém o texto original da primeira", async () => {
    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "v1" }));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ message_edit: { mid: "m1", text: "v2", num_edit: 1 } }));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ message_edit: { mid: "m1", text: "v3", num_edit: 2 } }));
    expect(fake.tables.messages[0]).toMatchObject({ text: "v3", original_text: "v1", edit_count: 2 });
  });

  it("lead desfez o envio; reação removida", async () => {
    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "teste apagar" }));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ reaction: { mid: "m1", action: "react", emoji: "😂" } }));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ reaction: { mid: "m1", action: "unreact" } }));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ message: { mid: "m1", is_deleted: true } }));

    expect(fake.tables.messages[0].reaction_emoji).toBeNull();
    expect(fake.tables.messages[0].deleted_by_contact_at).toEqual(expect.any(String));
  });

  it("reação a mensagem enviada pelo Falow é aplicada nela", async () => {
    await observeOutbound({ accountId: account.id, source: "automation" }, () => sendTextMessage("tok", LEAD, "Oi"));
    await captureMessagingEvent(account.ig_user_id, leadSignal({ reaction: { mid: "sent-1", action: "react", emoji: "❤️" } }));
    expect(fake.tables.messages[0].reaction_emoji).toBe("❤️");
  });

  it("visto só avança", async () => {
    await captureMessagingEvent(account.ig_user_id, inbound({ mid: "m1", text: "oi" }));
    const later = Date.now() - 100;
    await captureMessagingEvent(account.ig_user_id, { ...leadSignal({ read: { mid: "m1" } }), timestamp: later });
    await captureMessagingEvent(account.ig_user_id, { ...leadSignal({ read: { mid: "m1" } }), timestamp: later - 60_000 });
    expect(fake.tables.conversations[0].contact_seen_at).toBe(new Date(later).toISOString());
  });
});
