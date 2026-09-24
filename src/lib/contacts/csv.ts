import type { Contact } from "@/types/database";

/**
 * Export CSV da página Contatos. Separador ";" e BOM UTF-8: é o que o Excel
 * em pt-BR abre direto, com acentos certos e uma coluna por campo.
 */

export const CSV_SEPARATOR = ";";
const BOM = "﻿";

// Valores vêm de DMs de qualquer pessoa: célula começando com = + - @ vira
// fórmula no Excel/Sheets (CSV injection). Número puro (telefone, valor) é
// seguro e fica como está.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d[\d\s().,-]*$/;

export function csvCell(value: string): string {
  let text = value;
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) || text !== text.trim()
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(CSV_SEPARATOR)).join("\r\n");
}

/** Chaves de campo presentes em qualquer contato, em ordem alfabética. */
export function contactFieldKeys(contacts: Pick<Contact, "fields">[]): string[] {
  const keys = new Set<string>();
  for (const c of contacts) for (const k of Object.keys(c.fields ?? {})) keys.add(k);
  return Array.from(keys).sort();
}

export type ContactCsvRow = Pick<
  Contact,
  "ig_sender_id" | "ig_username" | "fields" | "tags" | "created_at" | "updated_at"
> & { account_username?: string | null };

export function contactsToCsv(contacts: ContactCsvRow[]): string {
  const fieldKeys = contactFieldKeys(contacts);
  const header = [
    "username",
    "ig_sender_id",
    "conta",
    ...fieldKeys,
    "tags",
    "criado_em",
    "atualizado_em",
  ];
  const rows = contacts.map((c) => [
    c.ig_username ?? "",
    c.ig_sender_id,
    c.account_username ?? "",
    ...fieldKeys.map((k) => String(c.fields?.[k] ?? "")),
    (c.tags ?? []).join(", "),
    c.created_at,
    c.updated_at,
  ]);
  return toCsv([header, ...rows]);
}
