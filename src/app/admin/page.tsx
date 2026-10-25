import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin/require-admin";
import { formatPurgeDate } from "@/lib/billing/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminAuditAction, AdminAuditEntry } from "@/types/database";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<AdminAuditAction, string> = {
  courtesy_grant: "Cortesia dada",
  courtesy_revoke: "Cortesia removida",
  block: "Bloqueio",
  unblock: "Desbloqueio",
  invite_resend: "E-mail de acesso reenviado",
  courtesy_invite: "Convite com cortesia",
};

// Fuso fixo: o Worker roda em UTC.
const whenFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function describeDetails(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof details.expires_at === "string") parts.push(`até ${formatPurgeDate(details.expires_at)}`);
  if (typeof details.reason === "string") parts.push(`motivo: ${details.reason}`);
  if (details.mode === "invite") parts.push("convite");
  if (details.mode === "recovery") parts.push("recuperação de senha");
  if (typeof details.email === "string") parts.push(details.email);
  if (details.status === "requested") parts.push("solicitação registrada; conclusão pendente");
  if (details.invited === true) parts.push("conta nova");
  if (details.invited === false) parts.push("conta existente");
  return parts.join(" · ") || "-";
}

export default async function AdminAuditPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) console.error("[admin] falha ao ler admin_audit_log:", error.message);
  const entries = (data ?? []) as AdminAuditEntry[];

  // Cache local por render: o mesmo admin/cliente aparece em várias linhas.
  const emails = new Map<string, Promise<string | null>>();
  const emailOf = (id: string | null) => {
    if (!id) return Promise.resolve(null);
    if (!emails.has(id)) {
      emails.set(
        id,
        admin.auth.admin.getUserById(id).then(
          ({ data: found }) => found?.user?.email ?? null,
          () => null
        )
      );
    }
    return emails.get(id)!;
  };
  const rows = await Promise.all(
    entries.map(async (e) => ({ ...e, adminEmail: await emailOf(e.admin_id), targetEmail: await emailOf(e.target_user_id) }))
  );

  return (
    <>
      <PageHeader title="Registro" description="Últimas 50 ações feitas por admins." />
      {error ? (
        <p className="text-sm text-muted-foreground">Não foi possível ler o registro agora. Tente de novo em instantes.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
      ) : (
        <Card className="overflow-hidden">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quando</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {whenFormat.format(new Date(r.created_at))}
                  </TableCell>
                  <TableCell className="text-sm">{r.adminEmail ?? r.admin_id}</TableCell>
                  <TableCell className="text-sm">{ACTION_LABEL[r.action] ?? r.action}</TableCell>
                  <TableCell className="text-sm">{r.targetEmail ?? r.target_user_id ?? "-"}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground" title={describeDetails(r.details ?? {})}>
                    {describeDetails(r.details ?? {})}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
