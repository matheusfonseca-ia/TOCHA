"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extendExpiry, type ExpiryKind } from "@/lib/expiry/actions";
import {
  expiryFormFrom,
  resolveExpiryForm,
  type ExpiryFormValue,
} from "@/lib/expiry/expiry";

import { ExpiryField } from "./expiry-field";

export interface ExpiryTarget {
  id: string;
  name: string;
  expires_at?: string | null;
  expire_action?: "delete" | "pause";
}

/**
 * "Estender expiração" (ou "Tornar temporária", quando ainda é permanente)
 * nas listas de automações e workflows. Desligar o switch torna permanente.
 */
export function ExpiryDialog({
  kind,
  target,
  onClose,
  loadUsage,
}: {
  kind: ExpiryKind;
  target: ExpiryTarget | null;
  onClose: () => void;
  /** Workflows que usam o item (só automações): aviso ao escolher "Excluir". */
  loadUsage?: (id: string) => Promise<string[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<ExpiryFormValue>(() =>
    expiryFormFrom(null, null)
  );
  const [usage, setUsage] = useState<string[]>([]);

  useEffect(() => {
    if (!target) return;
    const initial = expiryFormFrom(target.expires_at, target.expire_action);
    // Sem expiração ainda: abrir o diálogo já é a intenção de torná-la temporária.
    setValue(initial.enabled ? initial : { ...initial, enabled: true });

    setUsage([]);
    if (!loadUsage) return;
    let stale = false;
    loadUsage(target.id)
      .catch(() => [] as string[])
      .then((names) => {
        if (!stale) setUsage(names);
      });
    return () => {
      stale = true;
    };
  }, [target, loadUsage]);

  const isRule = kind === "rule";

  function handleSave() {
    if (!target) return;
    const resolved = resolveExpiryForm(value);
    if (resolved.error) {
      toast.error(resolved.error);
      return;
    }
    startTransition(async () => {
      const result = await extendExpiry(
        kind,
        target.id,
        resolved.expires_at,
        resolved.expire_action
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const saved =
        resolved.expires_at === null
          ? "Expiração removida. Agora é permanente."
          : "Expiração salva.";
      const reactivated = result.reactivated
        ? isRule
          ? " A automação voltou a ficar ativa."
          : " O workflow voltou a ficar ativo."
        : "";
      toast.success(saved + reactivated);
      onClose();
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.expires_at
              ? "Estender expiração"
              : isRule
                ? "Tornar temporária"
                : "Tornar temporário"}
          </DialogTitle>
          <DialogDescription>
            Escolha até quando {isRule ? "a automação" : "o workflow"}{" "}
            &ldquo;{target?.name}&rdquo; fica no ar. Desligue a opção para{" "}
            {isRule ? "torná-la" : "torná-lo"} permanente.
          </DialogDescription>
        </DialogHeader>

        <ExpiryField
          value={value}
          onChange={setValue}
          label={isRule ? "Automação temporária" : "Workflow temporário"}
          description={
            isRule
              ? "Se estiver pausada pela expiração, volta a ficar ativa."
              : "Se estiver pausado pela expiração, volta a ficar ativo."
          }
          usedInWorkflows={usage}
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
