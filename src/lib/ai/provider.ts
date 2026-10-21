import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";
import { parseSuggestions } from "@/lib/ai/parse";
import { buildFieldPrompt, type FieldPromptContext } from "@/lib/ai/prompt";
import {
  AI_PROVIDERS,
  OPENROUTER_DEFAULT_MODEL,
  type AiProviderId,
} from "@/lib/ai/providers";

/**
 * Provedor do botão ✨. Fala com a OpenRouter (uma chave, qualquer modelo) ou
 * direto com a OpenAI, conforme a chave cadastrada (tela Contas) ou a da
 * instalação.
 *
 * Sem nenhuma chave a config é nula e o botão nem aparece na tela. O resto do
 * Falow segue funcionando igual.
 */

/** Modelo padrão da OpenRouter (mantido com este nome por compatibilidade). */
export const DEFAULT_MODEL = OPENROUTER_DEFAULT_MODEL;

export interface AiConfig {
  provider: AiProviderId;
  apiKey: string;
  model: string;
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
      model: env.OPENROUTER_MODEL?.trim() || AI_PROVIDERS.openrouter.defaultModel,
    };
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: env.OPENAI_MODEL?.trim() || AI_PROVIDERS.openai.defaultModel,
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
    return {
      error:
        res.status === 429
          ? "A IA está ocupada agora. Tenta de novo em alguns segundos."
          : `A IA respondeu ${res.status}. Confere sua chave da ${AI_PROVIDERS[config.provider].label} na tela Contas.`,
    };
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
