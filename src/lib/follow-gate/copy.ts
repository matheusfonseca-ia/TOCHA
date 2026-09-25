import type { Rule } from "@/types/database";

/**
 * Textos do portão "Seguir para liberar". Cada automação pode trocar qualquer
 * um; coluna vazia usa o padrão. Módulo puro: o builder (cliente) também usa.
 */

export const FOLLOW_GATE_DEFAULTS = {
  text: "Pra liberar, é só me seguir aqui embaixo. Depois toca em Já segui 👇",
  followLabel: "Seguir perfil",
  confirmLabel: "Já segui",
  retryText:
    "Ainda não apareceu que você me segue. Segue o perfil e toca em Já segui de novo.",
} as const;

/** Limites da Meta: texto do button template e título de botão. */
export const FOLLOW_GATE_LIMITS = { text: 640, label: 20 } as const;

export type FollowGateRuleFields = Pick<
  Rule,
  | "follow_gate_enabled"
  | "follow_gate_text"
  | "follow_gate_follow_label"
  | "follow_gate_confirm_label"
  | "follow_gate_retry_text"
>;

export interface FollowGateCopy {
  text: string;
  followLabel: string;
  confirmLabel: string;
  retryText: string;
}

function orDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function followGateCopy(rule: FollowGateRuleFields): FollowGateCopy {
  return {
    text: orDefault(rule.follow_gate_text, FOLLOW_GATE_DEFAULTS.text),
    followLabel: orDefault(rule.follow_gate_follow_label, FOLLOW_GATE_DEFAULTS.followLabel),
    confirmLabel: orDefault(rule.follow_gate_confirm_label, FOLLOW_GATE_DEFAULTS.confirmLabel),
    retryText: orDefault(rule.follow_gate_retry_text, FOLLOW_GATE_DEFAULTS.retryText),
  };
}

/** Ausente (antes da migration 0007) conta como desligado. */
export function isFollowGateOn(rule: FollowGateRuleFields): boolean {
  return rule.follow_gate_enabled === true;
}
