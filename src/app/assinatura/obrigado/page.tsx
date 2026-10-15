import Link from "next/link";

import { FalowMark } from "@/components/brand/falow-logo";

export const metadata = { title: "Assinatura confirmada · Falow" };

export default function ObrigadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <FalowMark className="mx-auto h-10 w-10" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Pagamento confirmado</h1>
        <p className="text-muted-foreground">
          Mandamos um e-mail para o endereço da compra com o link para você definir sua senha. Pode levar
          alguns minutos; confira também o spam.
        </p>
        <p className="text-sm text-muted-foreground">
          Já tem senha? <Link href="/login" className="underline">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
