import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  RulesManager,
  type RuleWithAccount,
} from "@/components/rules/rules-manager";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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

  const accountIds = accounts.map((a) => a.id);
  const executionsRes =
    rules.length > 0
      ? await supabase
          .from("interactions")
          .select("matched_rule_id")
          .in("account_id", accountIds)
          .eq("status", "replied")
          .not("matched_rule_id", "is", null)
      : { data: [] };

  const executionCounts = new Map<string, number>();
  for (const row of executionsRes.data ?? []) {
    const ruleId = row.matched_rule_id as string;
    executionCounts.set(ruleId, (executionCounts.get(ruleId) ?? 0) + 1);
  }

  return (
    <RulesManager
      rules={rules}
      accounts={accounts}
      executionCounts={Object.fromEntries(executionCounts)}
    />
  );
}
