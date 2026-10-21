/**
 * Atalho de teclado da sidebar: Ctrl+B (Windows/Linux) ou Cmd+B (Mac) alterna
 * entre aberta e recolhida. Lógica pura, sem DOM real, pra poder testar.
 */

/** O mínimo de um KeyboardEvent que o filtro precisa. */
export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target: unknown;
}

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Campo onde a pessoa está digitando. Lá o Ctrl+B é do campo (negrito em
 * editor rico, por exemplo), então o atalho da sidebar não dispara.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as TargetLike;
  if (el.isContentEditable) return true;
  if (el.tagName && EDITABLE_TAGS.has(el.tagName.toUpperCase())) return true;
  return el.getAttribute?.("role") === "textbox";
}

export function isSidebarToggleShortcut(event: ShortcutEventLike): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  // Ctrl+Shift+B e Ctrl+Alt+B são de outras coisas (barra de favoritos etc.)
  if (event.altKey || event.shiftKey) return false;
  if (event.key.toLowerCase() !== "b") return false;
  return !isEditableTarget(event.target);
}

/** Mac, iPhone e iPad usam Cmd no lugar de Ctrl. */
export function isApplePlatform(platform: string | undefined | null): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "");
}

/** Teclas do atalho para mostrar no tooltip, uma por <kbd>. */
export function sidebarShortcutKeys(apple: boolean): [string, string] {
  return [apple ? "⌘" : "Ctrl", "B"];
}
