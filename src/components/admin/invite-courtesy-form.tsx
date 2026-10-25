"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { inviteWithCourtesyAction } from "@/app/admin/actions";
import { expiresAtFrom, ValidityField } from "@/components/admin/customer-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "Convidar com cortesia": reaproveita a conta se o e-mail já existe, senão convida. */
export function InviteCourtesyForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [preset, setPreset] = useState("30");
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email);
    fd.set("expiresAt", expiresAtFrom(preset, customDate));
    fd.set("reason", reason);
    startTransition(async () => {
      const result = await inviteWithCourtesyAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cortesia salva. Se a conta era nova, o convite foi enviado.");
      setEmail("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold">Convidar com cortesia</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <ValidityField
          idPrefix="invite"
          preset={preset}
          onPresetChange={setPreset}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="space-y-1.5">
          <Label htmlFor="invite-reason">Motivo</Label>
          <Input id="invite-reason" required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enviando..." : "Convidar"}
        </Button>
      </form>
    </Card>
  );
}
