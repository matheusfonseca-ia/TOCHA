import { z } from "zod";

import type { Rule } from "@/types/database";

import { FOLLOW_GATE_LIMITS } from "./copy";

const label = (what: string) =>
  z
    .string()
    .trim()
    .max(FOLLOW_GATE_LIMITS.label, `${what}: máximo de ${FOLLOW_GATE_LIMITS.label} caracteres (limite da Meta).`)
    .optional();

/**
 * Campos do portão aceitos por saveRule. `follow_gate_enabled` ausente = não
 * mexe no que está salvo (quem chama sem conhecer a feature não desliga o
 * portão nem apaga os textos).
 */
export const followGateFields = {
  follow_gate_enabled: z.boolean().optional(),
  follow_gate_text: z
    .string()
    .trim()
    .max(FOLLOW_GATE_LIMITS.text, `Mensagem do portão: máximo de ${FOLLOW_GATE_LIMITS.text} caracteres.`)
    .optional(),
  follow_gate_follow_label: label("Botão de seguir"),
  follow_gate_confirm_label: label("Botão Já segui"),
  follow_gate_retry_text: z
    .string()
    .trim()
    .max(FOLLOW_GATE_LIMITS.text, `Mensagem de ainda não segue: máximo de ${FOLLOW_GATE_LIMITS.text} caracteres.`)
    .optional(),
};

type FollowGateInput = {
  follow_gate_enabled?: boolean;
  follow_gate_text?: string;
  follow_gate_follow_label?: string;
  follow_gate_confirm_label?: string;
  follow_gate_retry_text?: string;
};

type FollowGateColumns = Pick<
  Rule,
  | "follow_gate_enabled"
  | "follow_gate_text"
  | "follow_gate_follow_label"
  | "follow_gate_confirm_label"
  | "follow_gate_retry_text"
>;

/** Colunas a gravar; texto vazio grava nulo (= texto padrão no envio). */
export function followGateColumns(input: FollowGateInput): FollowGateColumns {
  if (input.follow_gate_enabled === undefined) return {};
  return {
    follow_gate_enabled: input.follow_gate_enabled,
    follow_gate_text: input.follow_gate_text?.trim() || null,
    follow_gate_follow_label: input.follow_gate_follow_label?.trim() || null,
    follow_gate_confirm_label: input.follow_gate_confirm_label?.trim() || null,
    follow_gate_retry_text: input.follow_gate_retry_text?.trim() || null,
  };
}

export const FOLLOW_GATE_MIGRATION_ERROR =
  "Para usar o Seguir para liberar, aplique a migration 0007_follow_gate.sql no Supabase.";

/** Banco sem a migration 0007: o PostgREST recusa a coluna desconhecida. */
export function isMissingFollowGateColumn(
  error: { message?: string } | null | undefined
): boolean {
  const message = error?.message ?? "";
  return /follow_gate_/.test(message) && /does not exist|schema cache|column/i.test(message);
}

/** Mesma linha sem as colunas do portão, para salvar num banco sem a migration 0007. */
export function withoutFollowGateColumns<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("follow_gate_"))
  ) as T;
}

/** Cópia do portão ao duplicar; regra lida antes da migration 0007 não tem as colunas. */
export function copyFollowGateColumns(original: FollowGateColumns): FollowGateColumns {
  if (original.follow_gate_enabled === undefined) return {};
  return {
    follow_gate_enabled: original.follow_gate_enabled,
    follow_gate_text: original.follow_gate_text ?? null,
    follow_gate_follow_label: original.follow_gate_follow_label ?? null,
    follow_gate_confirm_label: original.follow_gate_confirm_label ?? null,
    follow_gate_retry_text: original.follow_gate_retry_text ?? null,
  };
}
