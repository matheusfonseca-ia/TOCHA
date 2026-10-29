import { accessGrantOf, isAccessStatus, isAdmin, isCourtesyValid, type QueryClient } from "@/lib/billing/access";
import { PURGE_AFTER_DAYS } from "@/lib/billing/stripe-events";
import type { AccessGrant, Subscription } from "@/types/database";

/**
 * Exclusão LGPD: 30 dias depois do cancelamento, apaga os arquivos do
 * `crm-uploads` e o usuário do Auth. O `on delete cascade` a partir de
 * auth.users → ig_accounts leva contatos, conversas, tokens e o resto.
 * Reconfere o status na hora: quem reativou não é apagado.
 *
 * Também, no mesmo cron diário:
 * - anonimiza o e-mail do usuário apagado em `admin_audit_log.details` (a
 *   tabela não tem FK, então o cascade não a alcança);
 * - desliga as contas do Instagram (status `disconnected` + token apagado) de
 *   quem está sem acesso há mais de PURGE_AFTER_DAYS por um caminho que o purge
 *   acima não cobre (bloqueio, cortesia vencida, assinatura incomplete/unpaid/
 *   paused). Libera o @ para outro cliente e não guarda token sem uso;
 * - apaga `stripe_events` com mais de 30 dias (a Stripe não reentrega depois).
 */
export interface PurgeDeps {
  admin: QueryClient;
  removeUploads(accountId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  now?: () => Date;
}

const DAY_MS = 86_400_000;
const STRIPE_EVENTS_RETENTION_DAYS = 30;

export async function purgeExpiredUsers(
  deps: PurgeDeps
): Promise<{ purged: string[]; released: string[] }> {
  // "Nunca apagar o dono" depende desta variável: sem ela isOwner() é sempre
  // false, e uma assinatura de teste do próprio dono seria apagada em 30 dias.
  // Mesmo valor (já com trim) que isOwner() usa, senão o guard passa e o dono não é reconhecido.
  const owner = process.env.FALOW_OWNER_USER_ID?.trim();
  if (!owner) {
    throw new Error("FALOW_OWNER_USER_ID não configurado: o purge se recusa a rodar.");
  }
  const now = (deps.now ?? (() => new Date()))();
  // Só `canceled` é apagado (incomplete/unpaid/paused nunca agendam purge). O
  // `.neq` é a segunda camada de proteção do dono, além do isAdmin() por linha.
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, status, purge_after")
    .eq("status", "canceled")
    .neq("user_id", owner)
    .lt("purge_after", now.toISOString());
  const rows = (data ?? []) as { user_id: string; status: string; purge_after: string | null }[];

  const purged: string[] = [];
  for (const row of rows) {
    if (!row.purge_after || isAdmin(row.user_id) || isAccessStatus(row.status)) continue;
    try {
      // Releitura logo antes do que não tem volta: um webhook de reativação pode
      // ter chegado depois do select acima. Qualquer dúvida (inclusive erro) = pula.
      const { data: current, error: rereadError } = await deps.admin
        .from("subscriptions")
        .select("status, purge_after")
        .eq("user_id", row.user_id)
        .maybeSingle();
      const fresh = current as { status?: string; purge_after?: string | null } | null;
      // Date (não comparação de string): o Postgres devolve o timestamptz em outro formato; NaN também pula.
      if (rereadError || !fresh || fresh.status !== "canceled" || !fresh.purge_after || !(new Date(fresh.purge_after) < now)) continue;

      // Admin e cortesia válida nunca são apagados (bloqueio + canceled segue o purge normal).
      // Erro ao ler a cortesia = dúvida = pula. Com a assinatura relida como
      // `canceled`, sem admin e sem cortesia válida, o acesso já é negado: não
      // precisa de hasActiveAccess (que releria grant e assinatura de novo).
      const { grant, error: grantError } = await accessGrantOf(deps.admin, row.user_id);
      if (grantError) continue;
      if (isCourtesyValid(grant, now)) continue;

      const { data: accounts } = await deps.admin.from("ig_accounts").select("id").eq("user_id", row.user_id);
      for (const account of (accounts ?? []) as { id: string }[]) await deps.removeUploads(account.id);
      await anonymizeAuditLog(deps.admin, row.user_id);
      await deps.deleteUser(row.user_id);
      purged.push(row.user_id);
    } catch (err) {
      console.error(`[purge] ${row.user_id} falhou:`, err instanceof Error ? err.message : err);
    }
  }

  const released = await releaseInactiveAccounts(deps.admin, now, new Set(purged));
  await cleanupStripeEvents(deps.admin, now);
  return { purged, released };
}

/**
 * Tira o e-mail (dado pessoal direto) dos registros de auditoria do usuário
 * que vai ser apagado. O registro em si fica (quem fez o quê e quando), só
 * com o UUID. Falha lança: o usuário não é apagado e o purge tenta amanhã.
 */
async function anonymizeAuditLog(admin: QueryClient, userId: string): Promise<void> {
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("id, details")
    .eq("target_user_id", userId);
  if (error) throw new Error(`admin_audit_log: ${error.message}`);
  for (const entry of (data ?? []) as { id: number; details: Record<string, unknown> | null }[]) {
    if (!entry.details || !("email" in entry.details)) continue;
    const { error: updateError } = await admin
      .from("admin_audit_log")
      .update({ details: { ...entry.details, email: "removido (exclusão LGPD)" } })
      .eq("id", entry.id);
    if (updateError) throw new Error(`admin_audit_log: ${updateError.message}`);
  }
}

/**
 * Momento em que o usuário perdeu o acesso, ou nulo quando ainda tem acesso
 * (ou não dá para saber). Usa só datas que o banco já guarda: criação do
 * bloqueio, fim da cortesia e a última mudança da assinatura.
 */
function accessLostAt(
  grant: AccessGrant | null,
  sub: Pick<Subscription, "status" | "updated_at" | "canceled_at"> | null,
  now: Date
): Date | null {
  if (grant?.kind !== "block") {
    if (isCourtesyValid(grant, now)) return null;
    if (sub && isAccessStatus(sub.status)) return null;
  }
  const marks: (string | null | undefined)[] = [];
  if (grant?.kind === "block") marks.push(grant.created_at);
  if (grant?.kind === "courtesy") marks.push(grant.expires_at);
  if (sub) marks.push(sub.canceled_at ?? sub.updated_at);
  const times = marks.map((m) => (m ? new Date(m).getTime() : NaN)).filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Contas do Instagram ainda `active` de quem está sem acesso há mais de
 * PURGE_AFTER_DAYS. O bot já não atende essas contas, mas a linha prende o @
 * (índice único de @ ativo) e o token cifrado continua guardado. Na dúvida
 * (erro de leitura, sem data para medir) não mexe.
 */
async function releaseInactiveAccounts(admin: QueryClient, now: Date, skip: Set<string>): Promise<string[]> {
  const { data, error } = await admin.from("ig_accounts").select("id, user_id").eq("status", "active");
  if (error) {
    console.error("[purge] falha ao listar contas ativas:", error.message);
    return [];
  }
  const byUser = new Map<string, string[]>();
  for (const acc of (data ?? []) as { id: string; user_id: string }[]) {
    if (skip.has(acc.user_id) || isAdmin(acc.user_id)) continue;
    byUser.set(acc.user_id, [...(byUser.get(acc.user_id) ?? []), acc.id]);
  }

  const cutoff = now.getTime() - PURGE_AFTER_DAYS * DAY_MS;
  const released: string[] = [];
  for (const [userId, accountIds] of byUser) {
    try {
      const { grant, error: grantError } = await accessGrantOf(admin, userId);
      if (grantError) continue;
      const { data: sub, error: subError } = await admin
        .from("subscriptions")
        .select("status, updated_at, canceled_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (subError) continue;
      const lostAt = accessLostAt(grant, sub as Pick<Subscription, "status" | "updated_at" | "canceled_at"> | null, now);
      if (!lostAt || lostAt.getTime() > cutoff) continue;

      for (const id of accountIds) {
        const { error: updateError } = await admin
          .from("ig_accounts")
          .update({ status: "disconnected", access_token_enc: "", token_expires_at: null })
          .eq("id", id)
          .eq("status", "active");
        if (updateError) throw new Error(updateError.message);
        released.push(id);
      }
    } catch (err) {
      console.error(`[purge] contas de ${userId} não liberadas:`, err instanceof Error ? err.message : err);
    }
  }
  return released;
}

async function cleanupStripeEvents(admin: QueryClient, now: Date): Promise<void> {
  const before = new Date(now.getTime() - STRIPE_EVENTS_RETENTION_DAYS * DAY_MS).toISOString();
  const { error } = await admin.from("stripe_events").delete().lt("received_at", before);
  if (error) console.error("[purge] falha ao limpar stripe_events antigos:", error.message);
}
