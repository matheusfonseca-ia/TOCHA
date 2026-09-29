"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { fullDateTime } from "../../inbox/utils/time";
import type { CrmNote } from "../../shared/types/conversation";
import { createNote, deleteNote, updateNote } from "../services/notes.actions";

/** Notas internas do lead, na ficha lateral. Nunca vão para o Instagram. */
export function NotesPanel({
  accountId,
  igSenderId,
  notes,
}: {
  accountId: string;
  igSenderId: string;
  notes: CrmNote[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (!draft.trim()) return;
    setBusy(true);
    const result = await createNote(accountId, igSenderId, draft);
    setBusy(false);
    if ("ok" in result) {
      setDraft("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {notes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/80">Nenhuma nota ainda</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} />
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escrever uma nota interna (não vai para o Instagram)"
          rows={2}
          maxLength={2000}
          className="text-[13px]"
        />
        <Button size="sm" className="h-7 gap-1 text-[12px]" onClick={handleAdd} disabled={busy || !draft.trim()}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar nota
        </Button>
      </div>
    </div>
  );
}

function NoteItem({ note }: { note: CrmNote }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setBusy(true);
    const result = await updateNote(note.id, text);
    setBusy(false);
    if ("ok" in result) {
      setEditing(false);
      router.refresh();
    }
  }

  async function handleDelete() {
    setBusy(true);
    await deleteNote(note.id);
    setBusy(false);
    router.refresh();
  }

  if (editing) {
    return (
      <li className="space-y-1.5 rounded-lg border border-border/70 bg-secondary/30 p-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} className="text-[13px]" />
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)} aria-label="Cancelar">
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" className="h-6 w-6" onClick={handleSave} disabled={busy} aria-label="Salvar">
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-lg border border-border/70 bg-secondary/30 p-2 text-[13px]">
      <p className="whitespace-pre-wrap break-words">{note.text}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <time className="text-[11px] text-muted-foreground" suppressHydrationWarning>
          {fullDateTime(note.created_at)}
        </time>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(true)} aria-label="Editar nota">
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={busy}
            aria-label="Excluir nota"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </li>
  );
}
