"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createFolder,
  deleteFolder,
  renameFolder,
} from "@/app/(dashboard)/rules/folders-actions";
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
import { Input } from "@/components/ui/input";
import { FOLDER_COLORS, type Folder, type FolderCounts } from "@/lib/folders/folders";
import { cn } from "@/lib/utils";

import { folderDotClass } from "../utils/folder-colors";
import { UNFILED } from "../utils/list-view";

/**
 * Pastas das listas de Automações e Workflow, em cartões acima da lista (no
 * jeito do n8n). As pastas são as mesmas nas duas abas; a contagem vem da aba
 * em que os cartões aparecem.
 *
 * `selected`: null = todas, "" = "Sem pasta", id = a pasta. Sem nenhuma pasta
 * (migration ausente ou ainda não criada), a grade some e fica só o botão
 * "Nova pasta", que a lista põe na barra de ferramentas.
 */
export function FolderCards({
  folders,
  counts,
  accountId,
  selected,
  onSelect,
}: {
  folders: Folder[];
  counts: FolderCounts;
  /** Conta dona das pastas novas. Sem conta, não dá pra criar. */
  accountId?: string | null;
  selected: string | null;
  onSelect: (next: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(FOLDER_COLORS[0]);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);

  function handleCreate() {
    if (!accountId) return;
    startTransition(async () => {
      const result = await createFolder({ accountId, name, color });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setCreateOpen(false);
      setName("");
      router.refresh();
    });
  }

  function handleRename() {
    if (!renameTarget) return;
    startTransition(async () => {
      const result = await renameFolder(renameTarget.id, renameValue);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setRenameTarget(null);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteFolder(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (selected === deleteTarget.id) onSelect(null);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  if (folders.length === 0 && !accountId) return null;

  return (
    <>
      {folders.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setCreateOpen(true)}
        >
          <FolderPlus />
          Nova pasta
        </Button>
      ) : (
        <div
          role="group"
          aria-label="Pastas"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              label={folder.name}
              count={counts.byFolder[folder.id] ?? 0}
              dotClass={folderDotClass(folder.color)}
              active={selected === folder.id}
              onClick={() => onSelect(selected === folder.id ? null : folder.id)}
              menu={
                <DropdownMenu>
                  <DropdownMenuTrigger
                    type="button"
                    aria-label={`Ações da pasta ${folder.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenameTarget(folder);
                        setRenameValue(folder.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDeleteTarget(folder)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Apagar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}

          <FolderCard
            label="Sem pasta"
            count={counts.unfiled}
            active={selected === UNFILED}
            onClick={() => onSelect(selected === UNFILED ? null : UNFILED)}
          />

          {accountId && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex h-12 w-40 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-auto"
            >
              <FolderPlus className="h-4 w-4" />
              Nova pasta
            </button>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
            <DialogDescription>
              A mesma pasta serve pras automações e pros workflows.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            placeholder="ex.: Lançamento de março"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <div className="flex gap-2">
            {FOLDER_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Cor ${option}`}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-colors",
                  folderDotClass(option),
                  color === option ? "border-foreground" : "border-transparent"
                )}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear pasta</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              Nada do que está dentro é apagado: as automações e os workflows
              voltam pra “Sem pasta”.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              Apagar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FolderCard({
  label,
  count,
  dotClass,
  active,
  onClick,
  menu,
}: {
  label: string;
  count: number;
  /** Sem cor = "Sem pasta" (anel vazado). */
  dotClass?: string;
  active: boolean;
  onClick: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-12 w-44 shrink-0 items-center rounded-lg border bg-card transition-colors sm:w-auto",
        active
          ? "border-primary/70 bg-primary/5 dark:bg-primary/10"
          : "border-border/70 hover:border-border hover:bg-secondary/30"
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
          menu ? "pr-1" : "pr-3"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            dotClass ?? "border border-muted-foreground/60"
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </button>
      {menu && <div className="pr-1.5">{menu}</div>}
    </div>
  );
}

/** "← Todas / ● Lançamento": aparece acima da lista quando uma pasta está aberta. */
export function FolderBreadcrumb({
  folder,
  onBack,
}: {
  /** null = "Sem pasta". */
  folder: Folder | null;
  onBack: () => void;
}) {
  return (
    <nav aria-label="Pasta aberta" className="flex items-center gap-1.5 text-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Voltar para todas"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Todas
      </button>
      <span aria-hidden className="text-muted-foreground/50">
        /
      </span>
      <span className="flex min-w-0 items-center gap-2 font-medium" aria-current="page">
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            folder ? folderDotClass(folder.color) : "border border-muted-foreground/60"
          )}
        />
        <span className="truncate">{folder ? folder.name : "Sem pasta"}</span>
      </span>
    </nav>
  );
}
