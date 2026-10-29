import Link from "next/link";

import { CustomerActions } from "@/components/admin/customer-actions";
import { InviteCourtesyForm } from "@/components/admin/invite-courtesy-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers, type CustomerPage, type CustomerRow } from "@/lib/admin/customers";
import { isAccessStatus } from "@/lib/billing/access";
import { requireAdminPage } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  unpaid: "Não paga",
  incomplete: "Não concluída",
  incomplete_expired: "Expirada",
};

// Fuso fixo: o Worker roda em UTC.
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const day = (iso: string | null) => (iso ? dayFormat.format(new Date(iso)) : "-");

function GrantCell({ customer }: { customer: CustomerRow }) {
  const { grant } = customer;
  if (!grant) return <span className="text-xs text-muted-foreground/50">-</span>;
  if (grant.kind === "block") {
    // Bloquear não cancela a Stripe: enquanto a assinatura cobrar, o aviso fica na lista.
    const stillCharging = isAccessStatus(customer.subscriptionStatus);
    return (
      <div className="space-y-0.5">
        <Badge variant="destructive">Bloqueado</Badge>
        {stillCharging && (
          <p className="text-xs font-medium text-destructive">
            Ainda cobrando na Stripe
            {customer.stripeCustomerId && (
              <>
                {" · "}
                <a
                  href={`https://dashboard.stripe.com/customers/${encodeURIComponent(customer.stripeCustomerId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  cancelar
                </a>
              </>
            )}
          </p>
        )}
        <p className="max-w-[180px] truncate text-xs text-muted-foreground" title={grant.reason}>{grant.reason}</p>
      </div>
    );
  }
  // Sem data = cortesia sem prazo: nunca vence.
  const expired = grant.expiresAt ? new Date(grant.expiresAt) <= new Date() : false;
  return (
    <div className="space-y-0.5">
      <Badge variant={expired ? "muted" : "success"}>{expired ? "Cortesia vencida" : "Cortesia"}</Badge>
      <p className="text-xs text-muted-foreground">{grant.expiresAt ? `até ${day(grant.expiresAt)}` : "sem prazo"}</p>
      <p className="max-w-[180px] truncate text-xs text-muted-foreground" title={grant.reason}>{grant.reason}</p>
    </div>
  );
}

export default async function AdminCustomersPage(props: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  await requireAdminPage();
  const search = (searchParams.q ?? "").trim();

  const pageLink = (page: number) => `/admin/clientes?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(page) })}`;
  let result: CustomerPage | null = null;
  try {
    result = await listCustomers(createAdminClient(), { search: search || undefined, page: Number(searchParams.page ?? 1) });
  } catch (err) {
    console.error("[admin] falha ao listar clientes:", err instanceof Error ? err.message : err);
  }

  return (
    <>
      <PageHeader title="Clientes" description="Contas, assinaturas, cortesias e bloqueios." />

      <div className="mb-6">
        <InviteCourtesyForm />
      </div>

      <form method="get" className="mb-5 flex max-w-md gap-2">
        <Input name="q" defaultValue={search} placeholder="Buscar por e-mail" type="search" />
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      {!result ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar os clientes agora. Tente de novo em instantes.</p>
      ) : (
        <>
          {result.customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            <Card className="overflow-hidden">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>E-mail</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead>Último login</TableHead>
                    <TableHead>@ conectado</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Fim do período</TableHead>
                    <TableHead>Exclusão a partir de</TableHead>
                    <TableHead>Cortesia/bloqueio</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.customers.map((c) => (
                    <TableRow key={c.userId}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[220px] truncate" title={c.email}>{c.email || "-"}</span>
                          {c.isAdmin && <Badge>Admin</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{day(c.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {c.lastSignInAt ? day(c.lastSignInAt) : "Nunca entrou"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.igUsername ? `@${c.igUsername}` : "-"}</TableCell>
                      <TableCell className="text-sm">
                        {c.subscriptionStatus ? STATUS_LABEL[c.subscriptionStatus] ?? c.subscriptionStatus : "Sem assinatura"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{day(c.currentPeriodEnd)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{day(c.purgeAfter)}</TableCell>
                      <TableCell>
                        <GrantCell customer={c} />
                      </TableCell>
                      <TableCell className="text-right">
                        {!c.isAdmin && (
                          <CustomerActions
                            userId={c.userId}
                            email={c.email}
                            grantKind={c.grant?.kind ?? null}
                            hasSubscription={Boolean(c.subscriptionStatus && c.subscriptionStatus !== "canceled")}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <nav aria-label="Paginação de clientes" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {result.total} cliente(s) · Página {result.page} de {result.totalPages}
            </p>
            <div className="flex gap-2">
              {result.page > 1 && <Button asChild variant="outline" size="sm"><Link href={pageLink(result.page - 1)}>Anterior</Link></Button>}
              {result.page < result.totalPages && <Button asChild variant="outline" size="sm"><Link href={pageLink(result.page + 1)}>Próxima</Link></Button>}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
