"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  FolderInput,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
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
import {
  RefLinkDialog,
  type RefLinkTarget,
} from "@/components/sequences/ref-link-dialog";
import { ExpiryBadge } from "@/components/expiry/expiry-badge";
import { ExpiryDialog, type ExpiryTarget } from "@/components/expiry/expiry-dialog";
import { Button } from "@/components/ui/button";
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
import type { Folder } from "@/lib/folders/folders";
import { refCodeOf } from "@/lib/sequences/graph";

import { useListView } from "../hooks/use-list-view";
import type { SequenceStats, SequenceWithAccount } from "../types";
import { sequenceAdapter, sequenceTriggerLine } from "../utils/display";
import {
  applyListView,
  DEFAULT_VIEW,
  SEQUENCES_SORT,
  isFiltered,
  sanitizeView,
  viewFolderCounts,
} from "../utils/list-view";
import { AutomationList, AutomationRow, FolderChip, NoResults } from "./automation-row";
import { FolderBreadcrumb, FolderCards } from "./folder-cards";
import { ListToolbar } from "./list-toolbar";
import { MoveToFolderDialog, type MoveTarget } from "./move-to-folder-dialog";

export function SequencesManager({
  sequences,
  stats,
  folders = [],
  accountId,
}: {
  sequences: SequenceWithAccount[];
  stats: Record<string, SequenceStats>;
  /** Vazio quando a migration 0010 ainda não foi aplicada: a grade de pastas some. */
  folders?: Folder[];
  accountId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<SequenceWithAccount | null>(
    null
  );
  const [expiryTarget, setExpiryTarget] = useState<ExpiryTarget | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [refTarget, setRefTarget] = useState<RefLinkTarget | null>(null);

  const { view: rawView, update, reset } = useListView("falow:automations:sequences", SEQUENCES_SORT);
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  // Workflow não tem filtro de tipo nem de conta: só pasta e status contam.
  const view = useMemo(
    () => sanitizeView({ ...rawView, kind: "all", account: "all" }, { folderIds }),
    [rawView, folderIds]
  );
  const adapter = useMemo(() => sequenceAdapter(stats), [stats]);
  const filtered = useMemo(
    () => applyListView(sequences, view, adapter, folderIds),
    [sequences, view, adapter, folderIds]
  );
  const counts = useMemo(
    () => viewFolderCounts(sequences, view, adapter, folders),
    [sequences, view, adapter, folders]
  );

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

  const folderCards = (
    <FolderCards
      folders={folders}
      counts={counts}
      accountId={accountId}
      selected={view.folder}
      onSelect={(folder) => update({ folder })}
    />
  );
  // Só a pasta aberta, sem outro filtro: a lista vazia é pasta vazia, não busca sem resultado.
  const onlyFolder =
    view.folder !== null && !isFiltered({ ...view, folder: DEFAULT_VIEW.folder });

  return (
    <>
      <div className="space-y-4">
        <ListToolbar
          view={view}
          onChange={update}
          onReset={reset}
          searchPlaceholder="Pesquisar workflows..."
          gender="m"
          sorts={SEQUENCES_SORT}
          trailing={folders.length === 0 ? folderCards : undefined}
        />

        {folders.length > 0 && folderCards}

        {view.folder !== null && (
          <FolderBreadcrumb
            folder={view.folder ? (folderById.get(view.folder) ?? null) : null}
            onBack={() => update({ folder: null })}
          />
        )}

        {filtered.length === 0 ? (
          <NoResults
            message={
              onlyFolder
                ? "Nenhum workflow nesta pasta ainda. Use “Mover para pasta” no menu de um workflow para trazê-lo pra cá."
                : "Nenhum workflow encontrado com esses filtros."
            }
            onReset={onlyFolder ? undefined : reset}
          />
        ) : (
          <AutomationList>
            {filtered.map((sequence, index) => {
              const stat = stats[sequence.id] ?? { total: 0, inFlow: 0 };
              const refCode = refCodeOf(sequence.graph);
              const folder =
                view.folder === null && sequence.folder_id
                  ? folderById.get(sequence.folder_id)
                  : undefined;
              return (
                <AutomationRow
                  key={sequence.id}
                  index={index}
                  icon={Workflow}
                  title={sequence.name}
                  href={`/rules/sequencias/${sequence.id}`}
                  triggerLine={sequenceTriggerLine(sequence)}
                  updatedAt={sequence.updated_at}
                  createdAt={sequence.created_at}
                  gender="m"
                  badges={
                    <>
                      <ExpiryBadge
                        expiresAt={sequence.expires_at}
                        expireAction={sequence.expire_action}
                      />
                      {folder && <FolderChip folder={folder} />}
                    </>
                  }
                  metrics={[
                    { value: stat.total, singular: "execução", plural: "execuções" },
                    { value: stat.inFlow, singular: "no fluxo", plural: "no fluxo" },
                  ]}
                  active={sequence.is_active}
                  onToggle={(next) => handleToggle(sequence, next)}
                  toggleDisabled={isPending}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${sequence.name}`}
                        >
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
                          onClick={() => handleDuplicate(sequence)}
                        >
                          <Copy />
                          Duplicar
                        </DropdownMenuItem>
                        {refCode && sequence.ig_accounts?.ig_username && (
                          <DropdownMenuItem
                            onClick={() =>
                              setRefTarget({
                                name: sequence.name,
                                code: refCode,
                                username: sequence.ig_accounts!.ig_username,
                                entries: stat.total,
                              })
                            }
                          >
                            <LinkIcon />
                            Link e QR code
                          </DropdownMenuItem>
                        )}
                        {folders.length > 0 && (
                          <DropdownMenuItem
                            onClick={() =>
                              setMoveTarget({
                                kind: "sequence",
                                id: sequence.id,
                                name: sequence.name,
                                folderId: sequence.folder_id ?? null,
                              })
                            }
                          >
                            <FolderInput />
                            Mover para pasta
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            setExpiryTarget({
                              id: sequence.id,
                              name: sequence.name,
                              expires_at: sequence.expires_at,
                              expire_action: sequence.expire_action,
                            })
                          }
                        >
                          <Timer />
                          {sequence.expires_at
                            ? "Estender expiração"
                            : "Tornar temporário"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(sequence)}
                        >
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              );
            })}
          </AutomationList>
        )}
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
