import { syncAccountProfile } from "@/lib/meta/account-profile";
import { sendTemplateButtonsMessage } from "@/lib/meta/graph";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, Rule } from "@/types/database";

import { checkFollow } from "./check";
import { followGateCopy, followGateMessageText } from "./copy";
import { followCheckPayload, profileUrl } from "./payload";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Registro no log quando não deu para conferir e o conteúdo saiu mesmo assim. */
export const FOLLOW_UNKNOWN_DETAIL =
  "Não deu para conferir se a pessoa segue a conta; conteúdo entregue mesmo assim";

export type FollowGateResult =
  /** Não segue: recebeu o portão, o conteúdo fica retido. */
  | { held: true }
  /** Segue (ou não deu para conferir): pode entregar. */
  | { held: false; detail?: string };

/**
 * Portão "Seguir para liberar": confere se a pessoa segue a conta e, se não
 * segue, manda a mensagem com "Seguir perfil" (link) e "Já segui" (postback)
 * no lugar do conteúdo. `again` = ela já recebeu o portão antes (tocou em
 * "Já segui" ou pediu de novo): confere com uma 2ª tentativa e responde com
 * o texto de "ainda não apareceu". `recheck` (padrão = `again`) = espera e
 * confere 1x mais: só vale para quem acabou de agir ("Já segui"); repetir a
 * palavra-chave confere uma vez só. `delayMs` = delay humanizado antes do
 * portão, para quem ainda não esperou por ele.
 *
 * Lança se o envio da mensagem falhar ou o token for inválido (quem chama
 * trata como erro).
 */
export async function holdUnlessFollowing(
  admin: AdminClient,
  account: IgAccount,
  rule: Rule,
  senderId: string,
  token: string,
  {
    again,
    recheck = again,
    delayMs = 0,
  }: { again: boolean; recheck?: boolean; delayMs?: number }
): Promise<FollowGateResult> {
  const follow = await checkFollow(token, senderId, { recheck });
  if (follow.status === "follows") return { held: false };
  if (follow.status === "unknown") {
    console.warn(`[follow-gate] checagem falhou na regra ${rule.id}:`, follow.detail);
    return { held: false, detail: `${FOLLOW_UNKNOWN_DETAIL} (${follow.detail})` };
  }

  // Delay humanizado da automação, também antes do portão.
  if (delayMs > 0) await sleep(delayMs);
  await sendFollowGateMessage(admin, token, account, rule, senderId, {
    again,
    confirmPayload: followCheckPayload(rule.id),
  });

  // Marca o conteúdo como retido: a linha de rule_triggers com o portão
  // enviado e sem link_delivered_at é o que libera o "Já segui" e faz a
  // palavra-chave repetida na DM conferir de novo em vez de virar duplicada.
  await admin.from("rule_triggers").upsert(
    { rule_id: rule.id, account_id: account.id, ig_sender_id: senderId },
    { onConflict: "rule_id,ig_sender_id", ignoreDuplicates: true }
  );
  await admin
    .from("rule_triggers")
    .update({ follow_gate_sent_at: new Date().toISOString() })
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId);

  return { held: true };
}

// O @ da conta muda raramente: sincroniza com a Graph API no máximo 1x por
// hora por conta (memória do isolate), não a cada portão enviado.
const PROFILE_SYNC_TTL_MS = 60 * 60 * 1000;
const syncedUsernames = new Map<string, { username: string; at: number }>();

async function currentUsername(
  admin: AdminClient,
  account: IgAccount,
  token: string
): Promise<string> {
  const cached = syncedUsernames.get(account.id);
  if (cached && Date.now() - cached.at < PROFILE_SYNC_TTL_MS) return cached.username;
  const { ig_username } = await syncAccountProfile(admin, account, token);
  syncedUsernames.set(account.id, { username: ig_username, at: Date.now() });
  return ig_username;
}

/**
 * Mensagem do portão: texto sorteado (ou o "ainda não", com `again`) + botão que abre
 * o perfil + "Já segui" com `confirmPayload`. Automação usa
 * `falow:follow_check:<rule>`; o nó Automação de um workflow usa um payload
 * de sequência, que retoma o próprio run. O @ do link vem do Instagram
 * (a conta pode ter trocado de @ depois de conectada), com cache de 1h.
 */
export async function sendFollowGateMessage(
  admin: AdminClient,
  token: string,
  account: IgAccount,
  rule: Rule,
  senderId: string,
  {
    again,
    confirmPayload,
    random,
  }: { again: boolean; confirmPayload: string; random?: () => number }
): Promise<void> {
  const copy = followGateCopy(rule);
  const ig_username = await currentUsername(admin, account, token);
  // Sorteia entre o texto principal e as variações cadastradas (migration 0017).
  const text = followGateMessageText(rule, again, random);
  await sendTemplateButtonsMessage(token, senderId, text, [
    { type: "web_url", title: copy.followLabel, url: profileUrl(ig_username) },
    { type: "postback", title: copy.confirmLabel, payload: confirmPayload },
  ]);
}

/** Conteúdo retido no portão, esperando a pessoa seguir. */
export function isHeldByFollowGate(
  trigger: { link_delivered_at?: string | null; follow_gate_sent_at?: string | null } | null
): boolean {
  return !!trigger?.follow_gate_sent_at && !trigger.link_delivered_at;
}
