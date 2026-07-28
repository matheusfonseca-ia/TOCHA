"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteSequence,
  toggleSequence,
} from "@/app/(dashboard)/rules/sequencias/actions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { triggerSummary } from "@/lib/sequences/graph";
import type { Sequence } from "@/types/sequence";

export type SequenceWithAccount = Sequence & {
  ig_accounts: { ig_username: string } | null;
};

export interface SequenceStats {
  /** Total de pessoas que já entraram no fluxo. */
  total: number;
  /** Pessoas paradas em algum nó de espera agora. */
  inFlow: number;
}

export function SequencesManager({
  sequences,
  stats,
}: {
  sequences: SequenceWithAccount[];
  stats: Record<string, SequenceStats>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sequences;
    return sequences.filter((s) => s.name.toLowerCase().includes(q));
  }, [sequences, query]);

  function handleToggle(sequence: SequenceWithAccount, next: boolean) {
    startTransition(async () => {
      const result = await toggleSequence(sequence.id, next);
      if (result.error) toast.error(result.error);
    });
  }

  function handleDelete(sequence: SequenceWithAccount) {
    if (
      !window.confirm(
        `Excluir a sequência "${sequence.name}"? Quem estiver no meio do fluxo para de recebê-lo.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteSequence(sequence.id);
      if (result.error) toast.error(result.error);
      else toast.success("Sequência excluída.");
    });
  }

  if (sequences.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="Nenhuma sequência criada"
        description="Monte um fluxo de mensagens no canvas: gatilho, mensagens, botões, atrasos e ramificações — o Falow conduz a conversa sozinho."
      >
        <Button asChild>
          <Link href="/rules/sequencias/nova">
            <Plus />
            Criar primeira sequência
          </Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Pesquisar sequências..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button asChild>
          <Link href="/rules/sequencias/nova">
            <Plus />
            Nova sequência
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="animate-fade-up">
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            Nenhuma sequência encontrada para &ldquo;{query}&rdquo;.
          </p>
        </Card>
      ) : (
        <Card className="animate-fade-up overflow-hidden">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sequência</TableHead>
                <TableHead>Blocos</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-center">Execuções</TableHead>
                <TableHead className="text-center">No fluxo</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead>Modificado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sequence) => {
                const stat = stats[sequence.id] ?? { total: 0, inFlow: 0 };
                // -1: o gatilho não conta como passo do fluxo
                const blockCount = Math.max(sequence.graph.nodes.length - 1, 0);
                return (
                  <TableRow
                    key={sequence.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/rules/sequencias/${sequence.id}`)}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={sequence.is_active ? "success" : "muted"}
                          >
                            {sequence.is_active ? "Ativa" : "Pausada"}
                          </Badge>
                          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          <span className="max-w-[220px] truncate text-sm font-medium">
                            {sequence.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/80">
                          Gatilho: {triggerSummary(sequence.graph)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {blockCount} {blockCount === 1 ? "bloco" : "blocos"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      @{sequence.ig_accounts?.ig_username ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                      {stat.total}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                      {stat.inFlow}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={sequence.is_active}
                        onCheckedChange={(next) => handleToggle(sequence, next)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs text-muted-foreground"
                      title={new Date(sequence.updated_at).toLocaleString(
                        "pt-BR"
                      )}
                    >
                      {formatDistanceToNow(new Date(sequence.updated_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/rules/sequencias/${sequence.id}`}>
                              <Pencil />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(sequence)}
                          >
                            <Trash2 />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
