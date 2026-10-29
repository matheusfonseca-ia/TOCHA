import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("./oauth", () => ({ refreshLongLivedToken: refresh }));

import { decryptToken, encryptToken } from "@/lib/crypto";
import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";

import {
  AccountNotActiveError,
  getFreshToken,
  resetTokenRefreshState,
  tokenExpiresAtFrom,
} from "./token";

/** Client que falha se alguém encostar no banco. */
function untouchableAdmin() {
  return {
    from: () => {
      throw new Error("não devia tocar no banco");
    },
  } as unknown as Parameters<typeof getFreshToken>[0];
}

describe("getFreshToken", () => {
  beforeEach(() => {
    refresh.mockReset();
    resetTokenRefreshState();
  });

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

  it("token_expires_at nulo conta como 'renovar já' e grava a validade (60 dias sem expires_in)", async () => {
    const db = createFakeAdmin();
    const account = makeAccount({ status: "active", token_expires_at: null });
    db.tables.ig_accounts.push({ ...account });
    refresh.mockResolvedValue({ token: "token-novo", expiresIn: null });

    const token = await getFreshToken(db.client as never, account);

    expect(token).toBe("token-novo");
    const saved = db.tables.ig_accounts[0];
    expect(decryptToken(saved.access_token_enc)).toBe("token-novo");
    const days = (Date.parse(saved.token_expires_at) - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(59);
  });

  it("renovação que falhou não é tentada de novo a cada envio", async () => {
    const account = makeAccount({
      status: "active",
      token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });
    refresh.mockRejectedValue(new Error("rede"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await getFreshToken(untouchableAdmin(), account)).toBe("token-valido-de-teste");
    expect(await getFreshToken(untouchableAdmin(), account)).toBe("token-valido-de-teste");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("chamadas concorrentes compartilham a mesma renovação", async () => {
    const db = createFakeAdmin();
    const account = makeAccount({
      status: "active",
      access_token_enc: encryptToken("token-velho"),
      token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });
    db.tables.ig_accounts.push(account);
    refresh.mockResolvedValue({ token: "token-novo", expiresIn: 5_184_000 });

    const [a, b] = await Promise.all([
      getFreshToken(db.client as never, account),
      getFreshToken(db.client as never, account),
    ]);
    expect([a, b]).toEqual(["token-novo", "token-novo"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tokenExpiresAtFrom usa expires_in quando vem e 60 dias quando falta", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(tokenExpiresAtFrom(3600, now)).toBe(new Date(now + 3600 * 1000).toISOString());
    expect(tokenExpiresAtFrom(null, now)).toBe(new Date(now + 60 * 24 * 3600 * 1000).toISOString());
  });
});
