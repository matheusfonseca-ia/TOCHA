import { describe, expect, it } from "vitest";

import { aiConfigFromEnv } from "@/lib/ai/provider";
import { DEFAULT_MODEL } from "@/lib/ai/provider";
import { OPENAI_DEFAULT_MODEL } from "@/lib/ai/providers";

import { resolveAiConfig } from "./resolve-config";

const env = { provider: "openrouter" as const, apiKey: "chave-da-instalacao", model: "env/modelo" };
const user = (over: Partial<{ apiKey: string; model: string | null; provider: "openrouter" | "openai" }> = {}) => ({
  apiKey: "k",
  model: null,
  provider: "openrouter" as const,
  ...over,
});

describe("resolveAiConfig", () => {
  it("a chave do usuário vence a da instalação, com o provedor dela", () => {
    const result = resolveAiConfig(
      { apiKey: " chave-do-usuario ", model: "meu/modelo", provider: "openrouter" },
      env
    );

    expect(result).toEqual({ provider: "openrouter", apiKey: "chave-do-usuario", model: "meu/modelo" });
  });

  it("chave da OpenAI do usuário vence a OpenRouter da instalação", () => {
    const result = resolveAiConfig(user({ apiKey: "sk-proj-1", provider: "openai", model: "gpt-x" }), env);

    expect(result).toEqual({ provider: "openai", apiKey: "sk-proj-1", model: "gpt-x" });
  });

  it("usuário sem modelo próprio herda o modelo da instalação do mesmo provedor", () => {
    expect(resolveAiConfig(user(), env)?.model).toBe("env/modelo");
  });

  it("não herda modelo de outro provedor: cai no padrão do provedor do usuário", () => {
    expect(resolveAiConfig(user({ provider: "openai" }), env)?.model).toBe(OPENAI_DEFAULT_MODEL);
    const openAiEnv = { provider: "openai" as const, apiKey: "e", model: "gpt-env" };
    expect(resolveAiConfig(user({ provider: "openrouter" }), openAiEnv)?.model).toBe(DEFAULT_MODEL);
  });

  it("usuário sem modelo e sem instalação cai no modelo padrão do provedor", () => {
    expect(resolveAiConfig(user(), null)?.model).toBe(DEFAULT_MODEL);
    expect(resolveAiConfig(user({ provider: "openai" }), null)?.model).toBe(OPENAI_DEFAULT_MODEL);
  });

  it("sem chave do usuário usa a da instalação", () => {
    expect(resolveAiConfig(null, env)).toBe(env);
  });

  it("sem nenhuma das duas, nulo (o botão some)", () => {
    expect(resolveAiConfig(null, null)).toBeNull();
    expect(resolveAiConfig(user({ apiKey: "  " }), null)).toBeNull();
  });
});

describe("prioridade completa: usuário, OpenRouter do ambiente, OpenAI do ambiente", () => {
  const both = { OPENROUTER_API_KEY: "or", OPENAI_API_KEY: "oa" };

  it("ambiente com as duas chaves usa a OpenRouter", () => {
    expect(resolveAiConfig(null, aiConfigFromEnv(both))?.provider).toBe("openrouter");
  });

  it("ambiente só com a OpenAI usa a OpenAI", () => {
    expect(resolveAiConfig(null, aiConfigFromEnv({ OPENAI_API_KEY: "oa" }))?.provider).toBe("openai");
  });

  it("chave do usuário vence as duas do ambiente", () => {
    const result = resolveAiConfig(user({ apiKey: "mine", provider: "openai" }), aiConfigFromEnv(both));
    expect(result).toMatchObject({ provider: "openai", apiKey: "mine" });
  });
});
