import { decryptToken, encryptToken } from "@/lib/crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";
import { refreshLongLivedToken } from "./oauth";

// Tokens do Instagram duram ~60 dias; renovamos com folga de 15 dias.
const TOKEN_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;
// Meta sem `expires_in`: assume a validade padrão do token longo (60 dias)
// em vez de gravar nulo, que desligaria a renovação para sempre.
const DEFAULT_TOKEN_TTL_S = 60 * 24 * 60 * 60;
// Renovação que falhou só é tentada de novo depois disso (por conta, no
// isolate): sem isso cada envio dentro da janela pagaria mais uma ida à Meta.
const REFRESH_RETRY_MS = 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

/** Última tentativa de renovação por conta (memória do isolate; zera a cada deploy). */
const lastRefreshAttempt = new Map<string, number>();
/** Renovação em andamento por conta: chamadas concorrentes esperam a mesma. */
const refreshInFlight = new Map<string, Promise<string>>();

/** Só para testes: esquece as tentativas anteriores. */
export function resetTokenRefreshState(): void {
  lastRefreshAttempt.clear();
  refreshInFlight.clear();
}

/** A conta não está ativa (desconectada ou expirada): o token dela não pode ser usado. */
export class AccountNotActiveError extends Error {
  constructor() {
    super("A conta do Instagram não está ativa.");
    this.name = "AccountNotActiveError";
  }
}

/** Validade gravada após uma troca/renovação; `expires_in` ausente vira o padrão de 60 dias. */
export function tokenExpiresAtFrom(expiresIn: number | null | undefined, now = Date.now()): string {
  const seconds = expiresIn && expiresIn > 0 ? expiresIn : DEFAULT_TOKEN_TTL_S;
  return new Date(now + seconds * 1000).toISOString();
}

/**
 * Token da conta, renovado automaticamente quando está perto de expirar.
 * Conta que não está ativa nunca devolve token: o @ pode já pertencer a outro
 * cliente, e o token antigo (ou a renovação dele) não pode agir em nome dele.
 * Falha na renovação não bloqueia o envio: segue com o token atual e,
 * se ele estiver de fato inválido, o erro 190 marca a conta como expirada.
 *
 * `token_expires_at` nulo (troca antiga sem `expires_in`) conta como "renovar
 * já". Uma falha só é tentada de novo após REFRESH_RETRY_MS, e chamadas
 * concorrentes no mesmo isolate compartilham a mesma renovação.
 */
export async function getFreshToken(
  admin: AdminClient,
  account: IgAccount
): Promise<string> {
  if (account.status !== "active") throw new AccountNotActiveError();

  const token = decryptToken(account.access_token_enc);
  const expiresAt = account.token_expires_at
    ? Date.parse(account.token_expires_at)
    : null;

  if (expiresAt !== null && expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) {
    return token;
  }

  const pending = refreshInFlight.get(account.id);
  if (pending) return pending;

  const lastAttempt = lastRefreshAttempt.get(account.id);
  if (lastAttempt !== undefined && Date.now() - lastAttempt < REFRESH_RETRY_MS) {
    return token;
  }
  lastRefreshAttempt.set(account.id, Date.now());

  const refresh = refreshToken(admin, account, token).finally(() => {
    refreshInFlight.delete(account.id);
  });
  refreshInFlight.set(account.id, refresh);
  return refresh;
}

async function refreshToken(
  admin: AdminClient,
  account: IgAccount,
  token: string
): Promise<string> {
  try {
    const { token: refreshed, expiresIn } = await refreshLongLivedToken(token);
    // Condicionado ao token antigo: se outra invocação (outro isolate) já
    // gravou uma renovação, esta não sobrescreve.
    const { error } = await admin
      .from("ig_accounts")
      .update({
        access_token_enc: encryptToken(refreshed),
        token_expires_at: tokenExpiresAtFrom(expiresIn),
      })
      .eq("id", account.id)
      .eq("access_token_enc", account.access_token_enc);
    if (error) {
      console.warn(
        `[token] token de @${account.ig_username} renovado, mas não foi gravado:`,
        error.message
      );
    }
    return refreshed;
  } catch (err) {
    console.warn(
      `[token] falha ao renovar token de @${account.ig_username}:`,
      err instanceof Error ? err.message : err
    );
    return token;
  }
}
