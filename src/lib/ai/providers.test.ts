import { describe, expect, it } from "vitest";

import {
  AI_PROVIDERS,
  inferProviderFromKey,
  isAiProviderId,
  isValidModelId,
} from "@/lib/ai/providers";

describe("catálogo de provedores", () => {
  it("endpoints oficiais e nada de travessão nos textos", () => {
    expect(AI_PROVIDERS.openrouter.endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(AI_PROVIDERS.openai.endpoint).toBe("https://api.openai.com/v1/chat/completions");
    expect(AI_PROVIDERS.openrouter.keysUrl).toBe("https://openrouter.ai/keys");
    expect(AI_PROVIDERS.openai.keysUrl).toBe("https://platform.openai.com/api-keys");
    for (const info of Object.values(AI_PROVIDERS)) {
      expect(JSON.stringify(info)).not.toMatch(/[—–]/);
    }
  });

  it("reconhece só os dois ids", () => {
    expect(isAiProviderId("openai")).toBe(true);
    expect(isAiProviderId("openrouter")).toBe(true);
    expect(isAiProviderId("anthropic")).toBe(false);
    expect(isAiProviderId(null)).toBe(false);
  });
});

describe("inferProviderFromKey (banco sem a migration 0018)", () => {
  it("sk-or- é OpenRouter, outras sk- são OpenAI, o resto cai na OpenRouter", () => {
    expect(inferProviderFromKey("sk-or-v1-abc")).toBe("openrouter");
    expect(inferProviderFromKey(" sk-proj-abc ")).toBe("openai");
    expect(inferProviderFromKey("sk-abc")).toBe("openai");
    expect(inferProviderFromKey("qualquer")).toBe("openrouter");
  });
});

describe("isValidModelId por provedor", () => {
  it("OpenRouter exige provedor/nome", () => {
    expect(isValidModelId("anthropic/claude-sonnet-4.5", "openrouter")).toBe(true);
    expect(isValidModelId("gpt-6-luna", "openrouter")).toBe(false);
  });

  it("OpenAI aceita o nome simples e recusa espaço ou barra", () => {
    expect(isValidModelId("gpt-6-luna", "openai")).toBe(true);
    expect(isValidModelId("gpt-5-mini", "openai")).toBe(true);
    expect(isValidModelId("openai/gpt-5", "openai")).toBe(false);
    expect(isValidModelId("gpt 5", "openai")).toBe(false);
  });
});
