"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "A senha precisa de ao menos 6 caracteres."),
});

export interface AuthResult {
  error?: string;
  message?: string;
}

const TOO_MANY_ATTEMPTS = "Muitas tentativas com esse e-mail. Espere um minuto e tente de novo.";

/*
 * Limite de tentativas em duas camadas. Por IP: regra de Rate Limiting do WAF
 * da Cloudflare em /sistema/login* e /sistema/definir-senha* (o Supabase Auth
 * só enxerga o IP de saída da Cloudflare, o mesmo para todo mundo, então os
 * limites dele não servem por pessoa). Por e-mail: `allowAuthAttempt`, com o
 * Rate Limiting nativo do Workers, que pega quem testa senhas de vários IPs.
 */
export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  if (!(await allowAuthAttempt("login", parsed.data.email))) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Credenciais inválidas. Verifique e-mail e senha." };
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(formData: FormData): Promise<AuthResult> {
  const email = z.string().email("E-mail inválido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0].message };

  // Mesma resposta exista ou não a conta: não revela quem é cliente. Estourou o
  // limite: não envia, mas responde igual (não ajuda a medir o limitador).
  const message = "Se esse e-mail tiver conta, o link para redefinir a senha chega em alguns minutos.";
  if (!(await allowAuthAttempt("reset", email.data))) return { message };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });
  return { message };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
