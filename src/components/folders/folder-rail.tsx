"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  FOLDER_COLORS,
  folderCounts,
  type FiledItem,
  type Folder,
} from "@/lib/folders/folders";
import { cn } from "@/lib/utils";

/**
 * Coluna de pastas das listas de Automações e Workflow. As pastas são as
 * mesmas nas duas telas, então a contagem recebe os itens da tela em que a
 * coluna está sendo mostrada.
 *
 * `selected`: null = "Todas", "" = "Sem pasta", id = a pasta.
 */
export const UNFILED = "";

const DOT_CLASS: Record<string, string> = {
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
};

export function FolderRail({
  folders,
  items,
  accountId,
  selected,
  onSelect,
}: {
  folders: Folder[];
  items: FiledItem[];
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

  const counts = folderCounts(folders, items);

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

  return (
    <aside className="w-full shrink-0 space-y-1 sm:w-48">
      <RailButton
        label="Todas"
        count={counts.total}
        active={selected === null}
        onClick={() => onSelect(null)}
      />
      <RailButton
        label="Sem pasta"
        count={counts.unfiled}
        active={selected === UNFILED}
        onClick={() => onSelect(UNFILED)}
      />

      {folders.map((folder) => (
        <RailButton
          key={folder.id}
          label={folder.name}
          count={counts.byFolder[folder.id] ?? 0}
          color={folder.color}
          active={selected === folder.id}
          onClick={() => onSelect(folder.id)}
          menu={
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                aria-label={`Ações da pasta ${folder.name}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded p-0.5 text-muted-foreground/70 hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
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

      {accountId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setCreateOpen(true)}
        >
          <FolderPlus className="h-4 w-4" />
          Nova pasta
        </Button>
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
                  DOT_CLASS[option],
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
    </aside>
  );
}

function RailButton({
  label,
  count,
  color,
  active,
  onClick,
  menu,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {color && (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[color])}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground/70">
        {count}
      </span>
      {menu}
    </div>
  );
}
