import { describe, expect, it } from "vitest";

import { aiConfigFromEnv } from "@/lib/ai/provider";
import { OPENAI_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL } from "@/lib/ai/providers";

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
    expect(resolveAiConfig(user(), env, { OPENROUTER_MODEL: "env/modelo" })?.model).toBe("env/modelo");
    expect(resolveAiConfig(user({ provider: "openai" }), env, { OPENAI_MODEL: "gpt-env" })?.model).toBe("gpt-env");
  });

  it("herda o modelo do provedor da chave mesmo com a chave padrão da instalação em outro provedor", () => {
    const envKeys = { OPENROUTER_API_KEY: "or", OPENAI_MODEL: "gpt-x" };
    expect(resolveAiConfig(user({ provider: "openai" }), aiConfigFromEnv(envKeys), envKeys)?.model).toBe("gpt-x");
    // OPENAI_MODEL sem OPENAI_API_KEY e sem nenhuma chave de ambiente também vale.
    expect(resolveAiConfig(user({ provider: "openai" }), null, { OPENAI_MODEL: "gpt-x" })?.model).toBe("gpt-x");
  });

  it("não herda modelo de outro provedor: cai no padrão do provedor do usuário", () => {
    expect(resolveAiConfig(user({ provider: "openai" }), env, { OPENROUTER_MODEL: "env/modelo" })?.model).toBe(
      OPENAI_DEFAULT_MODEL
    );
    expect(resolveAiConfig(user({ provider: "openrouter" }), null, { OPENAI_MODEL: "gpt-env" })?.model).toBe(
      OPENROUTER_DEFAULT_MODEL
    );
  });

  it("usuário sem modelo e sem instalação cai no modelo padrão do provedor", () => {
    expect(resolveAiConfig(user(), null, {})?.model).toBe(OPENROUTER_DEFAULT_MODEL);
    expect(resolveAiConfig(user({ provider: "openai" }), null, {})?.model).toBe(OPENAI_DEFAULT_MODEL);
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
