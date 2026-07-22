import { decryptToken, encryptToken } from "@/lib/crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";
import { refreshLongLivedToken } from "./oauth";

// Tokens do Instagram duram ~60 dias; renovamos com folga de 15 dias.
const TOKEN_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Token da conta, renovado automaticamente quando está perto de expirar.
 * Falha na renovação não bloqueia o envio: segue com o token atual e,
 * se ele estiver de fato inválido, o erro 190 marca a conta como expirada.
 */
export async function getFreshToken(
  admin: AdminClient,
  account: IgAccount
): Promise<string> {
  const token = decryptToken(account.access_token_enc);
  const expiresAt = account.token_expires_at
    ? Date.parse(account.token_expires_at)
    : null;

  if (!expiresAt || expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) {
    return token;
  }

  try {
    const { token: refreshed, expiresIn } = await refreshLongLivedToken(token);
    await admin
      .from("ig_accounts")
      .update({
        access_token_enc: encryptToken(refreshed),
        token_expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
      })
      .eq("id", account.id);
    return refreshed;
  } catch (err) {
    console.warn(
      `[token] falha ao renovar token de @${account.ig_username}:`,
      err instanceof Error ? err.message : err
    );
    return token;
  }
}
