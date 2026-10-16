"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  blockUserAction,
  grantCourtesyAction,
  resendAccessAction,
  revokeCourtesyAction,
  unblockUserAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Result = { ok: true } | { ok: false; error: string };

/** Validade da cortesia: 30/90/365 dias ou uma data escolhida. */
export function ValidityField({
  preset,
  onPresetChange,
  customDate,
  onCustomDateChange,
  idPrefix,
}: {
  preset: string;
  onPresetChange: (v: string) => void;
  customDate: string;
  onCustomDateChange: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-validity`}>Validade</Label>
      <Select value={preset} onValueChange={onPresetChange}>
        <SelectTrigger id={`${idPrefix}-validity`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">30 dias</SelectItem>
          <SelectItem value="90">90 dias</SelectItem>
          <SelectItem value="365">365 dias</SelectItem>
          <SelectItem value="date">Escolher data</SelectItem>
        </SelectContent>
      </Select>
      {preset === "date" && (
        <Input type="date" value={customDate} onChange={(e) => onCustomDateChange(e.target.value)} aria-label="Data de validade" />
      )}
    </div>
  );
}

/** ISO da validade. Data escolhida vale até o fim do dia em São Paulo. */
export function expiresAtFrom(preset: string, customDate: string): string {
  if (preset === "date") return customDate ? `${customDate}T23:59:59-03:00` : "";
  return new Date(Date.now() + Number(preset) * 86_400_000).toISOString();
}

export function CustomerActions({
  userId,
  email,
  grantKind,
  hasSubscription,
}: {
  userId: string;
  email: string;
  grantKind: "courtesy" | "block" | null;
  hasSubscription: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"courtesy" | "block" | null>(null);
  const [preset, setPreset] = useState("30");
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");

  function run(action: () => Promise<Result>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setDialog(null);
      setReason("");
      router.refresh();
    });
  }

  function open(kind: "courtesy" | "block") {
    setReason("");
    setPreset("30");
    setCustomDate("");
    setDialog(kind);
  }

  function submitCourtesy() {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("expiresAt", expiresAtFrom(preset, customDate));
    fd.set("reason", reason);
    run(() => grantCourtesyAction(fd), "Cortesia salva.");
  }

  function submitBlock() {
    if (!window.confirm(`Bloquear ${email}? O cliente perde o acesso na hora.`)) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("reason", reason);
    run(() => blockUserAction(fd), "Cliente bloqueado.");
  }

  function revoke() {
    if (!window.confirm(`Remover a cortesia de ${email}?`)) return;
    run(() => revokeCourtesyAction(userId), "Cortesia removida.");
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {grantKind !== "block" && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => open("courtesy")}>
          Dar cortesia
        </Button>
      )}
      {grantKind === "courtesy" && (
        <Button size="sm" variant="outline" disabled={isPending} onClick={revoke}>
          Remover cortesia
        </Button>
      )}
      {grantKind === "block" ? (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => unblockUserAction(userId), "Cliente desbloqueado.")}>
          Desbloquear
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => open("block")}>
          Bloquear
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => resendAccessAction(userId), "E-mail de acesso enviado.")}>
        Reenviar acesso
      </Button>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialog === "block" ? "Bloquear cliente" : "Dar cortesia"}</DialogTitle>
            <DialogDescription>{email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-left">
            {dialog === "courtesy" && (
              <ValidityField
                idPrefix={`c-${userId}`}
                preset={preset}
                onPresetChange={setPreset}
                customDate={customDate}
                onCustomDateChange={setCustomDate}
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${userId}`}>Motivo</Label>
              <Input id={`reason-${userId}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </div>
            {dialog === "block" && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Se o cliente paga, cancele também na Stripe.
                {hasSubscription ? " Este cliente tem assinatura." : ""}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            {dialog === "block" ? (
              <Button variant="destructive" disabled={isPending} onClick={submitBlock}>
                Bloquear
              </Button>
            ) : (
              <Button disabled={isPending} onClick={submitCourtesy}>
                Salvar cortesia
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
