"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isSignupOpen } from "@/lib/config";
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

export async function signUp(formData: FormData): Promise<AuthResult> {
  if (!(await isSignupOpen())) {
    return { error: "O cadastro está desativado nesta instalação." };
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: error.message };
  }

  // Com confirmação de e-mail desativada no Supabase a sessão já vem criada.
  if (data.session) {
    redirect("/dashboard");
  }

  return {
    message: "Conta criada! Verifique seu e-mail para confirmar o cadastro.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
