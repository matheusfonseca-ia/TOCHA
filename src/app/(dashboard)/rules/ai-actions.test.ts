import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, generate } = vi.hoisted(() => ({
  state: {
    userId: "user-1" as string | null,
    /** Resultado da checagem de acesso (bloqueio/assinatura). */
    active: true,
    /** Linha de user_ai_settings do usuário logado (chave "cifrada" = enc:<chave>). */
    row: null as { api_key_enc: string; model: string | null; provider: string | null } | null,
  },
  generate: vi.fn(async () => ({ suggestions: ["ok"] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth/require-access", () => ({
  activeUserId: async () => (state.userId && state.active ? state.userId : null),
}));
vi.mock("@/lib/crypto", () => ({
  decryptToken: (enc: string) => enc.replace(/^enc:/, ""),
}));
vi.mock("@/lib/ai/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/provider")>()),
  // Chave padrão da instalação sempre presente: o que muda é quem pode usá-la.
  aiConfigFromEnv: () => ({ provider: "openrouter", apiKey: "chave-da-instalacao", model: "m" }),
  generateFieldSuggestions: generate,
}));

import { generateForField, isAiEnabled } from "@/app/(dashboard)/rules/ai-actions";

function usedKey(): string {
  const calls = generate.mock.calls as unknown as Array<[unknown, { config: { apiKey: string } }]>;
  return calls.at(-1)![1].config.apiKey;
}

describe("IA nos campos", () => {
  beforeEach(() => {
    state.userId = "user-1";
    state.active = true;
    state.row = null;
    generate.mockClear();
  });

  it("dono sem chave própria usa a chave da instalação", async () => {
    expect(await isAiEnabled()).toBe(true);
    expect(await generateForField({ field: "publicReply" })).toEqual({ suggestions: ["ok"] });
    expect(usedKey()).toBe("chave-da-instalacao");
  });

  it("cliente sem chave própria não usa a da instalação, inclusive chamando a action direto", async () => {
    state.userId = "cliente-1";
    expect(await isAiEnabled()).toBe(false);
    expect(await generateForField({ field: "publicReply" })).toHaveProperty("error");
    expect(generate).not.toHaveBeenCalled();
  });

  it("cliente com chave própria usa a dele", async () => {
    state.userId = "cliente-1";
    state.row = { api_key_enc: "enc:sk-or-do-cliente", model: null, provider: "openrouter" };
    expect(await isAiEnabled()).toBe(true);
    expect(await generateForField({ field: "publicReply" })).toEqual({ suggestions: ["ok"] });
    expect(usedKey()).toBe("sk-or-do-cliente");
  });

  it("bloqueada sem sessão", async () => {
    state.userId = null;
    expect(await isAiEnabled()).toBe(false);
    expect(await generateForField({ field: "publicReply" })).toHaveProperty("error");
  });

  it("cliente bloqueado/sem assinatura não gera, mesmo com chave própria", async () => {
    state.userId = "cliente-1";
    state.active = false;
    state.row = { api_key_enc: "enc:sk-or-do-cliente", model: null, provider: "openrouter" };
    expect(await generateForField({ field: "publicReply" })).toEqual({ error: expect.stringContaining("assinatura") });
    expect(generate).not.toHaveBeenCalled();
  });

  it("valida o input em runtime: campo fora do catálogo, count e tamanhos", async () => {
    for (const bad of [
      { field: "__proto__" },
      { field: "inexistente" },
      { field: "publicReply", count: Number.NaN },
      { field: "publicReply", count: 9 },
      { field: "publicReply", instruction: "x".repeat(301) },
      { field: "publicReply", context: { ruleName: "x".repeat(201) } },
    ]) {
      expect(await generateForField(bad as never), JSON.stringify(bad)).toHaveProperty("error");
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("count padrão 3 e o pedido válido segue para o provedor", async () => {
    await generateForField({ field: "buttonLabel", instruction: "mais curto" });
    const calls = generate.mock.calls as unknown as Array<[{ field: string; count: number; instruction: string }]>;
    expect(calls.at(-1)![0]).toEqual(expect.objectContaining({ field: "buttonLabel", count: 3, instruction: "mais curto" }));
  });
});
