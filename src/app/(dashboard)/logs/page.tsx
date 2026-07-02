import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Interaction, InteractionStatus } from "@/types/database";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "replied", label: "Respondidas" },
  { value: "no_match", label: "Sem match" },
  { value: "duplicate_skip", label: "Duplicadas" },
  { value: "window_expired", label: "Janela 24h" },
  { value: "error", label: "Erros" },
];

type LogRow = Interaction & { ig_accounts: { ig_username: string } | null };

export default async function LogsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createClient();
  const statusFilter = searchParams.status ?? "";

  let query = supabase
    .from("interactions")
    .select("*, ig_accounts(ig_username)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data } = await query;
  const logs = (data ?? []) as LogRow[];

  return (
    <>
      <PageHeader
        title="Logs"
        description="Últimas 100 interações processadas pelo webhook."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/logs?status=${f.value}` : "/logs"}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {logs.length === 0 ? (
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <ScrollText className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Nenhum log ainda
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Quando alguém enviar uma DM para uma conta conectada, cada
                mensagem processada aparece aqui.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="animate-fade-up overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Quando</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Mensagem recebida</TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Latência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd MMM · HH:mm:ss", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    @{log.ig_accounts?.ig_username ?? "—"}
                  </TableCell>
                  <TableCell>
                    <p
                      className="max-w-[280px] truncate text-sm"
                      title={log.message_text ?? undefined}
                    >
                      {log.message_text ?? "(sem texto)"}
                    </p>
                    {log.error_detail && (
                      <p
                        className="max-w-[280px] truncate text-xs text-red-400"
                        title={log.error_detail}
                      >
                        {log.error_detail}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.matched_keyword ? (
                      <span className="font-mono text-xs text-primary">
                        {log.matched_keyword}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status as InteractionStatus} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {log.latency_ms != null ? `${(log.latency_ms / 1000).toFixed(1)}s` : "—"}
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
