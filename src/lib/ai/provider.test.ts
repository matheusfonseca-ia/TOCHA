import { describe, expect, it } from "vitest";

import { aiConfigFromEnv, generateFieldSuggestions } from "@/lib/ai/provider";

const config = { apiKey: "chave-de-teste", model: "modelo/teste" };

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

    expect(result?.apiKey).toBe("abc");
    expect(result?.model).toBeTruthy();
  });

  it("modelo pode ser trocado por variável de ambiente", () => {
    const result = aiConfigFromEnv({
      OPENROUTER_API_KEY: "abc",
      OPENROUTER_MODEL: "outro/modelo",
    });

    expect(result?.model).toBe("outro/modelo");
  });
});

describe("generateFieldSuggestions", () => {
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
