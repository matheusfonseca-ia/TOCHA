import Link from "next/link";
import { Instagram } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import {
  RulesManager,
  type RuleWithAccount,
} from "@/components/rules/rules-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Instagram className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Conecte uma conta primeiro
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                As regras de automação precisam de uma conta do Instagram
                conectada.
              </p>
            </div>
            <Button asChild>
              <Link href="/accounts">Conectar Instagram</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <RulesManager rules={rules} accounts={accounts} />
      )}
    </>
  );
}
