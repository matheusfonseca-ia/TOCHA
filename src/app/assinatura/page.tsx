import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isAccessStatus, isOwner } from "@/lib/billing/access";
import { formatPurgeDate } from "@/lib/billing/format";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinatura · Falow" };

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento pendente (a Stripe está tentando cobrar de novo)",
  canceled: "Cancelada",
  unpaid: "Não paga",
  incomplete: "Pagamento não concluído",
  incomplete_expired: "Pagamento expirado",
};

export default async function AssinaturaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isOwner(user.id)) redirect("/dashboard");

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Subscription>();

  // Erro de leitura não é "sem assinatura": sem "Reativar" aqui, senão quem já paga
  // abriria uma segunda assinatura.
  if (error) {
    console.error("[assinatura] falha ao ler a assinatura:", error.message);
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md space-y-5 p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight">Sua assinatura</h1>
          <p>Não foi possível conferir sua assinatura agora. Tente de novo em instantes.</p>
          {/* <a> comum (não Link): recarrega a página inteira e refaz a leitura no servidor. */}
          <Button asChild className="w-full">
            <a href="/assinatura">Tentar de novo</a>
          </Button>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
          </form>
        </Card>
      </main>
    );
  }

  const active = isAccessStatus(sub?.status);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Sua assinatura</h1>
        <p>
          Status: <strong>{sub ? STATUS_LABEL[sub.status] ?? sub.status : "Sem assinatura"}</strong>
        </p>

        {!active && sub?.purge_after && (
          <p className="text-sm text-muted-foreground">
            O bot está pausado. Seus dados serão apagados a partir de{" "}
            <strong>{formatPurgeDate(sub.purge_after)}</strong>. Reative antes disso e tudo volta como estava.
          </p>
        )}

        {active ? (
          <div className="flex gap-2">
            <form action="/api/billing/portal" method="post">
              <Button type="submit" variant="outline">Gerenciar na Stripe</Button>
            </form>
            <Button asChild>
              <Link href="/dashboard">Ir para o painel</Link>
            </Button>
          </div>
        ) : (
          <form action="/api/billing/checkout" method="post">
            <Button type="submit" className="w-full">Reativar assinatura</Button>
          </form>
        )}

        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
        </form>
      </Card>
    </main>
  );
}
