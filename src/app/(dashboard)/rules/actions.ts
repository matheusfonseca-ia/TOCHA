"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeText } from "@/lib/rules/engine";
import { automationRuleIdsOf } from "@/lib/sequences/graph";
import { createClient } from "@/lib/supabase/server";
import type { SequenceGraph } from "@/types/sequence";
import type { MediaRef } from "@/types/database";

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

/**
 * `welcome_text` vira o texto de um button template no envio da resposta
 * privada (Meta corta em 640 caracteres), mais curto que o limite de 1000
 * de mensagem de texto simples. Validar aqui evita truncar em silêncio.
 */
const WELCOME_TEXT_MAX = 640;

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
  welcome_text: z
    .string()
    .trim()
    .max(
      WELCOME_TEXT_MAX,
      `Mensagem de boas-vindas: máximo de ${WELCOME_TEXT_MAX} caracteres (limite do botão da Meta).`
    )
    .optional(),
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
  /** Id da regra salva/duplicada. */
  id?: string;
  /**
   * Aviso não bloqueante: outra automação ativa já cobre a mesma
   * palavra-chave (DM) ou publicação (comentário). A automação é salva
   * normalmente mesmo assim: quem decide se isso é um problema é o usuário.
   */
  warning?: string;
}

type ConflictCandidate = {
  id: string;
  name: string | null;
  keyword: string | null;
  media_refs: MediaRef[] | null;
};

/**
 * Procura outra regra ativa da mesma conta/tipo de gatilho que colidiria
 * com `input`: mesma palavra-chave (DM) ou alguma publicação em comum
 * (comentário). Não bloqueia o salvamento, só informa.
 */
async function findConflictingRuleName(
  supabase: ReturnType<typeof createClient>,
  input: {
    id?: string;
    account_id: string;
    trigger_type: "dm" | "comment";
    keyword: string | null;
    media_refs: MediaRef[] | null;
  }
): Promise<string | null> {
  let query = supabase
    .from("rules")
    .select("id, name, keyword, media_refs")
    .eq("account_id", input.account_id)
    .eq("trigger_type", input.trigger_type)
    .eq("is_active", true);

  if (input.id) query = query.neq("id", input.id);

  const { data } = await query;
  const candidates = (data ?? []) as ConflictCandidate[];
  if (candidates.length === 0) return null;

  let conflict: ConflictCandidate | undefined;
  if (input.trigger_type === "comment") {
    const mediaIds = new Set((input.media_refs ?? []).map((m) => m.id));
    conflict = candidates.find((c) =>
      (c.media_refs ?? []).some((m) => mediaIds.has(m.id))
    );
  } else {
    const keyword = normalizeText(input.keyword ?? "");
    if (!keyword) return null;
    conflict = candidates.find((c) => normalizeText(c.keyword ?? "") === keyword);
  }

  if (!conflict) return null;
  return conflict.name || conflict.keyword || "outra automação";
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

  const warning = input.is_active
    ? ((await findConflictingRuleName(supabase, {
        id: input.id,
        account_id: input.account_id,
        trigger_type: input.trigger_type,
        keyword: row.keyword,
        media_refs: row.media_refs ?? null,
      })) ?? undefined)
    : undefined;

  return warning ? { warning } : {};
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

  if (!isActive) return {};

  const { data: rule } = await supabase
    .from("rules")
    .select("account_id, trigger_type, keyword, media_refs")
    .eq("id", id)
    .maybeSingle();
  if (!rule) return {};

  const warning =
    (await findConflictingRuleName(supabase, {
      id,
      account_id: rule.account_id,
      trigger_type: rule.trigger_type,
      keyword: rule.keyword,
      media_refs: rule.media_refs,
    })) ?? undefined;

  return warning ? { warning } : {};
}

/**
 * Nomes dos workflows que usam a automação num nó "Automação" (entrada ou
 * meio do fluxo). O diálogo de exclusão mostra a lista antes de confirmar:
 * depois de excluída, esses nós ficam como "Automação removida".
 */
export async function listRuleWorkflowUsage(id: string): Promise<string[]> {
  const supabase = createClient();
  const { data: rule } = await supabase
    .from("rules")
    .select("account_id")
    .eq("id", id)
    .maybeSingle();
  if (!rule) return [];

  const { data: sequences } = await supabase
    .from("sequences")
    .select("name, graph")
    .eq("account_id", rule.account_id);

  return (sequences ?? [])
    .filter((s) => automationRuleIdsOf(s.graph as SequenceGraph).includes(id))
    .map((s) => s.name as string);
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("rules").delete().eq("id", id);

  if (error) return { error: "Não foi possível excluir a regra." };

  revalidatePath("/rules");
  revalidatePath("/dashboard");
  return {};
}

const RULE_NAME_MAX = 80;

/**
 * Duplica uma automação: copia todas as colunas (exceto id/created_at),
 * nasce pausada (`is_active = false`) para não disparar de imediato em cima
 * da original, com nome "Cópia de X".
 */
export async function duplicateRule(id: string): Promise<ActionResult> {
  const supabase = createClient();
  // select("*") + RLS: só encontra a regra se pertencer ao usuário logado.
  const { data: original, error: fetchError } = await supabase
    .from("rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !original) {
    return { error: "Não foi possível encontrar a automação para duplicar." };
  }

  const baseName = original.name || original.keyword || "automação";
  const name = `Cópia de ${baseName}`.slice(0, RULE_NAME_MAX);

  const row = {
    account_id: original.account_id,
    name,
    trigger_type: original.trigger_type,
    keyword: original.keyword,
    match_type: original.match_type,
    media_mode: original.media_mode,
    media_refs: original.media_refs,
    comment_any_word: original.comment_any_word,
    public_reply_enabled: original.public_reply_enabled,
    public_reply_text: original.public_reply_text,
    welcome_text: original.welcome_text,
    welcome_button_label: original.welcome_button_label,
    reply_type: original.reply_type,
    reply_text: original.reply_text,
    reply_image_url: original.reply_image_url,
    reply_buttons: original.reply_buttons,
    delay_seconds: original.delay_seconds,
    priority: original.priority,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("rules")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível duplicar a automação. Tente novamente." };
  }

  revalidatePath("/rules");
  revalidatePath("/dashboard");
  return { id: data.id as string };
}
