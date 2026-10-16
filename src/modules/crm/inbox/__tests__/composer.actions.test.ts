import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { state, send } = vi.hoisted(() => ({
  state: { admin: null as unknown },
  send: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (state.admin as FakeSupabase).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "conv-1",
              account_id: "acc-1",
              ig_sender_id: "lead-1",
              last_inbound_at: new Date().toISOString(),
            },
          }),
        }),
      }),
    }),
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));
vi.mock("@/lib/meta/graph", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta/graph")>()),
  sendTextMessage: send,
  sendAttachmentMessage: send,
  sendLikeHeartSticker: send,
}));
vi.mock("@/modules/crm/server", () => ({
  observeOutbound: async (_ctx: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock("../../handoff/server/takeover", () => ({ setTakeover: vi.fn() }));

import { sendMessage } from "../services/composer.actions";

describe("sendMessage com conta desconectada", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    send.mockReset();
    db = createFakeAdmin();
    state.admin = db;
  });

  it("devolve o erro amigável e não chama a Graph API", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "disconnected" }));

    const result = await sendMessage("conv-1", { text: "oi" });

    expect(result).toEqual({
      error: "Esta conta do Instagram está desconectada. Reconecte para enviar mensagens.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("conta ativa envia normalmente", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "active" }));

    expect(await sendMessage("conv-1", { text: "oi" })).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
