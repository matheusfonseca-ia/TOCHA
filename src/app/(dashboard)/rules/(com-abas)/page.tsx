import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { listFolders } from "@/app/(dashboard)/rules/folders-actions";
import { createClient } from "@/lib/supabase/server";
import { RulesManager, type RuleWithAccount } from "@/modules/automations";

export default async function RulesPage() {
  const supabase = createClient();

  const [accountsRes, rulesRes] = await Promise.all([
    supabase
      .from("ig_accounts")
      .select("id, ig_username")
      .eq("status", "active")
      .order("connected_at"),
    supabase
      .from("rules")
      .select("*, ig_accounts(ig_username)")
      .order("priority")
      .order("created_at"),
  ]);

  const accounts = accountsRes.data ?? [];
  const rules = (rulesRes.data ?? []) as RuleWithAccount[];
  const folders = await listFolders();

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Conecte uma conta primeiro"
        description="As regras de automação precisam de uma conta do Instagram conectada."
      >
        <Button asChild>
          <Link href="/accounts">Conectar Instagram</Link>
        </Button>
      </EmptyState>
    );
  }

  // "Executada N vezes": uma contagem no banco por regra (índice em
  // matched_rule_id), em vez de baixar as interactions e somar aqui, o que
  // o teto de 1000 linhas do PostgREST cortava em silêncio.
  const accountIds = accounts.map((a) => a.id);
  const counts = await Promise.all(
    rules.map(async (rule) => {
      const { count } = await supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .in("account_id", accountIds)
        .eq("matched_rule_id", rule.id)
        .eq("status", "replied");
      return [rule.id, count ?? 0] as const;
    })
  );
  const executionCounts = new Map(counts.filter(([, count]) => count > 0));

  return (
    <RulesManager
      rules={rules}
      accounts={accounts}
      executionCounts={Object.fromEntries(executionCounts)}
      folders={folders}
    />
  );
}
