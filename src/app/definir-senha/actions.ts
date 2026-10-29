"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withBasePath } from "@/lib/app-url";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

const INVALID_LINK = "Link inválido. Peça um novo.";
const LINK_EXPIRED = "O link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\" na tela de login.";
const SESSION_EXPIRED = "Sua sessão expirou. Peça um novo link em \"Esqueci minha senha\" na tela de login.";

/**
 * Marca curta da retentativa: só quem acabou de gastar um link (verifyOtp)
 * neste navegador pode tentar de novo sem o link. Sem ela, qualquer sessão
 * aberta (cookie roubado, computador emprestado) trocaria a senha sem saber a
 * atual. Cifrada com AES-GCM (não dá para forjar nem trocar o usuário),
 * httpOnly e válida por 10 minutos.
 */
const RETRY_COOKIE = "falow_pwd_retry";
const RETRY_TTL_SECONDS = 10 * 60;

function retryCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: withBasePath("/definir-senha"),
    maxAge,
  };
}

async function markRetry(userId: string, now = Date.now()): Promise<void> {
  try {
    const value = encryptToken(JSON.stringify({ uid: userId, exp: now + RETRY_TTL_SECONDS * 1000 }));
    (await cookies()).set(RETRY_COOKIE, value, retryCookieOptions(RETRY_TTL_SECONDS));
  } catch (err) {
    // Sem TOKEN_ENCRYPTION_KEY não há marca: a retentativa pede um link novo.
    console.error("[definir-senha] não foi possível marcar a retentativa:", err instanceof Error ? err.message : err);
  }
}

async function hasRetryMark(userId: string, now = Date.now()): Promise<boolean> {
  const raw = (await cookies()).get(RETRY_COOKIE)?.value;
  if (!raw) return false;
  try {
    const mark = JSON.parse(decryptToken(raw)) as { uid?: unknown; exp?: unknown };
    return mark.uid === userId && typeof mark.exp === "number" && mark.exp > now;
  } catch {
    return false;
  }
}

async function clearRetryMark(): Promise<void> {
  (await cookies()).set(RETRY_COOKIE, "", retryCookieOptions(0));
}

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
    type: z.enum(["invite", "recovery"], { error: INVALID_LINK }).optional(),
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
 * recusa volta com `sessionReady` e grava a marca curta da retentativa: a
 * tela passa a enviar a próxima tentativa sem token e a senha nova é salva
 * pela sessão, desde que a marca ainda valha para este usuário. Sessão sem
 * marca nunca troca senha por aqui. Link rejeitado nunca cai na sessão —
 * quem já estiver logado no navegador não troca a própria senha por um link
 * vencido.
 *
 * Senha trocada: as outras sessões do usuário são encerradas (quem tinha a
 * senha antiga ou um cookie roubado sai).
 */
export async function setPassword(formData: FormData): Promise<{ error?: string; sessionReady?: boolean }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { otp, password } = parsed.data;

  const supabase = await createClient();

  let userId: string | null = null;
  if (otp) {
    const { data, error: otpError } = await supabase.auth.verifyOtp(otp);
    if (otpError) return { error: LINK_EXPIRED };
    userId = data?.user?.id ?? null;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await hasRetryMark(user.id))) return { error: SESSION_EXPIRED };
    userId = user.id;
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (userId) await markRetry(userId);
    return { error: passwordErrorMessage(error.code), sessionReady: true };
  }

  await clearRetryMark();
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    console.error("[definir-senha] senha trocada, mas as outras sessões não foram encerradas:", signOutError.message);
  }

  redirect("/dashboard");
}
