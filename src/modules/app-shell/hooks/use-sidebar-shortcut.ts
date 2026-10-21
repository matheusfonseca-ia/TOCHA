"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  isApplePlatform,
  isSidebarToggleShortcut,
  sidebarShortcutKeys,
} from "../utils/sidebar-shortcut";

/** Liga o Ctrl+B / Cmd+B à função de alternar a sidebar. */
export function useSidebarShortcut(onToggle: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSidebarToggleShortcut(event)) return;
      // Firefox abre a barra de favoritos no Ctrl+B
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onToggle]);
}

const noopSubscribe = () => () => {};

function readPlatform(): string {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return nav.userAgentData?.platform || nav.platform || "";
}

/** Teclas do atalho certas para o sistema de quem usa (Ctrl ou ⌘). */
export function useSidebarShortcutKeys(): [string, string] {
  const apple = useSyncExternalStore(
    noopSubscribe,
    () => isApplePlatform(readPlatform()),
    () => false
  );
  return sidebarShortcutKeys(apple);
}
