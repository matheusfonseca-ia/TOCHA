export const MAX_ACCOUNTS_PER_USER = 1;

/**
 * Decide se o usuário pode conectar este @. `activeAccounts` = contas ativas
 * com este ig_user_id **ou** deste usuário (uma consulta só no callback).
 */
export function connectBlockReason(input: {
  userId: string;
  igUserId: string;
  owner: boolean;
  activeAccounts: { user_id: string; ig_user_id: string }[];
}): "account_taken" | "account_limit" | null {
  if (input.activeAccounts.some((a) => a.ig_user_id === input.igUserId && a.user_id !== input.userId)) {
    return "account_taken";
  }
  if (input.owner) return null;
  const others = input.activeAccounts.filter((a) => a.user_id === input.userId && a.ig_user_id !== input.igUserId);
  return others.length >= MAX_ACCOUNTS_PER_USER ? "account_limit" : null;
}
