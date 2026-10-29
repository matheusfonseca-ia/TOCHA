"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Cadastro e confirmação do segundo fator (TOTP) dos admins. Únicas actions do
 * /admin que aceitam sessão só de senha (aal1): é por aqui que ela sobe para
 * aal2. Todas começam por guarded(), que confere se é admin.
 */

export type MfaEnrollResult = { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: string };
export type MfaVerifyResult = { ok: false; error: string };

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Digite os 6 números do aplicativo autenticador.");
const factorSchema = z.guid().optional();

async function guarded<T>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    await requireAdmin({ allowAal1: true });
  } catch (err) {
    if (err instanceof AdminRequiredError) return { ok: false, error: err.message };
    throw err;
  }
  return run();
}

/** Começa o cadastro: só para admin sem fator verificado (trocar de fator exige aal2 no Supabase). */
export async function startMfaEnrollment(): Promise<MfaEnrollResult> {
  return guarded(async () => {
    const supabase = await createClient();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return { ok: false, error: "Não foi possível ler seus fatores. Tente de novo." };
    if (factors.totp.length > 0) return { ok: false, error: "Você já tem um aplicativo autenticador cadastrado." };

    // Cadastro anterior abandonado (QR gerado e nunca confirmado) bloquearia o novo.
    for (const factor of factors.all) {
      if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Falow admin" });
    if (error || !data) return { ok: false, error: "Não foi possível começar o cadastro. Tente de novo." };
    return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  });
}

/**
 * Confere o código: confirma o cadastro (factorId do enroll) ou, para quem já
 * tem fator, sobe a sessão para aal2. Deu certo, volta para o /admin.
 */
export async function verifyMfaCode(formData: FormData): Promise<MfaVerifyResult> {
  return guarded(async () => {
    const code = codeSchema.safeParse(formData.get("code"));
    if (!code.success) return { ok: false, error: code.error.issues[0].message };
    const requested = factorSchema.safeParse(formData.get("factorId") || undefined);
    if (!requested.success) return { ok: false, error: "Cadastro inválido. Recarregue a página." };

    const supabase = await createClient();
    let factorId = requested.data;
    if (!factorId) {
      const { data: factors, error } = await supabase.auth.mfa.listFactors();
      if (error) return { ok: false, error: "Não foi possível ler seus fatores. Tente de novo." };
      factorId = factors.totp[0]?.id;
      if (!factorId) return { ok: false, error: "Nenhum aplicativo autenticador cadastrado." };
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
    if (error) return { ok: false, error: "Código inválido ou vencido. Confira o relógio do celular e tente de novo." };

    redirect("/admin");
  });
}
