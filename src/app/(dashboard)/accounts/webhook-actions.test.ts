import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.TOKEN_ENCRYPTION_KEY ??= "a".repeat(64);

const { state, subscribe } = vi.hoisted(() => ({
  state: { rows: {} as Record<string, { status: string; access_token_enc: string }>, activeUser: "c1" as string | null },
  subscribe: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/meta/graph", () => ({ subscribeAccountToWebhooks: (...a: unknown[]) => subscribe(...a) }));
vi.mock("@/lib/auth/require-access", () => ({ activeUserId: async () => state.activeUser }));
vi.mock("@/lib/supabase/server", () => ({
  // client do usuário: o RLS de select só devolve as contas dele
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({ data: state.rows[id] ?? null, error: null }),
        }),
      }),
    }),
  }),
}));

import { resubscribeAccount } from "@/app/(dashboard)/accounts/webhook-actions";
import { encryptToken } from "@/lib/crypto";

describe("resubscribeAccount", () => {
  beforeEach(() => {
    state.rows = { "acc-minha": { status: "active", access_token_enc: encryptToken("tok-minha") } };
    state.activeUser = "c1";
    subscribe.mockReset().mockResolvedValue(undefined);
  });

  it("refaz a inscrição com o token da própria conta", async () => {
    expect(await resubscribeAccount("acc-minha")).toEqual({});
    expect(subscribe).toHaveBeenCalledWith("tok-minha");
  });

  it("recusa conta alheia (RLS não devolve) e quem está sem acesso", async () => {
    expect((await resubscribeAccount("acc-alheia")).error).toBeTruthy();
    state.activeUser = null;
    expect((await resubscribeAccount("acc-minha")).error).toBeTruthy();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("conta desconectada ou token ilegível: pede para reconectar", async () => {
    state.rows["acc-off"] = { status: "disconnected", access_token_enc: "" };
    state.rows["acc-lixo"] = { status: "active", access_token_enc: "lixo" };
    expect((await resubscribeAccount("acc-off")).error).toMatch(/Conecte/);
    expect((await resubscribeAccount("acc-lixo")).error).toMatch(/Conecte/);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("Meta recusa de novo: devolve erro", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    subscribe.mockRejectedValue(new Error("permissão"));
    expect((await resubscribeAccount("acc-minha")).error).toBeTruthy();
  });
});
