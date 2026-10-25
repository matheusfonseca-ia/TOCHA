"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setPassword } from "./actions";

export function SetPasswordForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [isPending, startTransition] = useTransition();
  // O servidor marca `sessionReady` quando já gastou o token e só recusou a senha:
  // a sessão está aberta e o link não serve mais. Daí em diante a tela deixa de
  // mandar o token e a próxima tentativa salva a senha pela sessão.
  const [sessionReady, setSessionReady] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await setPassword(formData);
      if (result?.sessionReady) setSessionReady(true);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Defina sua senha</h1>
        {!sessionReady && (
          <>
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repita a senha</Label>
          <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar e entrar"}
        </Button>
      </form>
    </main>
  );
}
