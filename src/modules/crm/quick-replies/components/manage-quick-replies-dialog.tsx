"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { QuickReply } from "../../shared/types/conversation";
import { createQuickReply, deleteQuickReply, updateQuickReply } from "../services/quick-replies.actions";

/** Diálogo "Gerenciar respostas rápidas": criar, editar e excluir os atalhos da conta. */
export function ManageQuickRepliesDialog({
  accountId,
  replies,
  open,
  onOpenChange,
}: {
  accountId: string;
  replies: QuickReply[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditingId(null);
    setTitle("");
    setText("");
    setError(null);
  }

  function startEdit(reply: QuickReply) {
    setEditingId(reply.id);
    setTitle(reply.title);
    setText(reply.text);
    setError(null);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = editingId
      ? await updateQuickReply(editingId, title, text)
      : await createQuickReply(accountId, title, text);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    startCreate();
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusy(true);
    await deleteQuickReply(id);
    setBusy(false);
    if (editingId === id) startCreate();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Respostas rápidas</DialogTitle>
          <DialogDescription>
            Atalhos de texto para o composer: digite &quot;/&quot; na conversa para usar.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1.5">
          {replies.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">Nenhuma resposta rápida ainda.</p>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">/{r.title}</p>
                  <p className="line-clamp-1 text-[12px] text-muted-foreground">{r.text}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(r)} aria-label="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(r.id)}
                  disabled={busy}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t border-border/70 pt-3">
          <p className="text-[12px] font-medium text-muted-foreground">
            {editingId ? "Editar resposta rápida" : "Nova resposta rápida"}
          </p>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Atalho, ex.: horario"
            maxLength={40}
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Texto que vai para o composer"
            rows={3}
            maxLength={1000}
          />
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={startCreate}>
                Cancelar edição
              </Button>
            )}
            <Button type="button" onClick={handleSave} disabled={busy || !title.trim() || !text.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
