import type { CollectInputType } from "@/types/sequence";

/**
 * Validação das respostas do nó "Coletar dado". Funções puras: recebem o
 * texto cru da DM e devolvem o valor normalizado que vai para
 * `contacts.fields` (ou `ok: false`). Toleram o jeito como as pessoas
 * escrevem de verdade ("meu email é Fulano@Gmail.com", "(11) 98765-4321",
 * "R$ 1.500,00", "5/3/90").
 */

export const COLLECT_MIN_ATTEMPTS = 1;
export const COLLECT_MAX_ATTEMPTS = 5;
/** Teto do valor gravado: resposta de texto livre não vira um documento. */
export const COLLECT_VALUE_MAX = 500;

export type CollectResult = { ok: true; value: string } | { ok: false };

const INVALID: CollectResult = { ok: false };

export function validateText(raw: string): CollectResult {
  const value = raw.trim().replace(/\s+/g, " ");
  return value ? { ok: true, value: value.slice(0, COLLECT_VALUE_MAX) } : INVALID;
}

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

export function validateEmail(raw: string): CollectResult {
  const match = raw.match(EMAIL_IN_TEXT);
  if (!match) return INVALID;
  const value = match[0].toLowerCase();
  if (value.includes("..") || value.startsWith(".") || value.includes(".@")) {
    return INVALID;
  }
  return { ok: true, value };
}

/**
 * Telefone em formato E.164 ("+5511987654321"). Sem "+", 10 ou 11 dígitos
 * são tratados como número brasileiro (DDD + número) e ganham o +55; com
 * "+" (ou 12 a 15 dígitos), vale como internacional.
 */
export function validatePhone(raw: string): CollectResult {
  // Texto em volta ("meu whats é ...") é ignorado: só a contagem de dígitos
  // decide, e frase com número solto ("tenho 2 filhos") não chega a 10.
  const hasPlus = /\+\s*\d/.test(raw);
  let digits = raw.replace(/\D/g, "");
  // "0" de discagem nacional antes do DDD (011 98765-4321).
  if (!hasPlus && digits.length === 12 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!hasPlus && (digits.length === 10 || digits.length === 11)) {
    return { ok: true, value: `+55${digits}` };
  }
  if (digits.length >= 12 && digits.length <= 15) {
    return { ok: true, value: `+${digits}` };
  }
  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { ok: true, value: `+${digits}` };
  }
  return INVALID;
}

/**
 * Converte "1.234,56", "1234.56", "1,5", "R$ 1.500", "-3" em número. Com
 * ponto e vírgula, o último separador é o decimal; só vírgula é decimal
 * (padrão pt-BR); só ponto em grupos de 3 ("1.500") é milhar.
 */
export function parseLooseNumber(raw: string): number | null {
  const match = raw.replace(/\s/g, "").match(/-?\d[\d.,]*/);
  if (!match) return null;
  let token = match[0].replace(/[.,]$/, "");

  const lastDot = token.lastIndexOf(".");
  const lastComma = token.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    token = token.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    token = /^-?\d{1,3}(,\d{3}){2,}$/.test(token)
      ? token.split(",").join("")
      : token.replace(",", ".");
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(token)) {
    token = token.split(".").join("");
  }

  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function validateNumber(raw: string): CollectResult {
  // Frase com número solto no meio ("tenho 2 filhos") não conta: só aceita
  // o número com, no máximo, símbolos de moeda/unidade em volta.
  const residue = raw
    .replace(/-?\d[\d.,]*/, "")
    .replace(/r\$|us\$|\$|€|%|reais|real|anos?|kg/gi, "")
    .trim();
  if (residue) return INVALID;
  const value = parseLooseNumber(raw);
  return value === null ? INVALID : { ok: true, value: String(value) };
}

/** Data de calendário válida em [ano, mês (1-12), dia]; null se não existe. */
function realDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/** "dd/mm/aaaa", "d/m/aa", "dd-mm-aaaa", "dd.mm.aaaa" ou ISO "aaaa-mm-dd". */
export function parsePtBrDate(raw: string): Date | null {
  const text = raw.trim();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!br) return null;
  let year = Number(br[3]);
  // Ano com 2 dígitos: "90" = 1990, "05" = 2005.
  if (br[3].length === 2) year += year < 50 ? 2000 : 1900;
  return realDate(year, Number(br[2]), Number(br[1]));
}

export function formatPtBrDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

export function validateDate(raw: string): CollectResult {
  const date = parsePtBrDate(raw);
  return date ? { ok: true, value: formatPtBrDate(date) } : INVALID;
}

export function validateInput(type: CollectInputType, raw: string): CollectResult {
  switch (type) {
    case "email":
      return validateEmail(raw);
    case "phone":
      return validatePhone(raw);
    case "number":
      return validateNumber(raw);
    case "date":
      return validateDate(raw);
    default:
      return validateText(raw);
  }
}
