import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { withBasePath } from "@/lib/app-url";
import { accessGrantOf, isAccessStatus, isAdmin } from "@/lib/billing/access";
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

function ErroNeutro() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Sua assinatura</h1>
        <p>Não foi possível conferir sua assinatura agora. Tente de novo em instantes.</p>
        {/* <a> comum (não Link): recarrega a página inteira e refaz a leitura no servidor. */}
        <Button asChild className="w-full">
          <a href={withBasePath("/assinatura")}>Tentar de novo</a>
        </Button>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
        </form>
      </Card>
    </main>
  );
}

export default async function AssinaturaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isAdmin(user.id)) redirect("/dashboard");

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Subscription>();

  // Erro de leitura não é "sem assinatura": sem "Reativar" aqui, senão quem já paga
  // abriria uma segunda assinatura.
  if (error) {
    console.error("[assinatura] falha ao ler a assinatura:", error.message);
    return <ErroNeutro />;
  }

  const { grant, error: grantError } = await accessGrantOf(supabase, user.id);
  if (grantError) return <ErroNeutro />;

  // Bloqueio manda sobre a assinatura: sem Reativar nem Gerenciar, só Sair.
  if (grant?.kind === "block") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md space-y-5 p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight">Sua assinatura</h1>
          <p>Conta bloqueada. Fale com o suporte.</p>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
          </form>
        </Card>
      </main>
    );
  }

  const courtesyUntil =
    grant?.kind === "courtesy" && grant.expires_at && new Date(grant.expires_at) > new Date()
      ? grant.expires_at
      : null;
  const active = isAccessStatus(sub?.status);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Sua assinatura</h1>
        {/* Cortesia é uma linha a mais: o status, o aviso de exclusão e os botões continuam. */}
        {courtesyUntil && (
          <p>
            Cortesia válida até <strong>{formatPurgeDate(courtesyUntil)}</strong>
          </p>
        )}

        <p>
          Status: <strong>{sub ? STATUS_LABEL[sub.status] ?? sub.status : "Sem assinatura"}</strong>
        </p>

        {/* Com cortesia o purge só espera, não remarca: quando ela acaba, a data já pode ter passado. */}
        {!active && sub?.purge_after && courtesyUntil && (
          <p className="text-sm text-muted-foreground">
            A exclusão está agendada para <strong>{formatPurgeDate(sub.purge_after)}</strong> e só espera a
            cortesia acabar: no fim dela, seus dados serão apagados. Reative antes disso e tudo continua como está.
          </p>
        )}
        {!active && sub?.purge_after && !courtesyUntil && (
          <p className="text-sm text-muted-foreground">
            O bot está pausado. Seus dados serão apagados a partir de{" "}
            <strong>{formatPurgeDate(sub.purge_after)}</strong>. Reative antes disso e tudo volta como estava.
          </p>
        )}

        {active ? (
          <div className="flex gap-2">
            <form action={withBasePath("/api/billing/portal")} method="post">
              <Button type="submit" variant="outline">Gerenciar na Stripe</Button>
            </form>
            <Button asChild>
              <Link href="/dashboard">Ir para o painel</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <form action={withBasePath("/api/billing/checkout")} method="post">
              <Button type="submit" className="w-full">Reativar assinatura</Button>
            </form>
            {courtesyUntil && (
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard">Ir para o painel</Link>
              </Button>
            )}
          </div>
        )}

        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
        </form>
      </Card>
    </main>
  );
}
