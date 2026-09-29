"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Copy,
  FolderInput,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteSequence,
  duplicateSequence,
  toggleSequence,
} from "@/app/(dashboard)/rules/sequencias/actions";
import { EmptyState } from "@/components/empty-state";
import { FolderRail, UNFILED } from "@/components/folders/folder-rail";
import {
  MoveToFolderDialog,
  type MoveTarget,
} from "@/components/folders/move-to-folder-dialog";
import {
  RefLinkDialog,
  type RefLinkTarget,
} from "@/components/sequences/ref-link-dialog";
import { ExpiryBadge } from "@/components/expiry/expiry-badge";
import { ExpiryDialog, type ExpiryTarget } from "@/components/expiry/expiry-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Folder } from "@/lib/folders/folders";
import { refCodeOf, triggerSummary } from "@/lib/sequences/graph";
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
  folders = [],
  accountId,
}: {
  sequences: SequenceWithAccount[];
  stats: Record<string, SequenceStats>;
  /** Vazio quando a migration 0010 ainda não foi aplicada: a coluna some. */
  folders?: Folder[];
  accountId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SequenceWithAccount | null>(
    null
  );
  const [expiryTarget, setExpiryTarget] = useState<ExpiryTarget | null>(null);
  /** null = todas; "" = sem pasta; id = a pasta. */
  const [folder, setFolder] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [refTarget, setRefTarget] = useState<RefLinkTarget | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const known = new Set(folders.map((f) => f.id));
    return sequences.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (folder === null) return true;
      const current = s.folder_id && known.has(s.folder_id) ? s.folder_id : UNFILED;
      return current === folder;
    });
  }, [sequences, query, folder, folders]);

  function handleToggle(sequence: SequenceWithAccount, next: boolean) {
    startTransition(async () => {
      const result = await toggleSequence(sequence.id, next);
      if (result.error) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
    });
  }

  function handleDuplicate(sequence: SequenceWithAccount) {
    startTransition(async () => {
      const result = await duplicateSequence(sequence.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Workflow duplicado. A cópia foi criada pausada.");
      if (result.id) router.push(`/rules/sequencias/${result.id}`);
    });
  }

  function handleDelete(sequence: SequenceWithAccount) {
    startTransition(async () => {
      const result = await deleteSequence(sequence.id);
      if (result.error) toast.error(result.error);
      else toast.success("Workflow excluído.");
      setDeleteTarget(null);
    });
  }

  if (sequences.length === 0) {
    return (
      <EmptyState
        icon={Workflow}
        title="Nenhum workflow criado"
        description="Monte um fluxo de mensagens no canvas: gatilho, mensagens, botões, atrasos e ramificações. O Falow conduz a conversa sozinho."
      >
        <Button asChild>
          <Link href="/rules/sequencias/nova">
            <Plus />
            Criar primeiro workflow
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
            placeholder="Pesquisar workflows..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button asChild>
          <Link href="/rules/sequencias/nova">
            <Plus />
            Novo workflow
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <FolderRail
          folders={folders}
          items={sequences}
          accountId={accountId}
          selected={folder}
          onSelect={setFolder}
        />
        <div className="min-w-0 flex-1">
      {filtered.length === 0 ? (
        <Card className="animate-fade-up">
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            Nenhum workflow encontrado aqui.
          </p>
        </Card>
      ) : (
        <Card className="animate-fade-up overflow-hidden">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Workflow</TableHead>
                <TableHead>Blocos</TableHead>
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
                const refCode = refCodeOf(sequence.graph);
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
                          <ExpiryBadge
                            expiresAt={sequence.expires_at}
                            expireAction={sequence.expire_action}
                          />
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
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(sequence);
                            }}
                          >
                            <Copy />
                            Duplicar
                          </DropdownMenuItem>
                          {refCode && sequence.ig_accounts?.ig_username && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setRefTarget({
                                  name: sequence.name,
                                  code: refCode,
                                  username: sequence.ig_accounts!.ig_username,
                                  entries: stat.total,
                                });
                              }}
                            >
                              <LinkIcon />
                              Link e QR code
                            </DropdownMenuItem>
                          )}
                          {folders.length > 0 && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveTarget({
                                  kind: "sequence",
                                  id: sequence.id,
                                  name: sequence.name,
                                  folderId: sequence.folder_id ?? null,
                                });
                              }}
                            >
                              <FolderInput />
                              Mover para pasta
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpiryTarget({
                                id: sequence.id,
                                name: sequence.name,
                                expires_at: sequence.expires_at,
                                expire_action: sequence.expire_action,
                              });
                            }}
                          >
                            <Timer />
                            {sequence.expires_at
                              ? "Estender expiração"
                              : "Tornar temporário"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(sequence);
                            }}
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
        </div>
      </div>

      <MoveToFolderDialog
        target={moveTarget}
        folders={folders}
        onClose={() => setMoveTarget(null)}
      />

      <RefLinkDialog target={refTarget} onClose={() => setRefTarget(null)} />

      <ExpiryDialog
        kind="sequence"
        target={expiryTarget}
        onClose={() => setExpiryTarget(null)}
      />

      {/* ── Confirmação de exclusão ──────────────────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir workflow</DialogTitle>
            <DialogDescription>
              Excluir o workflow &ldquo;{deleteTarget?.name}&rdquo;? Quem
              estiver no meio do fluxo para de recebê-lo. Essa ação não pode
              ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
