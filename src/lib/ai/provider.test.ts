import { describe, expect, it } from "vitest";

import {
  aiConfigFromEnv,
  buildChatRequest,
  DEFAULT_MODEL,
  generateFieldSuggestions,
  type AiConfig,
} from "@/lib/ai/provider";
import { OPENAI_DEFAULT_MODEL } from "@/lib/ai/providers";

const config: AiConfig = { provider: "openrouter", apiKey: "chave-de-teste", model: "modelo/teste" };
const openAiConfig: AiConfig = { provider: "openai", apiKey: "sk-teste", model: "gpt-teste" };

/** fetch falso que guarda a chamada e devolve o texto que o modelo "respondeu". */
function fakeFetch(content: string, init?: { ok?: boolean; status?: number }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string | URL, requestInit?: RequestInit) => {
    calls.push({ url: String(url), init: requestInit ?? {} });
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as Response;
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("aiConfigFromEnv", () => {
  it("sem chave devolve nulo, e é assim que o botão some da tela", () => {
    expect(aiConfigFromEnv({})).toBeNull();
    expect(aiConfigFromEnv({ OPENROUTER_API_KEY: "  " })).toBeNull();
  });

  it("com chave devolve a config, com modelo padrão", () => {
    const result = aiConfigFromEnv({ OPENROUTER_API_KEY: "abc" });

    expect(result?.provider).toBe("openrouter");
    expect(result?.apiKey).toBe("abc");
    expect(result?.model).toBe(DEFAULT_MODEL);
  });

  it("só OPENAI_API_KEY: usa a OpenAI, com modelo padrão ou OPENAI_MODEL", () => {
    expect(aiConfigFromEnv({ OPENAI_API_KEY: "sk-1" })).toEqual({
      provider: "openai",
      apiKey: "sk-1",
      model: OPENAI_DEFAULT_MODEL,
    });
    expect(aiConfigFromEnv({ OPENAI_API_KEY: "sk-1", OPENAI_MODEL: "gpt-x" })?.model).toBe("gpt-x");
  });

  it("as duas chaves no ambiente: a OpenRouter tem prioridade", () => {
    const result = aiConfigFromEnv({
      OPENROUTER_API_KEY: "or",
      OPENAI_API_KEY: "sk-1",
      OPENAI_MODEL: "gpt-x",
    });
    expect(result?.provider).toBe("openrouter");
    expect(result?.model).toBe(DEFAULT_MODEL);
  });

  it("modelo pode ser trocado por variável de ambiente", () => {
    const result = aiConfigFromEnv({
      OPENROUTER_API_KEY: "abc",
      OPENROUTER_MODEL: "outro/modelo",
    });

    expect(result?.model).toBe("outro/modelo");
  });
});

describe("buildChatRequest (formato por provedor)", () => {
  it("OpenRouter: endpoint da OpenRouter e temperature 0.9", () => {
    const request = buildChatRequest(config, "sys", "usr");

    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer chave-de-teste");
    expect(request.body.temperature).toBe(0.9);
    expect(request.body.model).toBe("modelo/teste");
  });

  it("OpenAI: endpoint da OpenAI e nenhum temperature (modelos de raciocínio recusam)", () => {
    const request = buildChatRequest(openAiConfig, "sys", "usr");

    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-teste");
    expect("temperature" in request.body).toBe(false);
    expect(request.body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it.each(["gpt-5", "gpt-5-mini", "o3", "o4-mini", OPENAI_DEFAULT_MODEL])(
    "OpenAI com %s: sem temperature",
    (model) => {
      expect("temperature" in buildChatRequest({ ...openAiConfig, model }, "s", "u").body).toBe(false);
    }
  );
});

describe("generateFieldSuggestions", () => {
  it("chama o endpoint do provedor da config", async () => {
    const { calls, fetchImpl } = fakeFetch('["Oi"]');

    await generateFieldSuggestions({ field: "publicReply", count: 3 }, { config: openAiConfig, fetchImpl });

    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect("temperature" in JSON.parse(String(calls[0].init.body))).toBe(false);
  });

  it("erro HTTP cita o provedor certo na mensagem", async () => {
    const openAi = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config: openAiConfig, fetchImpl: fakeFetch("", { ok: false, status: 401 }).fetchImpl }
    );
    const openRouter = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl: fakeFetch("", { ok: false, status: 401 }).fetchImpl }
    );

    expect(openAi).toEqual({ error: expect.stringContaining("chave da OpenAI na tela Contas") });
    expect(openRouter).toEqual({ error: expect.stringContaining("chave da OpenRouter na tela Contas") });
  });

  it("devolve as sugestões lidas da resposta do modelo", async () => {
    const { fetchImpl } = fakeFetch('["Te chamei no direct!", "Já está na DM!"]');

    const result = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl }
    );

    expect(result).toEqual({
      suggestions: ["Te chamei no direct!", "Já está na DM!"],
    });
  });

  it("manda a chave no header e o modelo no corpo", async () => {
    const { calls, fetchImpl } = fakeFetch('["Oi"]');

    await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl }
    );

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer chave-de-teste");
    expect(JSON.parse(String(calls[0].init.body)).model).toBe("modelo/teste");
  });

  it("aplica o limite do campo: rótulo de botão corta o que passa de 20", async () => {
    const { fetchImpl } = fakeFetch(
      JSON.stringify(["Baixar agora", "Toca aqui pra receber o material completo"])
    );

    const result = await generateFieldSuggestions(
      { field: "buttonLabel", count: 3 },
      { config, fetchImpl }
    );

    expect(result).toEqual({ suggestions: ["Baixar agora"] });
  });

  it("erro HTTP do provedor vira mensagem pro usuário, não exceção", async () => {
    const { fetchImpl } = fakeFetch("", { ok: false, status: 429 });

    const result = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl }
    );

    expect(result).toHaveProperty("error");
  });

  it("modelo que não devolveu nada aproveitável vira erro, não lista vazia", async () => {
    const { fetchImpl } = fakeFetch("   ");

    const result = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl }
    );

    expect(result).toHaveProperty("error");
  });

  it("fetch que explode (rede, timeout) vira mensagem pro usuário", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await generateFieldSuggestions(
      { field: "publicReply", count: 3 },
      { config, fetchImpl }
    );

    expect(result).toHaveProperty("error");
  });
});
