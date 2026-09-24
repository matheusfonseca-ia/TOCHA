/**
 * Variáveis nos textos enviados pelo workflow: `{{campo}}` vira o valor
 * coletado e `{{username}}` o @ da pessoa. Chave desconhecida vira string
 * vazia (a pessoa nunca recebe "{{email}}" cru).
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function hasTemplate(text: string): boolean {
  return text.includes("{{");
}

/** Só propriedade própria: `{{constructor}}` não pode ler Object.prototype. */
export function ownValue(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

export function renderTemplate(
  text: string,
  vars: Record<string, unknown>
): string {
  if (!hasTemplate(text)) return text;
  return text.replace(PLACEHOLDER, (_, rawKey: string) => {
    // "__" é estado interno do run (ex.: __attempts), nunca conteúdo.
    if (rawKey.startsWith("__")) return "";
    const value = ownValue(vars, rawKey) ?? ownValue(vars, rawKey.toLowerCase());
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
  });
}
