"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { INBOX_PATH } from "../../inbox/utils/href";
import { removeContactField, setContactField } from "../server/contact-fields-repository";

/** Edição dos "Dados coletados" da ficha do lead. Mesmo padrão de posse + service role do resto do módulo. */

async function assertOwnsAccount(accountId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data } = await supabase.from("ig_accounts").select("id").eq("id", accountId).maybeSingle();
  return data ? { error: null } : { error: "Conta não encontrada." };
}

export async function saveContactField(
  accountId: string,
  senderId: string,
  username: string | null,
  key: string,
  value: string
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  const result = await setContactField(createAdminClient(), accountId, senderId, username, key, value);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function deleteContactField(
  accountId: string,
  senderId: string,
  key: string
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  await removeContactField(createAdminClient(), accountId, senderId, key);
  revalidatePath(INBOX_PATH);
  return { error: null };
}
