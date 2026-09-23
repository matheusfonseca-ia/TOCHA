"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, RefreshCw } from "lucide-react";

import { getSequenceRuns } from "@/app/(dashboard)/rules/sequencias/runs-actions";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { nodeById } from "@/lib/sequences/graph";
import { cn } from "@/lib/utils";
import type {
  SequenceGraph,
  SequenceNodeType,
  SequenceRun,
  SequenceRunStatus,
} from "@/types/sequence";

/**
 * Painel de execuções da sequência: últimas `sequence_runs` com status, nó
 * atual e erro, pra debugar direto no editor sem abrir o banco. Os dados
 * chegam prontos do servidor (carregados em [id]/page.tsx); "Atualizar"
 * busca de novo via server action, já que o editor pode ficar aberto
 * enquanto execuções continuam rodando em paralelo.
 */

const STATUS_LABELS: Record<
  SequenceRunStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  running: { label: "Em andamento", variant: "default" },
  waiting_reply: { label: "Esperando resposta", variant: "warning" },
  waiting_postback: { label: "Esperando toque no botão", variant: "warning" },
  waiting_delay: { label: "Aguardando atraso", variant: "warning" },
  completed: { label: "Concluída", variant: "success" },
  window_expired: { label: "Janela de 24h expirou", variant: "muted" },
  error: { label: "Erro", variant: "destructive" },
};

const NODE_TYPE_LABELS: Record<SequenceNodeType, string> = {
  trigger: "Gatilho",
  message: "Mensagem",
  buttons: "Botões",
  quickReplies: "Respostas rápidas",
  delay: "Atraso",
  waitReply: "Esperar resposta",
  automation: "Automação",
};

const STATUS_FILTERS: { value: SequenceRunStatus | ""; label: string }[] = [
  { value: "", label: "Todas" },
  ...(Object.keys(STATUS_LABELS) as SequenceRunStatus[]).map((value) => ({
    value,
    label: STATUS_LABELS[value].label,
  })),
];

function currentNodeLabel(graph: SequenceGraph, nodeId: string | null): string {
  if (!nodeId) return "Concluído ou não iniciado";
  const node = nodeById(graph, nodeId);
  if (!node) return "Bloco removido do fluxo";
  return NODE_TYPE_LABELS[node.type] ?? node.type;
}

export function SequenceRunsPanel({
  sequenceId,
  graph,
  initialRuns,
}: {
  sequenceId: string;
  graph: SequenceGraph;
  initialRuns: SequenceRun[];
}) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(initialRuns);
  const [statusFilter, setStatusFilter] = useState<SequenceRunStatus | "">("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (statusFilter ? runs.filter((r) => r.status === statusFilter) : runs),
    [runs, statusFilter]
  );

  const handleRefresh = () => {
    startTransition(async () => {
      const fresh = await getSequenceRuns(sequenceId);
      setRuns(fresh);
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" />
        Execuções
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execuções da sequência</DialogTitle>
            <DialogDescription>
              {runs.length === 0
                ? "Nenhuma execução registrada ainda."
                : runs.length === 1
                  ? "1 execução registrada."
                  : `Últimas ${runs.length} execuções registradas, mais recentes primeiro.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border/70 bg-card p-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value || "all"}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    statusFilter === f.value
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleRefresh}
              disabled={isPending}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/70">
            {filtered.length === 0 ? (
              <EmptyState
                icon={History}
                title="Nenhuma execução"
                description="Quando alguém entrar nesta sequência, as execuções aparecem aqui com status, nó atual e erros."
              />
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nó atual</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="text-right">Atualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(run.started_at), "dd MMM · HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_LABELS[run.status]?.variant ?? "muted"}>
                          {STATUS_LABELS[run.status]?.label ?? run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {currentNodeLabel(graph, run.current_node_id)}
                      </TableCell>
                      <TableCell>
                        {run.last_error ? (
                          <p
                            className="max-w-[240px] truncate text-xs text-red-600 dark:text-red-400"
                            title={run.last_error}
                          >
                            {run.last_error}
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">Nenhum</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {format(new Date(run.updated_at), "dd MMM · HH:mm", {
                          locale: ptBR,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
