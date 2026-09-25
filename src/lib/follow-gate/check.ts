import { getFollowsBusiness } from "@/lib/meta/graph";
import { sleep } from "@/lib/utils";

export type FollowStatus = "follows" | "not_following" | "unknown";

export interface FollowCheck {
  status: FollowStatus;
  /** Motivo quando `unknown` (sem consentimento, erro da Meta, rede). */
  detail?: string;
}

/**
 * Logo depois de seguir, a Meta pode demorar alguns segundos para refletir
 * em `is_user_follow_business`. No toque em "Já segui" vale esperar e
 * conferir 1x mais antes de responder "ainda não apareceu".
 */
export const FOLLOW_RECHECK_DELAY_MS = 3_000;

/** Nunca lança: falha na consulta vira `unknown` (decisão D2: entrega mesmo assim). */
export async function checkFollow(
  token: string,
  senderId: string,
  { recheck = false }: { recheck?: boolean } = {}
): Promise<FollowCheck> {
  try {
    if (await getFollowsBusiness(token, senderId)) return { status: "follows" };
    if (!recheck) return { status: "not_following" };
    await sleep(FOLLOW_RECHECK_DELAY_MS);
    return {
      status: (await getFollowsBusiness(token, senderId)) ? "follows" : "not_following",
    };
  } catch (err) {
    return {
      status: "unknown",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
