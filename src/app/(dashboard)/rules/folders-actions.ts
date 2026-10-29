"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { activeUserId } from "@/lib/auth/require-access";
import { isMissingColumn, isMissingTable } from "@/lib/db/missing";
import { FOLDER_COLORS, normalizeFolderName, type Folder } from "@/lib/folders/folders";
import { createClient } from "@/lib/supabase/server";

/**
 * Pastas compartilhadas por Automações e Workflow. Banco sem a migration
 * 0015 devolve lista vazia: a coluna de pastas some da tela e o resto segue
 * funcionando.
 */

const FOLDERS_MIGRATION_ERROR =
  "Para usar pastas, aplique a migration 0015_folders.sql no Supabase.";
const NO_ACCESS_ERROR = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";
const NOT_FOUND_ERROR = "Pasta ou item não encontrado. Atualize a página e tente de novo.";

const uuid = z.guid();
const createSchema = z.object({ accountId: uuid, name: z.string(), color: z.enum(FOLDER_COLORS) });
const moveSchema = z.object({ kind: z.enum(["rule", "sequence"]), id: uuid, folderId: uuid.nullable() });

export async function listFolders(): Promise<Folder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .select("id, name, color")
    .order("name");

  if (error) return [];
  return (data ?? []) as Folder[];
}

export type FolderActionResult = { id: string } | { error: string };

export async function createFolder(input: {
  accountId: string;
  name: string;
  color: string;
}): Promise<FolderActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "Pasta inválida. Atualize a página e tente de novo." };
  const normalized = normalizeFolderName(parsed.data.name);
  if ("error" in normalized) return normalized;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .insert({
      account_id: parsed.data.accountId,
      name: normalized.name,
      color: parsed.data.color,
    })
    .select("id")
    .maybeSingle();

  if (isMissingTable(error, "folders")) return { error: FOLDERS_MIGRATION_ERROR };
  if (error || !data) {
    return { error: "Não foi possível criar a pasta. Tente novamente." };
  }

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return { id: data.id as string };
}

export async function renameFolder(
  id: string,
  name: string
): Promise<{ error?: string }> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  if (!uuid.safeParse(id).success) return { error: NOT_FOUND_ERROR };
  const normalized = normalizeFolderName(name);
  if ("error" in normalized) return normalized;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .update({ name: normalized.name })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Não foi possível renomear a pasta." };
  if (!data) return { error: NOT_FOUND_ERROR };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}

/** Apagar a pasta não apaga o que está dentro: o `on delete set null` solta os itens. */
export async function deleteFolder(id: string): Promise<{ error?: string }> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  if (!uuid.safeParse(id).success) return { error: NOT_FOUND_ERROR };
  const supabase = await createClient();
  const { data, error } = await supabase.from("folders").delete().eq("id", id).select("id").maybeSingle();

  if (error) return { error: "Não foi possível apagar a pasta." };
  if (!data) return { error: NOT_FOUND_ERROR };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}

export async function moveToFolder(input: {
  kind: "rule" | "sequence";
  id: string;
  folderId: string | null;
}): Promise<{ error?: string }> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { error: NOT_FOUND_ERROR };
  const { kind, id, folderId } = parsed.data;

  const supabase = await createClient();
  const table = kind === "rule" ? "rules" : "sequences";

  // A FK só confere que a pasta existe, não de quem é: a pasta precisa ser
  // visível para o usuário (RLS) e da mesma conta do item.
  if (folderId) {
    const [{ data: folder }, { data: item }] = await Promise.all([
      supabase.from("folders").select("account_id").eq("id", folderId).maybeSingle(),
      supabase.from(table).select("account_id").eq("id", id).maybeSingle(),
    ]);
    if (!folder || !item || folder.account_id !== item.account_id) return { error: NOT_FOUND_ERROR };
  }

  const { data, error } = await supabase
    .from(table)
    .update({ folder_id: folderId })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (isMissingColumn(error, "folder_id")) return { error: FOLDERS_MIGRATION_ERROR };
  if (error) return { error: "Não foi possível mover. Tente novamente." };
  if (!data) return { error: NOT_FOUND_ERROR };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}
