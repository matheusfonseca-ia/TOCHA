/**
 * URLs que vêm da Meta (anexos, mídia, story, foto do lead) ou do banco só
 * viram `href`/`src` se forem https. Qualquer outro esquema (`javascript:`,
 * `data:`, `http:`) é descartado e a tela mostra "Mídia indisponível": o
 * React ainda renderiza `href="javascript:..."` e o clique rodaria script
 * com a sessão do atendente.
 */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const parsed = new URL(url);
    // Devolve o texto original (URL assinada da CDN não pode ser renormalizada).
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}

/** Link do perfil no Instagram, com o @ escapado (nunca vira caminho ou query). */
export function instagramProfileUrl(username: string | null | undefined): string | null {
  const clean = typeof username === "string" ? username.trim().replace(/^@/, "") : "";
  return clean ? `https://www.instagram.com/${encodeURIComponent(clean)}/` : null;
}
