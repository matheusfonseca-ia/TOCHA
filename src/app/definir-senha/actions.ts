"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const INVALID_LINK = "Link inválido. Peça um novo.";
const LINK_EXPIRED = "O link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\" na tela de login.";
const SESSION_EXPIRED = "Sua sessão expirou. Peça um novo link em \"Esqueci minha senha\" na tela de login.";

/**
 * `token_hash` e `type` vêm do link do e-mail e andam juntos. Só ficam AUSENTES
 * (campo nem enviado) na retentativa: o `verifyOtp` já gastou o token, o
 * `updateUser` recusou a senha e a tela passou a omitir os dois campos. Presente
 * e vazio (tela aberta sem token no link) segue sendo link inválido — nunca vira
 * retentativa, senão qualquer um logado trocaria a senha por uma tela sem link.
 */
const schema = z
  .object({
    token_hash: z.string().min(1, INVALID_LINK).optional(),
    type: z.enum(["invite", "recovery"], { errorMap: () => ({ message: INVALID_LINK }) }).optional(),
    password: z.string().min(8, "A senha precisa de ao menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.token_hash === undefined || v.type !== undefined, { message: INVALID_LINK, path: ["type"] })
  .refine((v) => v.password === v.confirm, { message: "As senhas não batem.", path: ["confirm"] })
  .transform(({ token_hash, type, password }) => ({
    password,
    // Com token_hash o refine acima já garantiu o `type`.
    otp: token_hash !== undefined && type !== undefined ? { token_hash, type } : null,
  }));

/** Recusa do `updateUser` em português, pelo `code` do Supabase Auth. */
function passwordErrorMessage(code: string | undefined): string {
  switch (code) {
    case "weak_password":
      return "Essa senha é fraca demais para esta conta. Escolha uma mais longa e difícil de adivinhar.";
    case "same_password":
      return "Escolha uma senha diferente da que você já tinha.";
    default:
      return "Não foi possível salvar a senha. Tente de novo.";
  }
}

/**
 * O token do e-mail só é validado aqui, no envio do formulário: antivírus e
 * leitores de e-mail abrem links sozinhos (GET) e gastariam o token se a
 * página validasse ao carregar. A senha também é conferida antes de qualquer
 * chamada ao Supabase, para um erro de digitação não gastar o token.
 *
 * O `verifyOtp` gasta o token e abre a sessão; se o `updateUser` recusar a
 * senha, o link não serve mais, mas a sessão continua aberta. Por isso a
 * recusa volta com `sessionReady`: a tela passa a enviar a próxima tentativa
 * sem token e a senha nova é salva pela sessão. Link rejeitado nunca cai na
 * sessão — quem já estiver logado no navegador não troca a própria senha por
 * um link vencido.
 */
export async function setPassword(formData: FormData): Promise<{ error?: string; sessionReady?: boolean }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { otp, password } = parsed.data;

  const supabase = createClient();

  if (otp) {
    const { error: otpError } = await supabase.auth.verifyOtp(otp);
    if (otpError) return { error: LINK_EXPIRED };
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: SESSION_EXPIRED };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: passwordErrorMessage(error.code), sessionReady: true };

  redirect("/dashboard");
}
