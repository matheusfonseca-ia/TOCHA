"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  createStageAction,
  deleteStageAction,
  reorderStagesAction,
  toggleAutoEnrollAction,
  updateStageAction,
} from "../services/pipeline.actions";
import type { Pipeline, PipelineStage, StageType } from "../types";

const STAGE_TYPE_LABEL: Record<StageType, string> = { open: "Aberta", won: "Ganho", lost: "Perdido" };
const PALETTE = ["#3b82f6", "#a855f7", "#f59e0b", "#22c55e", "#ef4444", "#14b8a6", "#ec4899"];

export function StageSettingsDialog({
  pipeline,
  stages,
  sequences,
}: {
  pipeline: Pipeline;
  stages: PipelineStage[];
  sequences: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<PipelineStage | null>(null);
  const [destination, setDestination] = useState("");

  const refresh = () => startTransition(() => router.refresh());

  async function handlePatch(stageId: string, patch: Parameters<typeof updateStageAction>[1]) {
    const res = await updateStageAction(stageId, patch);
    if (res.error) toast.error(res.error);
    else refresh();
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    const res = await createStageAction(pipeline.id, { name: newName, color: PALETTE[stages.length % PALETTE.length], stageType: "open" });
    if (res.error) toast.error(res.error);
    else {
      setNewName("");
      refresh();
    }
  }

  async function handleMove(index: number, dir: -1 | 1) {
    const order = [...stages].sort((a, b) => a.position - b.position).map((s) => s.id);
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    const res = await reorderStagesAction(pipeline.id, order);
    if (res.error) toast.error(res.error);
    else refresh();
  }

  async function confirmDelete() {
    if (!deleting || !destination) return;
    const res = await deleteStageAction(deleting.id, destination);
    if (res.error) toast.error(res.error);
    else {
      setDeleting(null);
      setDestination("");
      refresh();
    }
  }

  const ordered = [...stages].sort((a, b) => a.position - b.position);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Etapas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Etapas do funil</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
          <div>
            <p className="text-[13px] font-medium">Entrada automática</p>
            <p className="text-[12px] text-muted-foreground">Quem manda a 1ª DM entra sozinho na 1ª etapa aberta.</p>
          </div>
          <Switch
            checked={pipeline.auto_enroll}
            onCheckedChange={(v) => toggleAutoEnrollAction(pipeline.id, v).then((r) => (r.error ? toast.error(r.error) : refresh()))}
          />
        </div>

        <div className="max-h-[360px] space-y-2 overflow-y-auto py-1">
          {ordered.map((stage, i) => (
            <div key={stage.id} className="space-y-2 rounded-lg border border-border/70 p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${c}`}
                      className="h-5 w-5 rounded-full ring-offset-1"
                      style={{ backgroundColor: c, outline: stage.color === c ? "2px solid currentColor" : undefined }}
                      onClick={() => handlePatch(stage.id, { color: c })}
                    />
                  ))}
                </div>
                <Input
                  defaultValue={stage.name}
                  className="h-8 flex-1 text-[13px]"
                  onBlur={(e) => e.target.value.trim() !== stage.name && handlePatch(stage.id, { name: e.target.value })}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => handleMove(i, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === ordered.length - 1} onClick={() => handleMove(i, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(stage)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={stage.stage_type} onValueChange={(v) => handlePatch(stage.id, { stageType: v as StageType })}>
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STAGE_TYPE_LABEL) as StageType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {STAGE_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={stage.on_enter_sequence_id ?? "none"}
                  onValueChange={(v) => handlePatch(stage.id, { onEnterSequenceId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue placeholder="Ao entrar, iniciar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem workflow ao entrar</SelectItem>
                    {sequences.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {deleting?.id === stage.id && (
                <div className="space-y-2 rounded-md bg-secondary/50 p-2">
                  <p className="text-[12px]">Mover os leads desta etapa para:</p>
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger className="h-8 text-[12px]">
                      <SelectValue placeholder="Escolha a etapa de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {ordered.filter((s) => s.id !== stage.id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                      Cancelar
                    </Button>
                    <Button variant="destructive" size="sm" disabled={!destination} onClick={confirmDelete}>
                      Excluir etapa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center gap-2 sm:justify-start">
          <Label htmlFor="new-stage" className="sr-only">
            Nova etapa
          </Label>
          <Input
            id="new-stage"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da nova etapa"
            className="h-9 flex-1 text-[13px]"
          />
          <Button size="sm" className="gap-1.5" disabled={isPending} onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
