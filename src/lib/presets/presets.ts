import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";

/**
 * Textos salvos ("mensagens padrão"): o que você escreve uma vez e reusa em
 * qualquer campo. Preset é CÓPIA — inseriu, o texto é da automação; editar o
 * preset depois não mexe em nada que já foi criado.
 *
 * O escopo diz em que tipo de campo o texto nasceu. Ele não esconde o preset
 * dos outros campos (um bom texto de boas-vindas serve de mensagem do
 * workflow), só faz os do mesmo tipo aparecerem primeiro.
 */

export const PRESET_LABEL_MAX = 40;
/** Maior campo do app (mensagem entregue / workflow). */
export const PRESET_TEXT_MAX = 1000;

export interface MessagePreset {
  id: string;
  account_id: string;
  scope: AiFieldKind;
  label: string;
  text: string;
  created_at: string;
}

export interface PresetInput {
  scope: AiFieldKind;
  text: string;
  label?: string | null;
}

export type NormalizedPreset =
  | { preset: { scope: AiFieldKind; label: string; text: string } }
  | { error: string };

export function normalizePreset(input: PresetInput): NormalizedPreset {
  const text = input.text.trim();
  if (!text) return { error: "Escreva o texto antes de salvar." };
  if (text.length > PRESET_TEXT_MAX) {
    return { error: `Texto muito longo: máximo de ${PRESET_TEXT_MAX} caracteres.` };
  }

  const typed = input.label?.trim();
  const label = (typed || text).slice(0, PRESET_LABEL_MAX);

  return { preset: { scope: input.scope, label, text } };
}

/**
 * Presets que servem para um campo: só os que cabem no limite dele, com os do
 * mesmo escopo na frente. Ordem de entrada preservada dentro de cada grupo.
 */
export function presetsForField(
  presets: MessagePreset[],
  field: AiFieldKind
): MessagePreset[] {
  const { maxChars } = aiFieldSpec(field);
  const fits = presets.filter((preset) => preset.text.length <= maxChars);

  return [
    ...fits.filter((preset) => preset.scope === field),
    ...fits.filter((preset) => preset.scope !== field),
  ];
}
