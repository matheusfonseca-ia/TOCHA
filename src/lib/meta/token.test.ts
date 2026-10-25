import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("./oauth", () => ({ refreshLongLivedToken: refresh }));

import { AccountNotActiveError, getFreshToken } from "./token";

/** Client que falha se alguém encostar no banco. */
function untouchableAdmin() {
  return {
    from: () => {
      throw new Error("não devia tocar no banco");
    },
  } as unknown as Parameters<typeof getFreshToken>[0];
}

describe("getFreshToken", () => {
  beforeEach(() => refresh.mockReset());

  it.each(["disconnected", "expired"] as const)(
    "recusa conta %s sem renovar nem tocar no banco",
    async (status) => {
      // Token perto de vencer: se a trava não vier antes, o código tentaria renovar.
      const account = makeAccount({
        status,
        token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });

      await expect(getFreshToken(untouchableAdmin(), account)).rejects.toBeInstanceOf(AccountNotActiveError);
      expect(refresh).not.toHaveBeenCalled();
    }
  );

  it("recusa conta desconectada com token já limpo (não tenta descriptografar)", async () => {
    const account = makeAccount({ status: "disconnected", access_token_enc: "", token_expires_at: null });
    await expect(getFreshToken(untouchableAdmin(), account)).rejects.toBeInstanceOf(AccountNotActiveError);
  });

  it("devolve o token de conta ativa longe de expirar, sem renovar", async () => {
    const token = await getFreshToken(untouchableAdmin(), makeAccount({ status: "active" }));
    expect(token).toBe("token-valido-de-teste");
    expect(refresh).not.toHaveBeenCalled();
  });
});
