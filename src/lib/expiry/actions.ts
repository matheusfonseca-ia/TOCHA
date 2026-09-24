"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { EXPIRE_ACTIONS, isExpired, validateExpiry, type ExpireAction } from "./expiry";

export type ExpiryKind = "rule" | "sequence";

const TABLE: Record<ExpiryKind, "rules" | "sequences"> = {
  rule: "rules",
  sequence: "sequences",
};

const PATHS: Record<ExpiryKind, string> = {
  rule: "/rules",
  sequence: "/rules/sequencias",
};

const extendSchema = z.object({
  kind: z.enum(["rule", "sequence"]),
  id: z.string().uuid(),
  expiresAt: z.string().datetime({ message: "Data de expiração inválida." }).nullable(),
  expireAction: z.enum(EXPIRE_ACTIONS).optional(),
});

export interface ExtendExpiryResult {
  error?: string;
  /** Estava pausada pela expiração e voltou a ficar ativa. */
  reactivated?: boolean;
}

/**
 * Define, estende ou remove (`expiresAt = null`) a expiração. Se o item
 * estava pausado PELA expiração (vencido com ação "pausar"), volta a ficar
 * ativo; pausa manual continua pausada.
 */
export async function extendExpiry(
  kind: ExpiryKind,
  id: string,
  expiresAt: string | null,
  expireAction?: ExpireAction
): Promise<ExtendExpiryResult> {
  const parsed = extendSchema.safeParse({ kind, id, expiresAt, expireAction });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const now = new Date();
  const invalid = validateExpiry(parsed.data.expiresAt, now);
  if (invalid) return { error: invalid };

  const table = TABLE[parsed.data.kind];
  const supabase = createClient();
  // RLS: só encontra (e só atualiza) o que pertence ao usuário logado.
  const { data: current } = await supabase
    .from(table)
    .select("is_active, expires_at, expire_action")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!current) {
    return { error: "Não foi possível encontrar o item. Atualize a página e tente de novo." };
  }

  const pausedByExpiry =
    !current.is_active &&
    current.expire_action === "pause" &&
    isExpired(current.expires_at, now);

  const { error } = await supabase
    .from(table)
    .update({
      expires_at: parsed.data.expiresAt,
      expire_action: parsed.data.expireAction ?? current.expire_action ?? "delete",
      ...(pausedByExpiry && { is_active: true }),
      updated_at: now.toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) return { error: "Não foi possível salvar a expiração. Tente novamente." };

  revalidatePath(PATHS[parsed.data.kind]);
  revalidatePath("/dashboard");
  return pausedByExpiry ? { reactivated: true } : {};
}
