import { describe, expect, it } from "vitest";

import { verifyOpenRouterKey } from "./verify-key";

const respond = (status: number) =>
  (async () => ({ ok: status >= 200 && status < 300, status }) as Response) as unknown as typeof fetch;

describe("verifyOpenRouterKey", () => {
  it("chave aceita", async () => {
    expect(await verifyOpenRouterKey("k", respond(200))).toEqual({ ok: true });
  });

  it("401 e 403 são chave inválida", async () => {
    expect(await verifyOpenRouterKey("k", respond(401))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyOpenRouterKey("k", respond(403))).toEqual({ ok: false, reason: "invalid" });
  });

  it("5xx não acusa a chave", async () => {
    expect(await verifyOpenRouterKey("k", respond(503))).toEqual({ ok: false, reason: "unreachable" });
  });

  it("falha de rede é inalcançável", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    expect(await verifyOpenRouterKey("k", boom)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("manda a chave no Authorization", async () => {
    let auth = "";
    const spy = (async (_url: string, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string>).Authorization);
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await verifyOpenRouterKey("abc", spy);
    expect(auth).toBe("Bearer abc");
  });
});
