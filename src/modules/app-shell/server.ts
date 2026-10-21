/**
 * API do módulo app-shell para Server Components. Componentes de cliente
 * nunca importam daqui (usa `next/headers`).
 */
import { cookies } from "next/headers";

import { isCollapsedCookie, SIDEBAR_COOKIE } from "./utils/sidebar-state";

export function getSidebarCollapsed(): boolean {
  return isCollapsedCookie(cookies().get(SIDEBAR_COOKIE)?.value);
}
