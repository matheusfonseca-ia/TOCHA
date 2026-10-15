"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "A senha precisa de ao menos 6 caracteres."),
});

export interface AuthResult {
  error?: string;
  message?: string;
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Credenciais inválidas. Verifique e-mail e senha." };
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(formData: FormData): Promise<AuthResult> {
  const email = z.string().email("E-mail inválido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.errors[0].message };

  // Mesma resposta exista ou não a conta: não revela quem é cliente.
  await createClient().auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });
  return { message: "Se esse e-mail tiver conta, o link para redefinir a senha chega em alguns minutos." };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
