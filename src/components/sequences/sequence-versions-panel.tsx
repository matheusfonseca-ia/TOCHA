"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History } from "lucide-react";

import { getSequenceVersions } from "@/app/(dashboard)/rules/sequencias/versions-actions";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SequenceConfirmDialog } from "@/components/sequences/sequence-confirm-dialog";
import type { SequenceVersion } from "@/types/sequence";

/**
 * Painel de histórico de versões do workflow: um snapshot por "Salvar" bem-
 * sucedido (`sequence_versions`, ver actions.ts). Restaurar só carrega o
 * grafo escolhido no canvas — continua exigindo clicar em "Salvar" pra
 * gravar de novo, o salvamento nunca é automático.
 */
export function SequenceVersionsPanel({
  sequenceId,
  initialVersions,
  onRestore,
}: {
  sequenceId: string;
  initialVersions: SequenceVersion[];
  /** Aplica o grafo da versão escolhida no canvas (estado local, não salva). */
  onRestore: (version: SequenceVersion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState(initialVersions);
  const [pendingVersion, setPendingVersion] = useState<SequenceVersion | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleOpen = async (value: boolean) => {
    setOpen(value);
    if (!value) return;
    setIsRefreshing(true);
    try {
      setVersions(await getSequenceVersions(sequenceId));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpen(true)}>
        <History className="h-3.5 w-3.5" />
        Histórico
      </Button>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico do workflow</DialogTitle>
            <DialogDescription>
              {isRefreshing
                ? "Carregando…"
                : versions.length === 0
                  ? "Nenhuma versão salva ainda."
                  : versions.length === 1
                    ? "1 versão salva."
                    : `Últimas ${versions.length} versões salvas, mais recentes primeiro.`}
            </DialogDescription>
          </DialogHeader>

          {versions.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhuma versão"
              description="Toda vez que você clicar em Salvar, a versão anterior fica guardada aqui."
            />
          ) : (
            <ul className="space-y-2">
              {versions.map((version, i) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {version.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(version.created_at), "dd MMM · HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                      {i === 0 && <Badge variant="muted">Mais recente</Badge>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setPendingVersion(version)}
                  >
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <SequenceConfirmDialog
        open={!!pendingVersion}
        onOpenChange={(next) => {
          if (!next) setPendingVersion(null);
        }}
        title="Restaurar esta versão?"
        description="As alterações atuais não salvas neste workflow se perdem. Depois de restaurar, clique em Salvar para gravar de vez."
        confirmLabel="Restaurar versão"
        destructive
        onConfirm={() => {
          if (pendingVersion) onRestore(pendingVersion);
          setPendingVersion(null);
          setOpen(false);
        }}
      />
    </>
  );
}
