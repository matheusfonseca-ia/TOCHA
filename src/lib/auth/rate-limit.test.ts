import { describe, expect, it, vi } from "vitest";

import { allowAttempt, limiterKey, type RateLimiter } from "@/lib/auth/rate-limit";

function limiter(success: boolean): RateLimiter & { limit: ReturnType<typeof vi.fn> } {
  return { limit: vi.fn(async () => ({ success })) };
}

describe("limiterKey", () => {
  it("normaliza o e-mail: maiúsculas e espaços não abrem um balde novo", async () => {
    expect(await limiterKey("login", "  Fulano@Exemplo.com ")).toBe(await limiterKey("login", "fulano@exemplo.com"));
  });

  it("separa os baldes por ação", async () => {
    expect(await limiterKey("login", "a@b.com")).not.toBe(await limiterKey("reset", "a@b.com"));
  });

  it("não guarda o e-mail em texto puro na chave", async () => {
    const key = await limiterKey("login", "fulano@exemplo.com");
    expect(key).not.toContain("fulano");
    expect(key).toMatch(/^login:[0-9a-f]{64}$/);
  });
});

describe("allowAttempt", () => {
  it("libera quando o limitador libera", async () => {
    const l = limiter(true);
    expect(await allowAttempt(l, "login", "a@b.com")).toBe(true);
    expect(l.limit).toHaveBeenCalledWith({ key: await limiterKey("login", "a@b.com") });
  });

  it("bloqueia quando o limitador estoura", async () => {
    expect(await allowAttempt(limiter(false), "login", "a@b.com")).toBe(false);
  });

  it("sem binding (dev, testes) libera: a trava de borda continua valendo", async () => {
    expect(await allowAttempt(undefined, "login", "a@b.com")).toBe(true);
  });

  it("erro do limitador libera em vez de travar o login de todo mundo", async () => {
    const l: RateLimiter = { limit: vi.fn(async () => Promise.reject(new Error("boom"))) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await allowAttempt(l, "login", "a@b.com")).toBe(true);
    spy.mockRestore();
  });
});
