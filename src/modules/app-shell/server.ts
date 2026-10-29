/**
 * API do módulo app-shell para Server Components. Componentes de cliente
 * nunca importam daqui (usa `next/headers`).
 */
import { cookies } from "next/headers";

import { isCollapsedCookie, SIDEBAR_COOKIE } from "./utils/sidebar-state";

export async function getSidebarCollapsed(): Promise<boolean> {
  return isCollapsedCookie((await cookies()).get(SIDEBAR_COOKIE)?.value);
}
