import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { state, send } = vi.hoisted(() => ({
  state: { admin: null as unknown, activeUser: "user-1" as string | null },
  send: vi.fn(),
}));

vi.mock("@/lib/auth/require-access", () => ({ activeUserId: async () => state.activeUser }));

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

const SUPABASE = "https://proj.supabase.co";
const OWN_UPLOAD = `${SUPABASE}/storage/v1/object/public/crm-uploads/acc-1/0b6f1c1e-1d2f-4a3b-9c8d-123456789abc-foto.png`;

describe("sendMessage com conta desconectada", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    send.mockReset();
    db = createFakeAdmin();
    state.admin = db;
    state.activeUser = "user-1";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
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

  it("sem acesso ativo (bloqueio/assinatura) não envia", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "active" }));
    state.activeUser = null;

    const result = await sendMessage("conv-1", { text: "oi" });

    expect(result).toHaveProperty("error");
    expect(send).not.toHaveBeenCalled();
  });

  it("anexo com URL de fora do bucket da conta ou tipo fora da lista é recusado", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "active" }));
    const invalid = { error: "Anexo inválido. Envie o arquivo de novo." };

    expect(await sendMessage("conv-1", { attachmentUrl: "https://evil.example/x.jpg", attachmentKind: "image" })).toEqual(invalid);
    expect(
      await sendMessage("conv-1", { attachmentUrl: OWN_UPLOAD.replace("/acc-1/", "/acc-2/"), attachmentKind: "image" })
    ).toEqual(invalid);
    expect(
      await sendMessage("conv-1", { attachmentUrl: OWN_UPLOAD, attachmentKind: "template" as never })
    ).toEqual(invalid);
    expect(send).not.toHaveBeenCalled();
  });

  it("anexo do próprio upload da conta é enviado", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "active" }));

    expect(await sendMessage("conv-1", { attachmentUrl: OWN_UPLOAD, attachmentKind: "image" })).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
