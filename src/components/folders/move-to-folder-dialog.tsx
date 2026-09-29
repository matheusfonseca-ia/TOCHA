"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { moveToFolder } from "@/app/(dashboard)/rules/folders-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Folder } from "@/lib/folders/folders";
import { cn } from "@/lib/utils";

export interface MoveTarget {
  kind: "rule" | "sequence";
  id: string;
  name: string;
  folderId: string | null;
}

/** Escolher a pasta de uma automação ou de um workflow. */
export function MoveToFolderDialog({
  target,
  folders,
  onClose,
}: {
  target: MoveTarget | null;
  folders: Folder[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move(folderId: string | null) {
    if (!target) return;
    startTransition(async () => {
      const result = await moveToFolder({
        kind: target.kind,
        id: target.id,
        folderId,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover para pasta</DialogTitle>
          <DialogDescription>{target?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <FolderOption
            label="Sem pasta"
            active={!target?.folderId}
            disabled={isPending}
            onClick={() => move(null)}
          />
          {folders.map((folder) => (
            <FolderOption
              key={folder.id}
              label={folder.name}
              active={target?.folderId === folder.id}
              disabled={isPending}
              onClick={() => move(folder.id)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FolderOption({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}
