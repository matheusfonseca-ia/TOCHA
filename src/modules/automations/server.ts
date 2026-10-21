/**
 * API do módulo automations para Server Components. Componentes de cliente
 * nunca importam daqui (usa o cliente Supabase do servidor).
 */
import { createClient } from "@/lib/supabase/server";

import type { AutomationCounts } from "./types";

/**
 * Contagem das abas do topo. `head: true` não traz linha nenhuma, só o total;
 * o RLS já limita às automações e workflows do usuário.
 */
export async function getAutomationCounts(): Promise<AutomationCounts> {
  const supabase = createClient();
  const [rules, sequences] = await Promise.all([
    supabase.from("rules").select("id", { count: "exact", head: true }),
    supabase.from("sequences").select("id", { count: "exact", head: true }),
  ]);
  return { rules: rules.count ?? 0, sequences: sequences.count ?? 0 };
}
