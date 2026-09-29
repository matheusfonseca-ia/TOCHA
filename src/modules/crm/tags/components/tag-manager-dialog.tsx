"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createTag, deleteTag, getTagWorkflowUsage, openTagManager, renameTag, updateTagColor } from "../services/tags.actions";
import type { CrmTag, TagColor, TagWorkflowUsage } from "../types";
import { TAG_COLORS } from "../types";
import { cleanTagName, TAG_NAME_MAX } from "../utils/normalize-tag";
import { paletteColorForIndex, TAG_COLOR_DOT_CLASSES, TAG_COLOR_LABEL } from "../utils/palette";

export function TagManagerDialog({
  open,
  onOpenChange,
  accountId,
  accountUsername,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountUsername: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingUsage, setPendingUsage] = useState<TagWorkflowUsage | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    setLoading(true);
    setError(null);
    openTagManager(accountId).then((res) => {
      setTags(res.tags);
      setError(res.error);
      setLoading(false);
    });
  }, [open, accountId]);

  async function handleCreate() {
    const name = cleanTagName(newName);
    if (!name) return;
    const color = paletteColorForIndex(tags.length);
    const result = await createTag(accountId, name, color);
    if (result.error || !result.tag) {
      toast.error(result.error ?? "Não foi possível criar a tag.");
      return;
    }
    setTags((prev) => [...prev, result.tag as CrmTag]);
    setNewName("");
  }

  async function handleRename(tag: CrmTag) {
    const name = cleanTagName(editingName);
    if (!name || name === tag.name) {
      setEditingId(null);
      return;
    }
    const result = await renameTag(accountId, tag.id, tag.name, name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, name } : t)));
    setEditingId(null);
    toast.success("Tag renomeada.");
  }

  async function handleColor(tag: CrmTag, color: TagColor) {
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, color } : t)));
    const result = await updateTagColor(accountId, tag.id, color);
    if (result.error) toast.error(result.error);
  }

  async function askDelete(tag: CrmTag) {
    setPendingDeleteId(tag.id);
    setPendingUsage(null);
    const usage = await getTagWorkflowUsage(accountId, tag.name);
    setPendingUsage(usage);
  }

  async function confirmDelete(tag: CrmTag) {
    const result = await deleteTag(accountId, tag.id, tag.name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
    setPendingDeleteId(null);
    toast.success("Tag excluída.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
          <DialogDescription>
            {accountUsername ? `Tags da conta @${accountUsername}.` : "Tags desta conta."} Aplique na ficha
            do lead ou em massa na lista de conversas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Nova tag (ex.: vip)"
                maxLength={TAG_NAME_MAX}
              />
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                <Plus className="h-3.5 w-3.5" />
                Criar
              </Button>
            </div>

            {tags.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma tag ainda.</p>
            ) : (
              <ul className="max-h-[320px] space-y-1 overflow-y-auto">
                {tags.map((tag) => (
                  <li key={tag.id} className="rounded-lg border border-border/70 px-2 py-2">
                    {pendingDeleteId === tag.id ? (
                      <div className="space-y-2 text-[13px]">
                        {pendingUsage === null ? (
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo uso nos workflows...
                          </p>
                        ) : (
                          <p className="text-muted-foreground">
                            Excluir a tag <strong className="text-foreground">{tag.name}</strong> tira ela de
                            todos os contatos.
                            {pendingUsage.count > 0 && (
                              <>
                                {" "}
                                <strong className="text-foreground">
                                  {pendingUsage.count} {pendingUsage.count === 1 ? "workflow usa" : "workflows usam"}{" "}
                                  esta tag
                                </strong>{" "}
                                e continuará configurado para ela depois de excluída.{" "}
                                <Link href="/rules/sequencias" className="underline underline-offset-2">
                                  Ver workflows
                                </Link>
                                .
                              </>
                            )}
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>
                            Cancelar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => confirmDelete(tag)}>
                            Excluir mesmo assim
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ColorSwatchPicker color={tag.color} onChange={(c) => handleColor(tag, c)} />
                        {editingId === tag.id ? (
                          <Input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(tag);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            maxLength={TAG_NAME_MAX}
                            className="h-7 flex-1 text-[13px]"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tag.name}</span>
                        )}
                        {editingId === tag.id ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRename(tag)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingId(tag.id);
                                setEditingName(tag.name);
                              }}
                              aria-label={`Renomear ${tag.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => askDelete(tag)}
                              aria-label={`Excluir ${tag.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ColorSwatchPicker({ color, onChange }: { color: TagColor; onChange: (c: TagColor) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={cn("h-4 w-4 rounded-full ring-1 ring-inset ring-black/10", TAG_COLOR_DOT_CLASSES[color])}
        onClick={() => setOpen((v) => !v)}
        aria-label="Escolher cor"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 grid grid-cols-4 gap-1.5 rounded-lg border border-border/70 bg-popover p-2 shadow-xl">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={TAG_COLOR_LABEL[c]}
                className={cn(
                  "h-4 w-4 rounded-full ring-1 ring-inset ring-black/10",
                  TAG_COLOR_DOT_CLASSES[c],
                  c === color && "ring-2 ring-foreground"
                )}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
