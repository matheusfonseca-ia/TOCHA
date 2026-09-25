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
}

export interface FollowGateSaveFields {
  follow_gate_enabled: boolean;
  follow_gate_text: string;
  follow_gate_follow_label: string;
  follow_gate_confirm_label: string;
  follow_gate_retry_text: string;
}

/** Automação nova ou sem textos próprios: os campos já vêm com a copy padrão. */
export function followGateFormFrom(rule?: FollowGateRuleFields | null): FollowGateForm {
  return { enabled: rule?.follow_gate_enabled === true, ...followGateCopy(rule ?? {}) };
}

/** Texto igual ao padrão grava vazio (nulo no banco): se o padrão mudar, a automação acompanha. */
function customOrEmpty(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed === fallback ? "" : trimmed;
}

export function followGateFieldsForSave(form: FollowGateForm): FollowGateSaveFields {
  return {
    follow_gate_enabled: form.enabled,
    follow_gate_text: customOrEmpty(form.text, FOLLOW_GATE_DEFAULTS.text),
    follow_gate_follow_label: customOrEmpty(form.followLabel, FOLLOW_GATE_DEFAULTS.followLabel),
    follow_gate_confirm_label: customOrEmpty(form.confirmLabel, FOLLOW_GATE_DEFAULTS.confirmLabel),
    follow_gate_retry_text: customOrEmpty(form.retryText, FOLLOW_GATE_DEFAULTS.retryText),
  };
}

/** O que a prévia do celular mostra: nulo com o portão desligado, campo vazio = padrão. */
export function followGatePreviewCopy(form: FollowGateForm): FollowGateCopy | null {
  return form.enabled ? followGateCopy(followGateFieldsForSave(form)) : null;
}
