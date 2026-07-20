"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const buttonSchema = z.object({
  title: z.string().trim().min(1, "Título do botão é obrigatório.").max(20),
  url: z.string().url("URL do botão inválida."),
});

const mediaRefSchema = z.object({
  id: z.string(),
  media_type: z.string(),
  thumbnail_url: z.string().nullable(),
  permalink: z.string().nullable(),
  caption: z.string().nullable(),
});

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid("Selecione uma conta."),
  name: z.string().trim().max(80, "Nome muito longo.").optional(),
  trigger_type: z.enum(["dm", "comment"]).default("dm"),
  keyword: z.string().trim().max(80, "Palavra-chave muito longa.").optional(),
  match_type: z.enum(["exact", "contains", "starts_with"]),
  // Só usados quando trigger_type === "comment":
  media_mode: z.enum(["specific", "any"]).optional(),
  media_refs: z.array(mediaRefSchema).max(30).optional(),
  comment_any_word: z.boolean().optional(),
  public_reply_enabled: z.boolean().optional(),
  public_reply_text: z.string().trim().max(300).optional(),
  welcome_text: z.string().trim().max(1000).optional(),
  welcome_button_label: z.string().trim().max(20).optional(),
  // 2ª mensagem: resposta direta (dm) ou conteúdo liberado pelo botão (comment)
  reply_type: z.enum(["text", "image", "buttons"]),
  reply_text: z.string().trim().max(1000).optional(),
  reply_image_url: z.string().trim().optional(),
  reply_buttons: z.array(buttonSchema).max(3).optional(),
  delay_seconds: z.coerce.number().int().min(2).max(5),
  is_active: z.boolean(),
});

// z.input (não z.infer/z.output): trigger_type tem default("dm"), então
// quem chama saveRule pode omiti-lo — é isso que o builder de DM e o
// diálogo genérico de /rules fazem, já que só o de comentário precisa dele.
export type RuleInput = z.input<typeof ruleSchema>;

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

function validateRule(input: RuleInput): string | null {
  if (input.trigger_type === "comment") {
    if (!input.comment_any_word && !input.keyword?.trim()) {
      return "Informe a palavra-chave do comentário.";
    }
    if (!input.media_mode) {
      return "Escolha quais publicações disparam a automação.";
    }
    if (input.media_mode === "specific" && !input.media_refs?.length) {
      return "Selecione ao menos uma publicação ou Reel.";
    }
    if (!input.welcome_text?.trim()) {
      return "Escreva a mensagem de boas-vindas.";
    }
    if (!input.welcome_button_label?.trim()) {
      return "Defina o texto do botão da mensagem de boas-vindas.";
    }
    if (input.public_reply_enabled && !input.public_reply_text?.trim()) {
      return "Escreva a resposta pública ou desative a opção.";
    }
  } else if (!input.keyword?.trim()) {
    return "Informe a palavra-chave.";
  }

  return validateReply(input);
}

export async function saveRule(raw: RuleInput): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const input = parsed.data;

  const ruleError = validateRule(input);
  if (ruleError) return { error: ruleError };

  const isComment = input.trigger_type === "comment";

  const row = {
    account_id: input.account_id,
    name: input.name || null,
    trigger_type: input.trigger_type,
    keyword: isComment && input.comment_any_word ? null : (input.keyword ?? null),
    match_type: input.match_type,
    media_mode: isComment ? input.media_mode : null,
    media_refs: isComment && input.media_mode === "specific" ? input.media_refs : null,
    comment_any_word: isComment ? !!input.comment_any_word : false,
    public_reply_enabled: isComment ? !!input.public_reply_enabled : false,
    public_reply_text:
      isComment && input.public_reply_enabled ? input.public_reply_text ?? null : null,
    welcome_text: isComment ? input.welcome_text ?? null : null,
    welcome_button_label: isComment ? input.welcome_button_label ?? null : null,
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
