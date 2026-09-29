import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";
import { parseSuggestions } from "@/lib/ai/parse";
import { buildFieldPrompt, type FieldPromptContext } from "@/lib/ai/prompt";

/**
 * Provedor do botão ✨. Fala com a OpenRouter (uma chave, qualquer modelo),
 * que é o que combina com um produto que cada um hospeda do próprio jeito.
 *
 * Sem `OPENROUTER_API_KEY` a config é nula e o botão nem aparece na tela —
 * o resto do Falow segue funcionando igual.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export interface AiConfig {
  apiKey: string;
  model: string;
}

export function aiConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): AiConfig | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  return { apiKey, model: env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL };
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

  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
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
          : `A IA respondeu ${res.status}. Confere a chave em OPENROUTER_API_KEY.`,
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
