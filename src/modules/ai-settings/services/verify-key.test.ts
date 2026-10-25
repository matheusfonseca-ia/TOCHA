import { describe, expect, it } from "vitest";

import { verifyAiKey } from "./verify-key";

const respond = (status: number) =>
  (async () => ({ ok: status >= 200 && status < 300, status }) as Response) as unknown as typeof fetch;

describe("verifyAiKey na OpenRouter", () => {
  it("chave aceita", async () => {
    expect(await verifyAiKey("openrouter", "k", respond(200))).toEqual({ ok: true });
  });

  it("401 e 403 são chave inválida", async () => {
    expect(await verifyAiKey("openrouter", "k", respond(401))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAiKey("openrouter", "k", respond(403))).toEqual({ ok: false, reason: "invalid" });
  });

  it("5xx não acusa a chave", async () => {
    expect(await verifyAiKey("openrouter", "k", respond(503))).toEqual({ ok: false, reason: "unreachable" });
  });

  it("falha de rede é inalcançável", async () => {
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    expect(await verifyAiKey("openrouter", "k", boom)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("manda a chave no Authorization", async () => {
    let auth = "";
    const spy = (async (_url: string, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string>).Authorization);
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await verifyAiKey("openrouter", "abc", spy);
    expect(auth).toBe("Bearer abc");
  });
});

describe("verifyAiKey na OpenAI", () => {
  it("200 é chave válida", async () => {
    expect(await verifyAiKey("openai", "sk-1", respond(200))).toEqual({ ok: true });
  });

  it("401 é chave inválida", async () => {
    expect(await verifyAiKey("openai", "sk-1", respond(401))).toEqual({ ok: false, reason: "invalid" });
  });

  it("403 é chave restrita sem listar modelos: guarda", async () => {
    expect(await verifyAiKey("openai", "sk-1", respond(403))).toEqual({ ok: true });
  });

  it("outros status e falha de rede são erro de serviço, não da chave", async () => {
    expect(await verifyAiKey("openai", "sk-1", respond(429))).toEqual({ ok: false, reason: "unreachable" });
    expect(await verifyAiKey("openai", "sk-1", respond(500))).toEqual({ ok: false, reason: "unreachable" });
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await verifyAiKey("openai", "sk-1", boom)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("consulta GET /v1/models com Bearer", async () => {
    let url = "";
    let auth = "";
    const spy = (async (u: string, init?: RequestInit) => {
      url = String(u);
      auth = String((init?.headers as Record<string, string>).Authorization);
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    await verifyAiKey("openai", "sk-abc", spy);
    expect(url).toBe("https://api.openai.com/v1/models");
    expect(auth).toBe("Bearer sk-abc");
  });
});
