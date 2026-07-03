import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/layout/page-header";
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

  return (
    <>
      <PageHeader
        title="Automação"
        description='Regras de palavra-chave: "Se receber X, responda Y".'
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Instagram}
          title="Conecte uma conta primeiro"
          description="As regras de automação precisam de uma conta do Instagram conectada."
        >
          <Button asChild>
            <Link href="/accounts">Conectar Instagram</Link>
          </Button>
        </EmptyState>
      ) : (
        <RulesManager rules={rules} accounts={accounts} />
      )}
    </>
  );
}
