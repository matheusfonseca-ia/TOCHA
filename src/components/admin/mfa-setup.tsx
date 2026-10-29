"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { startMfaEnrollment, verifyMfaCode } from "@/app/admin/mfa/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MfaMode = "active" | "verify" | "enroll";

type Enrollment = { factorId: string; qrCode: string; secret: string };

/** Cadastro (QR + código) ou confirmação do código do aplicativo autenticador. */
export function MfaSetup({ mode }: { mode: MfaMode }) {
  const [isPending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");

  if (mode === "active") {
    return (
      <Card className="max-w-md p-5 text-sm">
        Segundo fator ativo nesta sessão. Para trocar de aplicativo, fale com o dono da instalação.
      </Card>
    );
  }

  function begin() {
    startTransition(async () => {
      const result = await startMfaEnrollment();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEnrollment({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("code", code);
    if (enrollment) fd.set("factorId", enrollment.factorId);
    startTransition(async () => {
      // Deu certo: a action redireciona para /admin.
      const result = await verifyMfaCode(fd);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  if (mode === "enroll" && !enrollment) {
    return (
      <Card className="max-w-md space-y-4 p-5 text-sm">
        <p>Você ainda não tem um aplicativo autenticador cadastrado (Google Authenticator, 1Password, Authy...).</p>
        <Button onClick={begin} disabled={isPending}>
          {isPending ? "Gerando..." : "Cadastrar aplicativo"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-md space-y-4 p-5 text-sm">
      {enrollment && (
        <div className="space-y-3">
          <p>Leia o QR code no aplicativo autenticador e digite o código que aparecer.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG em data URI gerado pelo Supabase */}
          <img src={enrollment.qrCode} alt="QR code do segundo fator" className="h-48 w-48 rounded bg-white p-2" />
          <p className="text-xs text-muted-foreground">
            Sem câmera? Digite esta chave no aplicativo: <code className="break-all">{enrollment.secret}</code>
          </p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">Código de 6 números</Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Conferindo..." : "Confirmar"}
        </Button>
      </form>
    </Card>
  );
}
