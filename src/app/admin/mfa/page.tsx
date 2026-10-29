import { notFound } from "next/navigation";

import { MfaSetup, type MfaMode } from "@/components/admin/mfa-setup";
import { PageHeader } from "@/components/layout/page-header";
import { adminMfaRequiredByEnv } from "@/lib/admin/mfa";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Segundo fator do admin. Abre com sessão só de senha (aal1): é a única tela
 * do /admin que o middleware deixa passar antes do código.
 */
export default async function AdminMfaPage() {
  try {
    await requireAdmin({ allowAal1: true });
  } catch {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  const hasFactor = (factors?.totp.length ?? 0) > 0;
  const mode: MfaMode = aal?.currentLevel === "aal2" ? "active" : hasFactor ? "verify" : "enroll";

  return (
    <>
      <PageHeader
        title="Segundo fator"
        description={
          adminMfaRequiredByEnv()
            ? "Obrigatório para usar o admin: código de um aplicativo autenticador além da senha."
            : "Código de um aplicativo autenticador além da senha. Depois de cadastrado, o admin passa a pedir o código."
        }
      />
      <MfaSetup mode={mode} />
    </>
  );
}
