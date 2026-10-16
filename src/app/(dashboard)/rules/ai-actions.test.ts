import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { userId: "user-1" as string | null } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
  }),
}));
vi.mock("@/lib/ai/provider", () => ({
  aiConfigFromEnv: () => ({ apiKey: "k", model: "m" }),
  generateFieldSuggestions: vi.fn(async () => ({ suggestions: ["ok"] })),
}));

import { generateForField, isAiEnabled } from "@/app/(dashboard)/rules/ai-actions";

describe("IA nos campos", () => {
  beforeEach(() => {
    state.userId = "user-1";
  });

  it("liberada para o dono", async () => {
    expect(await isAiEnabled()).toBe(true);
    expect(await generateForField({ field: "publicReply" })).toEqual({ suggestions: ["ok"] });
  });

  it("bloqueada para cliente, inclusive chamando a action direto", async () => {
    state.userId = "cliente-1";
    expect(await isAiEnabled()).toBe(false);
    expect(await generateForField({ field: "publicReply" })).toHaveProperty("error");
  });

  it("bloqueada sem sessao", async () => {
    state.userId = null;
    expect(await isAiEnabled()).toBe(false);
    expect(await generateForField({ field: "publicReply" })).toHaveProperty("error");
  });
});
