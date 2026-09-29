"use server";

import { revalidatePath } from "next/cache";

import { isMissingColumn, isMissingTable } from "@/lib/db/missing";
import { normalizeFolderName, type Folder } from "@/lib/folders/folders";
import { createClient } from "@/lib/supabase/server";

/**
 * Pastas compartilhadas por Automações e Workflow. Banco sem a migration
 * 0015 devolve lista vazia: a coluna de pastas some da tela e o resto segue
 * funcionando.
 */

const FOLDERS_MIGRATION_ERROR =
  "Para usar pastas, aplique a migration 0015_folders.sql no Supabase.";

export async function listFolders(): Promise<Folder[]> {
  const supabase = createClient();
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
  const normalized = normalizeFolderName(input.name);
  if ("error" in normalized) return normalized;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("folders")
    .insert({
      account_id: input.accountId,
      name: normalized.name,
      color: input.color,
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
  const normalized = normalizeFolderName(name);
  if ("error" in normalized) return normalized;

  const supabase = createClient();
  const { error } = await supabase
    .from("folders")
    .update({ name: normalized.name })
    .eq("id", id);

  if (error) return { error: "Não foi possível renomear a pasta." };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}

/** Apagar a pasta não apaga o que está dentro: o `on delete set null` solta os itens. */
export async function deleteFolder(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);

  if (error) return { error: "Não foi possível apagar a pasta." };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}

export async function moveToFolder(input: {
  kind: "rule" | "sequence";
  id: string;
  folderId: string | null;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const table = input.kind === "rule" ? "rules" : "sequences";
  const { error } = await supabase
    .from(table)
    .update({ folder_id: input.folderId })
    .eq("id", input.id);

  if (isMissingColumn(error, "folder_id")) return { error: FOLDERS_MIGRATION_ERROR };
  if (error) return { error: "Não foi possível mover. Tente novamente." };

  revalidatePath("/rules");
  revalidatePath("/rules/sequencias");
  return {};
}
