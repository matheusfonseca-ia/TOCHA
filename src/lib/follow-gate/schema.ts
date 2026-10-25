import { z } from "zod";

import { isMissingColumn, type PostgrestLikeError } from "@/lib/db/missing";
import { cleanVariantList, MAX_VARIANTS } from "@/lib/rules/variants";
import type { Rule } from "@/types/database";

import { FOLLOW_GATE_LIMITS } from "./copy";

const label = (what: string) =>
  z
    .string()
    .trim()
    .max(FOLLOW_GATE_LIMITS.label, `${what}: máximo de ${FOLLOW_GATE_LIMITS.label} caracteres (limite da Meta).`)
    .optional();

/**
 * Lista de variações extras de uma das mensagens do portão. O limite de
 * textos conta o principal, então as extras passam de `MAX_VARIANTS - 1`.
 */
const variantList = (what: string) =>
  z
    .array(
      z
        .string()
        .trim()
        .max(FOLLOW_GATE_LIMITS.text, `${what}: máximo de ${FOLLOW_GATE_LIMITS.text} caracteres.`)
    )
    .max(MAX_VARIANTS - 1, `${what}: no máximo ${MAX_VARIANTS - 1} variações extras.`)
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
  // Variações extras (2ª em diante) de cada mensagem. Ausente = não mexe nas
  // salvas (o diálogo de edição rápida da lista não conhece as variações).
  follow_gate_text_variants: variantList("Variações da mensagem do portão"),
  follow_gate_retry_variants: variantList("Variações da mensagem de ainda não segue"),
};

type FollowGateInput = {
  follow_gate_enabled?: boolean;
  follow_gate_text?: string;
  follow_gate_follow_label?: string;
  follow_gate_confirm_label?: string;
  follow_gate_retry_text?: string;
  follow_gate_text_variants?: string[];
  follow_gate_retry_variants?: string[];
};

type FollowGateColumns = Pick<
  Rule,
  | "follow_gate_enabled"
  | "follow_gate_text"
  | "follow_gate_follow_label"
  | "follow_gate_confirm_label"
  | "follow_gate_retry_text"
  | "follow_gate_text_variants"
  | "follow_gate_retry_variants"
>;

/**
 * Colunas a gravar; texto vazio grava nulo (= texto padrão no envio). As
 * variações só entram quando vieram no input (lista vazia grava nulo): quem
 * regrava a linha sem conhecê-las não apaga as salvas.
 */
export function followGateColumns(input: FollowGateInput): FollowGateColumns {
  if (input.follow_gate_enabled === undefined) return {};
  return {
    follow_gate_enabled: input.follow_gate_enabled,
    follow_gate_text: input.follow_gate_text?.trim() || null,
    follow_gate_follow_label: input.follow_gate_follow_label?.trim() || null,
    follow_gate_confirm_label: input.follow_gate_confirm_label?.trim() || null,
    follow_gate_retry_text: input.follow_gate_retry_text?.trim() || null,
    ...(input.follow_gate_text_variants !== undefined && {
      follow_gate_text_variants: cleanVariantList(input.follow_gate_text_variants),
    }),
    ...(input.follow_gate_retry_variants !== undefined && {
      follow_gate_retry_variants: cleanVariantList(input.follow_gate_retry_variants),
    }),
  };
}

export const FOLLOW_GATE_VARIANTS_MIGRATION_WARNING =
  "As variações do portão não foram salvas. Aplique a migration 0017_follow_gate_variants.sql no Supabase para usá-las.";

const VARIANT_COLUMNS = ["follow_gate_text_variants", "follow_gate_retry_variants"] as const;

/** Banco sem a migration 0017: o PostgREST recusa só as colunas de variações. */
export function isMissingFollowGateVariantsColumn(
  error: PostgrestLikeError | null | undefined
): boolean {
  return VARIANT_COLUMNS.some((column) => isMissingColumn(error, column));
}

/** Mesma linha sem as colunas de variações, para salvar num banco sem a migration 0017. */
export function withoutFollowGateVariantColumns<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !(VARIANT_COLUMNS as readonly string[]).includes(key))
  ) as T;
}

/** A linha traz variações de verdade para gravar (vale avisar se o banco não tem a coluna). */
export function hasFollowGateVariants(row: FollowGateColumns): boolean {
  return Boolean(row.follow_gate_text_variants?.length || row.follow_gate_retry_variants?.length);
}

export const FOLLOW_GATE_MIGRATION_ERROR =
  "Para usar o Seguir para liberar, aplique a migration 0007_follow_gate.sql no Supabase.";

/** Colunas criadas pela migration 0007 (as de variações vêm da 0017, ficam de fora). */
const GATE_COLUMNS = [
  "follow_gate_enabled",
  "follow_gate_text",
  "follow_gate_follow_label",
  "follow_gate_confirm_label",
  "follow_gate_retry_text",
] as const;

/**
 * Banco sem a migration 0007: o PostgREST recusa a coluna desconhecida. Casa a
 * lista explícita (e não o prefixo `follow_gate_`), então o resultado não
 * depende de checar a 0017 antes.
 */
export function isMissingFollowGateColumn(
  error: PostgrestLikeError | null | undefined
): boolean {
  return GATE_COLUMNS.some((column) => isMissingColumn(error, column));
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
    // Regra lida antes da migration 0017 não tem as colunas: não inventa.
    ...(original.follow_gate_text_variants !== undefined && {
      follow_gate_text_variants: original.follow_gate_text_variants,
    }),
    ...(original.follow_gate_retry_variants !== undefined && {
      follow_gate_retry_variants: original.follow_gate_retry_variants,
    }),
  };
}
