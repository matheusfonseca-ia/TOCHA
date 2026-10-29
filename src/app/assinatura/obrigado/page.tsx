import Link from "next/link";

import { FalowMark } from "@/components/brand/falow-logo";

export const metadata = { title: "Assinatura confirmada · Falow" };

export default function ObrigadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <FalowMark className="mx-auto h-10 w-10" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">Pagamento confirmado</h1>
        {/* O convite só sai para e-mail sem conta: quem já tem conta (reativação,
            cortesia) não recebe e-mail nenhum, então a página cobre os dois casos. */}
        <p className="text-muted-foreground">
          <strong>Já tem conta no Falow?</strong> Basta entrar com o seu e-mail e senha de sempre: a assinatura
          já vale para ela.
        </p>
        <p className="text-muted-foreground">
          <strong>Primeira vez?</strong> Mandamos um e-mail para o endereço da compra com o link para você
          definir sua senha. Pode levar alguns minutos; confira também o spam.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline">Entrar</Link> (se esqueceu a senha, peça um novo link na
          tela de entrar)
        </p>
      </div>
    </main>
  );
}
