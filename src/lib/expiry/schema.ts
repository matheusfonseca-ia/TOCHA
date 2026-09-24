import { z } from "zod";

import { EXPIRE_ACTIONS, type ExpireAction } from "./expiry";

/**
 * Campos de expiração aceitos por saveRule / saveSequence. `undefined` =
 * não mexe no que está salvo (quem chama sem conhecer a feature, como o
 * editor do workflow, não apaga a expiração); `null` = permanente.
 */
export const expiryFields = {
  expires_at: z
    .string()
    .datetime({ message: "Data de expiração inválida." })
    .nullable()
    .optional(),
  expire_action: z.enum(EXPIRE_ACTIONS).optional(),
};

/** Colunas a gravar: vazio quando `expires_at` não veio. */
export function expiryColumns(input: {
  expires_at?: string | null;
  expire_action?: ExpireAction;
}): { expires_at?: string | null; expire_action?: ExpireAction } {
  if (input.expires_at === undefined) return {};
  return {
    expires_at: input.expires_at,
    expire_action: input.expire_action ?? "delete",
  };
}
