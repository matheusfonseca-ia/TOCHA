import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";
import { parseSuggestions } from "@/lib/ai/parse";
import { buildFieldPrompt, type FieldPromptContext } from "@/lib/ai/prompt";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";

/**
 * Provedor do botão ✨. Fala com a OpenRouter (uma chave, qualquer modelo) ou
 * direto com a OpenAI, conforme a chave cadastrada (tela Contas) ou a da
 * instalação.
 *
 * Sem nenhuma chave a config é nula e o botão nem aparece na tela. O resto do
 * Falow segue funcionando igual.
 */

export interface AiConfig {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}

/** Modelo que a instalação escolheu para o provedor (OPENROUTER_MODEL / OPENAI_MODEL), se escolheu. */
export function envModelFor(
  provider: AiProviderId,
  env: Record<string, string | undefined> = process.env
): string | null {
  const raw = provider === "openrouter" ? env.OPENROUTER_MODEL : env.OPENAI_MODEL;
  return raw?.trim() || null;
}

/**
 * Chave padrão da instalação. Prioridade: OpenRouter, depois OpenAI. A chave
 * do usuário (tela Contas) vence as duas, em `resolveAiConfig`.
 */
export function aiConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): AiConfig | null {
  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      provider: "openrouter",
      apiKey: openRouterKey,
      model: envModelFor("openrouter", env) ?? AI_PROVIDERS.openrouter.defaultModel,
    };
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: envModelFor("openai", env) ?? AI_PROVIDERS.openai.defaultModel,
    };
  }

  return null;
}

/**
 * Corpo da chamada de chat completions. A OpenRouter aceita `temperature`; a
 * OpenAI não recebe: os modelos atuais dela são de raciocínio (gpt-5 em
 * diante, o1/o3/o4) e recusam qualquer valor diferente do padrão com 400.
 */
export function buildChatRequest(
  config: AiConfig,
  system: string,
  user: string
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const info = AI_PROVIDERS[config.provider];
  return {
    url: info.endpoint,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: {
      model: config.model,
      ...(config.provider === "openrouter" && { temperature: 0.9 }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
  };
}

/** Mensagem pro usuário por status HTTP: chave, modelo, pedido recusado ou provedor fora. */
function httpErrorMessage(status: number, config: AiConfig): string {
  const label = AI_PROVIDERS[config.provider].label;
  if (status === 429) return "A IA está ocupada agora. Tenta de novo em alguns segundos.";
  if (status === 401 || status === 403) {
    return `A ${label} não aceitou a chave. Confere sua chave da ${label} na tela Contas.`;
  }
  if (status === 404) {
    return `A ${label} não encontrou o modelo ${config.model}. Confere o modelo na tela Contas.`;
  }
  if (status === 400) {
    return `A ${label} recusou o pedido. Confere o modelo na tela Contas ou tenta de novo.`;
  }
  if (status >= 500) {
    return `A ${label} está fora do ar ou instável. Tenta de novo em instantes.`;
  }
  return `A IA respondeu ${status}. Tenta de novo em instantes.`;
}

export interface GenerateFieldInput {
  field: AiFieldKind;
  count: number;
  instruction?: string | null;
  context?: FieldPromptContext;
}

export type GenerateFieldResult =
  | { suggestions: string[] }
  | { error: string };

interface Deps {
  config: AiConfig;
  fetchImpl?: typeof fetch;
}

export async function generateFieldSuggestions(
  input: GenerateFieldInput,
  { config, fetchImpl = fetch }: Deps
): Promise<GenerateFieldResult> {
  const spec = aiFieldSpec(input.field);
  const { system, user } = buildFieldPrompt(input);

  const request = buildChatRequest(config, system, user);
  let res: Response;
  try {
    res = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { error: "Não consegui falar com a IA. Tenta de novo." };
  }

  if (!res.ok) {
    return { error: httpErrorMessage(res.status, config) };
  }

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;

  const content = json?.choices?.[0]?.message?.content ?? "";
  const suggestions = parseSuggestions(content, {
    maxChars: spec.maxChars,
    count: input.count,
  });

  if (!suggestions.length) {
    return { error: "A IA não devolveu nada aproveitável. Tenta de novo." };
  }

  return { suggestions };
}
