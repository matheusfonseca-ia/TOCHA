"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    token_hash: z.string().min(1, "Link inválido. Peça um novo."),
    type: z.enum(["invite", "recovery"], { errorMap: () => ({ message: "Link inválido. Peça um novo." }) }),
    password: z.string().min(8, "A senha precisa de ao menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não batem.", path: ["confirm"] });

/**
 * O token do e-mail só é validado aqui, no envio do formulário: antivírus e
 * leitores de e-mail abrem links sozinhos (GET) e gastariam o token se a
 * página validasse ao carregar.
 */
export async function setPassword(formData: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: parsed.data.type,
    token_hash: parsed.data.token_hash,
  });
  if (otpError) {
    return { error: "O link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\" na tela de login." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível salvar a senha. Tente de novo." };

  redirect("/dashboard");
}
