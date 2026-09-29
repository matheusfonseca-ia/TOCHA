import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";
import type { IgAccount } from "@/types/database";

import { importHistoryBatch } from "../server/import-history";

/**
 * `importHistoryBatch` contra o fake do Supabase, com `fetch` mockado para a
 * Conversations API (paginação de conversas + mensagens por conversa).
 */

let fake: FakeSupabase;
let account: IgAccount;
const LEAD = "lead-1";

function conversationsPage(after: string | null, hasNext: boolean) {
  return {
    data: [{ id: `conv-${after ?? "1"}`, participants: { data: [{ id: account.ig_user_id }, { id: LEAD }] } }],
    paging: hasNext ? { cursors: { after: `cursor-${after ?? "1"}` }, next: "https://..." } : { cursors: {} },
  };
}

function mockConversationsApi(messagesByConversation: Record<string, unknown[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("me/conversations")) {
        const afterMatch = u.match(/after=([^&]+)/);
        const after = afterMatch ? decodeURIComponent(afterMatch[1]) : null;
        // Só a 1ª página tem próxima; a 2ª fecha a paginação.
        return new Response(JSON.stringify(conversationsPage(after, after === null)), { status: 200 });
      }
      const convMatch = u.match(/\/(conv-[^?]+)\?/);
      const convId = convMatch?.[1];
      const messages = (convId && messagesByConversation[convId]) ?? [];
      return new Response(JSON.stringify({ messages: { data: messages } }), { status: 200 });
    })
  );
}

beforeEach(() => {
  fake = createFakeAdmin();
  account = makeAccount({ status: "active" });
  fake.tables.ig_accounts.push(account);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importHistoryBatch", () => {
  it("importa mensagens da 1ª página e devolve o cursor da próxima", async () => {
    mockConversationsApi({
      "conv-1": [
        { id: "m1", created_time: "2026-09-01T10:00:00+0000", from: { id: LEAD }, message: "oi" },
        {
          id: "m2",
          created_time: "2026-09-01T10:01:00+0000",
          from: { id: account.ig_user_id },
          message: "tudo bem?",
        },
      ],
    });

    const result = await importHistoryBatch(fake.client as never, account, null);

    expect(result).toMatchObject({ done: false, conversationsProcessed: 1, messagesImported: 2 });
    expect(result.nextCursor).toBe("cursor-1");
    expect(fake.tables.messages).toHaveLength(2);
    expect(fake.tables.messages.map((m) => m.direction).sort()).toEqual(["inbound", "outbound"]);
    expect(fake.tables.messages.every((m) => m.source === "import")).toBe(true);
  });

  it("2ª chamada com o cursor devolvido fecha a paginação (done: true)", async () => {
    mockConversationsApi({ "conv-cursor-1": [] });
    const result = await importHistoryBatch(fake.client as never, account, "cursor-1");
    expect(result).toMatchObject({ done: true, nextCursor: null });
  });

  it("dedupe: rodar o mesmo lote 2x não duplica mensagens", async () => {
    mockConversationsApi({
      "conv-1": [{ id: "m1", created_time: "2026-09-01T10:00:00+0000", from: { id: LEAD }, message: "oi" }],
    });

    await importHistoryBatch(fake.client as never, account, null);
    await importHistoryBatch(fake.client as never, account, null);

    expect(fake.tables.messages).toHaveLength(1);
  });

  it("last_inbound_at só avança: lote com mensagem mais antiga não volta a janela", async () => {
    fake.tables.conversations.push({
      id: "c1",
      account_id: account.id,
      ig_sender_id: LEAD,
      last_inbound_at: "2026-09-05T00:00:00.000Z",
    });
    mockConversationsApi({
      "conv-1": [{ id: "m-old", created_time: "2026-08-01T10:00:00+0000", from: { id: LEAD }, message: "mensagem antiga" }],
    });

    await importHistoryBatch(fake.client as never, account, null);

    expect(fake.tables.conversations[0].last_inbound_at).toBe("2026-09-05T00:00:00.000Z");
  });

  it("last_inbound_at avança quando a mensagem importada é mais recente", async () => {
    fake.tables.conversations.push({
      id: "c1",
      account_id: account.id,
      ig_sender_id: LEAD,
      last_inbound_at: "2026-08-01T00:00:00.000Z",
    });
    mockConversationsApi({
      "conv-1": [{ id: "m-new", created_time: "2026-09-10T10:00:00+0000", from: { id: LEAD }, message: "mensagem nova" }],
    });

    await importHistoryBatch(fake.client as never, account, null);

    expect(fake.tables.conversations[0].last_inbound_at).toBe(
      new Date("2026-09-10T10:00:00+0000").toISOString()
    );
  });

  it("conversa sem participante identificável além da conta é ignorada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("me/conversations")) {
          return new Response(
            JSON.stringify({
              data: [{ id: "conv-solo", participants: { data: [{ id: account.ig_user_id }] } }],
              paging: { cursors: {} },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ messages: { data: [] } }), { status: 200 });
      })
    );

    const result = await importHistoryBatch(fake.client as never, account, null);
    expect(result.messagesImported).toBe(0);
    expect(fake.tables.messages).toHaveLength(0);
  });
});
