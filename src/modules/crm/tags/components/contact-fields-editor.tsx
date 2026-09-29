"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD_KEY_MAX, isValidFieldKey, toFieldKey } from "@/lib/sequences/fields";

import { deleteContactField, saveContactField } from "../services/contact-fields.actions";

interface FieldRow {
  key: string;
  value: string;
}

/**
 * "Dados coletados" da ficha: editar o valor, adicionar um campo novo (chave
 * validada como nos nós Coletar dado / Definir campo) e remover. Otimista,
 * com rollback em erro.
 */
export function ContactFieldsEditor({
  accountId,
  senderId,
  fields,
}: {
  accountId: string;
  senderId: string;
  fields: [string, unknown][];
}) {
  const [rows, setRows] = useState<FieldRow[]>(fields.map(([key, value]) => ({ key, value: String(value ?? "") })));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  async function commitValue(key: string) {
    const previous = rows;
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value: editingValue } : r)));
    setEditingKey(null);
    const result = await saveContactField(accountId, senderId, null, key, editingValue);
    if (result.error) {
      setRows(previous);
      toast.error(result.error);
    }
  }

  async function remove(key: string) {
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.key !== key));
    await deleteContactField(accountId, senderId, key).then((result) => {
      if (result.error) {
        setRows(previous);
        toast.error(result.error);
      }
    });
  }

  async function addField() {
    const key = toFieldKey(newKey);
    if (!isValidFieldKey(key)) {
      toast.error("Nome do campo inválido: use letras minúsculas, números e _ (até 40).");
      return;
    }
    if (rows.some((r) => r.key === key)) {
      toast.error("Já existe um campo com esse nome.");
      return;
    }
    const result = await saveContactField(accountId, senderId, null, key, newValue);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRows((prev) => [...prev, { key, value: newValue }]);
    setNewKey("");
    setNewValue("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && !adding ? (
        <p className="text-[13px] text-muted-foreground/80">Nenhum dado coletado pelos workflows</p>
      ) : (
        <dl className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="group text-[13px]">
              <dt className="text-[12px] text-muted-foreground">{row.key}</dt>
              {editingKey === row.key ? (
                <div className="mt-0.5 flex items-center gap-1">
                  <Input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitValue(row.key);
                      if (e.key === "Escape") setEditingKey(null);
                    }}
                    className="h-7 text-[13px]"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => commitValue(row.key)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingKey(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <dd className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 break-words font-medium">
                    {row.value || <span className="font-normal italic text-muted-foreground/70">vazio</span>}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    onClick={() => {
                      setEditingKey(row.key);
                      setEditingValue(row.value);
                    }}
                    aria-label={`Editar ${row.key}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={() => remove(row.key)}
                    aria-label={`Remover ${row.key}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}

      {adding ? (
        <div className="space-y-1.5 rounded-lg border border-border/70 p-2">
          <Input
            autoFocus
            placeholder="nome_do_campo"
            value={newKey}
            onChange={(e) => setNewKey(toFieldKey(e.target.value))}
            maxLength={FIELD_KEY_MAX}
            className="h-7 font-mono text-[12px]"
          />
          <Input
            placeholder="valor"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="h-7 text-[13px]"
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7" onClick={addField} disabled={!newKey}>
              Adicionar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar campo
        </Button>
      )}
    </div>
  );
}
