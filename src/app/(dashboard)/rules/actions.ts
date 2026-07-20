"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const buttonSchema = z.object({
  title: z.string().trim().min(1, "Título do botão é obrigatório.").max(20),
  url: z.string().url("URL do botão inválida."),
});

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid("Selecione uma conta."),
  name: z.string().trim().max(80, "Nome muito longo.").optional(),
  keyword: z
    .string()
    .trim()
    .min(1, "Informe a palavra-chave.")
    .max(80, "Palavra-chave muito longa."),
  match_type: z.enum(["exact", "contains", "starts_with"]),
  reply_type: z.enum(["text", "image", "buttons"]),
  reply_text: z.string().trim().max(1000).optional(),
  reply_image_url: z.string().trim().optional(),
  reply_buttons: z.array(buttonSchema).max(3).optional(),
  delay_seconds: z.coerce.number().int().min(2).max(5),
  is_active: z.boolean(),
});

export type RuleInput = z.infer<typeof ruleSchema>;

export interface ActionResult {
  error?: string;
}

function validateReply(input: RuleInput): string | null {
  if (input.reply_type === "text" && !input.reply_text) {
    return "Informe o texto da resposta.";
  }
  if (input.reply_type === "image") {
    const url = z.string().url().safeParse(input.reply_image_url);
    if (!url.success) return "Informe uma URL de imagem válida.";
  }
  if (input.reply_type === "buttons") {
    if (!input.reply_text) return "Informe o texto que acompanha os botões.";
    if (!input.reply_buttons?.length) return "Adicione ao menos um botão.";
  }
  return null;
}

export async function saveRule(raw: RuleInput): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const input = parsed.data;

  const replyError = validateReply(input);
  if (replyError) return { error: replyError };

  const row = {
    account_id: input.account_id,
    name: input.name || null,
    keyword: input.keyword,
    match_type: input.match_type,
    reply_type: input.reply_type,
    reply_text:
      input.reply_type === "image" ? null : (input.reply_text ?? null),
    reply_image_url:
      input.reply_type === "image" ? input.reply_image_url : null,
    reply_buttons:
      input.reply_type === "buttons" ? input.reply_buttons : null,
    delay_seconds: input.delay_seconds,
    is_active: input.is_active,
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  // RLS garante que account_id / rule pertencem ao usuário logado.
  const { error } = input.id
    ? await supabase.from("rules").update(row).eq("id", input.id)
    : await supabase.from("rules").insert(row);

  if (error) {
    return { error: "Não foi possível salvar a regra. Tente novamente." };
  }

  revalidatePath("/rules");
  revalidatePath("/dashboard");
  return {};
}

export async function toggleRule(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: "Não foi possível atualizar a regra." };

  revalidatePath("/rules");
  return {};
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("rules").delete().eq("id", id);

  if (error) return { error: "Não foi possível excluir a regra." };

  revalidatePath("/rules");
  revalidatePath("/dashboard");
  return {};
}
