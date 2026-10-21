import { allVariants } from "@/lib/rules/variants";

import {
  FOLLOW_GATE_DEFAULTS,
  followGateCopy,
  type FollowGateCopy,
  type FollowGateRuleFields,
} from "./copy";

/**
 * Estado do campo "Seguir para liberar" nas telas de automação (DM e
 * comentário). Funções puras: estado inicial e o que vai para o save.
 */

export interface FollowGateForm {
  enabled: boolean;
  text: string;
  followLabel: string;
  confirmLabel: string;
  retryText: string;
  /** Variações extras (2ª em diante) da mensagem para quem não segue. */
  textVariants: string[];
  /** Variações extras (2ª em diante) da mensagem de "ainda não segue". */
  retryVariants: string[];
}

export interface FollowGateSaveFields {
  follow_gate_enabled: boolean;
  follow_gate_text: string;
  follow_gate_follow_label: string;
  follow_gate_confirm_label: string;
  follow_gate_retry_text: string;
  follow_gate_text_variants: string[];
  follow_gate_retry_variants: string[];
}

/** Coluna jsonb lida do banco: só aceita lista de textos, o resto vira vazio. */
function variantsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Automação nova ou sem textos próprios: os campos já vêm com a copy padrão. */
export function followGateFormFrom(rule?: FollowGateRuleFields | null): FollowGateForm {
  return {
    enabled: rule?.follow_gate_enabled === true,
    ...followGateCopy(rule ?? {}),
    textVariants: variantsFrom(rule?.follow_gate_text_variants),
    retryVariants: variantsFrom(rule?.follow_gate_retry_variants),
  };
}

/** Texto igual ao padrão grava vazio (nulo no banco): se o padrão mudar, a automação acompanha. */
function customOrEmpty(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed === fallback ? "" : trimmed;
}

/**
 * Principal + variações prontos para gravar: sem vazias nem repetidas, e se o
 * principal foi apagado a 1ª variação assume o lugar dele (senão o texto
 * padrão entraria no sorteio sem o usuário ter pedido).
 */
function splitVariants(primary: string, extras: string[]): { primary: string; extras: string[] } {
  const [first = "", ...rest] = allVariants(primary, extras);
  return { primary: first, extras: rest };
}

export function followGateFieldsForSave(form: FollowGateForm): FollowGateSaveFields {
  const text = splitVariants(form.text, form.textVariants);
  const retry = splitVariants(form.retryText, form.retryVariants);
  return {
    follow_gate_enabled: form.enabled,
    follow_gate_text: customOrEmpty(text.primary, FOLLOW_GATE_DEFAULTS.text),
    follow_gate_follow_label: customOrEmpty(form.followLabel, FOLLOW_GATE_DEFAULTS.followLabel),
    follow_gate_confirm_label: customOrEmpty(form.confirmLabel, FOLLOW_GATE_DEFAULTS.confirmLabel),
    follow_gate_retry_text: customOrEmpty(retry.primary, FOLLOW_GATE_DEFAULTS.retryText),
    follow_gate_text_variants: text.extras,
    follow_gate_retry_variants: retry.extras,
  };
}

/** O que a prévia do celular mostra: nulo com o portão desligado, campo vazio = padrão. */
export function followGatePreviewCopy(form: FollowGateForm): FollowGateCopy | null {
  return form.enabled ? followGateCopy(followGateFieldsForSave(form)) : null;
}
