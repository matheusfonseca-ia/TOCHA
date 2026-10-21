"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { sidebarCookieString } from "../utils/sidebar-state";

interface AppShellValue {
  /** Sidebar recolhida (só ícones). Vale do `md` pra cima; no celular é drawer. */
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
}

const AppShellContext = createContext<AppShellValue | null>(null);

/**
 * Casca do painel: guarda se a sidebar está recolhida e expõe isso no
 * `data-sidebar` do wrapper. O CSS (`.app-shell` em globals.css) troca a
 * `--sidebar-w` a partir desse atributo e a transição anima a variável, então
 * sidebar, conteúdo e telas em tela cheia mudam de largura no mesmo quadro.
 */
export function AppShellProvider({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState(initialCollapsed);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    document.cookie = sidebarCookieString(next);
  }, []);

  const toggle = useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed]
  );

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle]
  );

  return (
    <AppShellContext.Provider value={value}>
      <div
        className="app-shell min-h-screen"
        data-sidebar={collapsed ? "collapsed" : "expanded"}
      >
        {children}
      </div>
    </AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellValue {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell precisa estar dentro de <AppShellProvider>.");
  }
  return value;
}
