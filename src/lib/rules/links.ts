/**
 * Helpers dos slots de link usados nos builders de automação (DM e
 * comentário) — até 3 links, com título sugerido a partir do domínio da URL.
 */

export interface LinkSlot {
  title: string;
  url: string;
  touched: boolean;
}

export function emptyLink(): LinkSlot {
  return { title: "", url: "", touched: false };
}

export function deriveTitleFromUrl(rawUrl: string): string {
  const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host.slice(0, 20);
  } catch {
    return "";
  }
}

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Tamanho máximo de uma URL de botão/imagem gravada na automação. */
export const URL_MAX = 2000;

/**
 * URL que a Meta aceita num botão web_url ou numa imagem: só http(s), com
 * tamanho limitado. `z.string().url()` aceitaria javascript:, data:, ftp:...
 * Mesma regra do workflow (sequences/graph.ts).
 */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value || value.length > URL_MAX) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
