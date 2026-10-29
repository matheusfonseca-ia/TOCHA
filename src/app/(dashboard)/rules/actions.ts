"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { activeUserId } from "@/lib/auth/require-access";
import { validateExpiry } from "@/lib/expiry/expiry";
import {
  EXPIRED_RULE_ACTIVATION_ERROR,
  isStoredExpired,
} from "@/lib/expiry/guard";
import { expiryColumns, expiryFields } from "@/lib/expiry/schema";
import {
  copyFollowGateColumns,
  FOLLOW_GATE_MIGRATION_ERROR,
  followGateColumns,
  FOLLOW_GATE_VARIANTS_MIGRATION_WARNING,
  followGateFields,
  hasFollowGateVariants,
  isMissingFollowGateColumn,
  isMissingFollowGateVariantsColumn,
  withoutFollowGateColumns,
  withoutFollowGateVariantColumns,
} from "@/lib/follow-gate/schema";
import { keywordTerms } from "@/lib/rules/engine";
import { isHttpUrl, URL_MAX } from "@/lib/rules/links";
import { MAX_VARIANTS } from "@/lib/rules/variants";
import { automationRuleIdsOf } from "@/lib/sequences/graph";
import { createClient } from "@/lib/supabase/server";
import type { SequenceGraph } from "@/types/sequence";
import type { MediaRef } from "@/types/database";

const NO_ACCESS_ERROR = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";
const RULE_NOT_FOUND_ERROR = "Automação não encontrada. Atualize a página e tente de novo.";

// Só http(s): a Meta recusa outro esquema no botão e javascript:/data: nunca
// devem ser gravados (a action pode ser chamada direto, sem o builder).
const httpUrl = (message: string) => z.string().trim().refine(isHttpUrl, message);

const buttonSchema = z.object({
  title: z.string().trim().min(1, "Título do botão é obrigatório.").max(20),
  url: httpUrl("URL do botão inválida (use um link http ou https)."),
});

// Dados da publicação vindos do seletor (Graph API). Tamanhos limitados e
// URLs só http(s): thumbnail_url vira <img src> no painel.
const optionalHttpUrl = z
  .string()
  .max(URL_MAX)
  .nullable()
  .refine((v) => v === null || isHttpUrl(v), "Publicação com link inválido.");
const mediaRefSchema = z.object({
  id: z.string().min(1).max(64),
  media_type: z.string().max(32),
  thumbnail_url: optionalHttpUrl,
  permalink: optionalHttpUrl,
  caption: z.string().max(2200).nullable(),
});

/**
 * `welcome_text` vira o texto de um button template no envio da resposta
 * privada (Meta corta em 640 caracteres), mais curto que o limite de 1000
 * de mensagem de texto simples. Validar aqui evita truncar em silêncio.
 */
const WELCOME_TEXT_MAX = 640;

// Variantes de resposta: extras além da variante 1 (o próprio campo
// `public_reply_text`/`welcome_text`), com o total limitado a MAX_VARIANTS e
// o mesmo limite de caracteres de cada texto.
const MAX_REPLY_VARIANTS = MAX_VARIANTS - 1;

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
  // Variantes extras (2ª em diante) da resposta pública: sorteada junto com
  // `public_reply_text` (variante 1) em cada disparo.
  public_reply_variants: z
    .array(z.string().trim().max(300))
    .max(MAX_REPLY_VARIANTS)
    .optional(),
  welcome_text: z
    .string()
    .trim()
    .max(
      WELCOME_TEXT_MAX,
      `Mensagem de boas-vindas: máximo de ${WELCOME_TEXT_MAX} caracteres (limite do botão da Meta).`
    )
    .optional(),
  // Variantes extras (2ª em diante) da mensagem de boas-vindas: sorteada
  // junto com `welcome_text` (variante 1) em cada disparo.
  welcome_text_variants: z
    .array(z.string().trim().max(WELCOME_TEXT_MAX))
    .max(MAX_REPLY_VARIANTS)
    .optional(),
  welcome_button_label: z.string().trim().max(20).optional(),
  // 2ª mensagem: resposta direta (dm) ou conteúdo liberado pelo botão (comment)
  reply_type: z.enum(["text", "image", "buttons"]),
  reply_text: z.string().trim().max(1000).optional(),
  reply_image_url: z.string().trim().max(URL_MAX).optional(),
  reply_buttons: z.array(buttonSchema).max(3).optional(),
  delay_seconds: z.coerce.number().int().min(2).max(5),
  is_active: z.boolean(),
  ...expiryFields,
  // Portão "Seguir para liberar" (automações de DM e de comentário)
  ...followGateFields,
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

type ConflictTarget = {
  keyword: string | null;
  media_mode: "specific" | "any" | null;
  media_refs: MediaRef[] | null;
  comment_any_word: boolean | null;
};

type ConflictCandidate = ConflictTarget & { id: string; name: string | null };

function shareTerm(a: string | null, b: string | null): boolean {
  const terms = new Set(keywordTerms(a));
  return keywordTerms(b).some((t) => terms.has(t));
}

/**
 * Duas regras de comentário colidem quando podem responder o MESMO
 * comentário: publicação em comum ("qualquer publicação" vale para todas)
 * e palavra em comum ("qualquer palavra" vale para todas).
 */
function commentRulesOverlap(a: ConflictTarget, b: ConflictTarget): boolean {
  const aMedia = new Set((a.media_refs ?? []).map((m) => m.id));
  const sameMedia =
    a.media_mode === "any" ||
    b.media_mode === "any" ||
    (b.media_refs ?? []).some((m) => aMedia.has(m.id));
  if (!sameMedia) return false;
  if (a.comment_any_word || b.comment_any_word) return true;
  return shareTerm(a.keyword, b.keyword);
}

/**
 * Procura outra regra ativa da mesma conta/tipo de gatilho que colidiria
 * com `input`: algum termo de palavra-chave em comum (DM), ou publicação e
 * palavra em comum (comentário). Não bloqueia o salvamento, só informa.
 */
async function findConflictingRuleName(
  supabase: ReturnType<typeof createClient>,
  input: ConflictTarget & {
    id?: string;
    account_id: string;
    trigger_type: "dm" | "comment";
  }
): Promise<string | null> {
  let query = supabase
    .from("rules")
    .select("id, name, keyword, media_mode, media_refs, comment_any_word")
    .eq("account_id", input.account_id)
    .eq("trigger_type", input.trigger_type)
    .eq("is_active", true);

  if (input.id) query = query.neq("id", input.id);

  const { data } = await query;
  const candidates = (data ?? []) as ConflictCandidate[];
  if (candidates.length === 0) return null;

  const conflict =
    input.trigger_type === "comment"
      ? candidates.find((c) => commentRulesOverlap(input, c))
      : candidates.find((c) => shareTerm(input.keyword, c.keyword));

  if (!conflict) return null;
  const other = conflict.name || conflict.keyword || "outra automação";
  return `A automação "${other}" também está ativa e pode responder a mesma mensagem. Só uma delas vai responder.`;
}

/**
 * Filtra variantes vazias e devolve `null` (não `[]`) quando não sobra
 * nenhuma: `public_reply_variants`/`welcome_text_variants` gravam nulo em
 * vez de array vazio, consistente com o resto das colunas opcionais de rule.
 */
function cleanVariants(variants: string[] | undefined): string[] | null {
  const cleaned = (variants ?? []).map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function validateReply(input: RuleInput): string | null {
  if (input.reply_type === "text" && !input.reply_text) {
    return "Informe o texto da resposta.";
  }
  if (input.reply_type === "image" && !isHttpUrl(input.reply_image_url)) {
    return "Informe uma URL de imagem válida (http ou https).";
  }
  if (input.reply_type === "buttons") {
    if (!input.reply_text) return "Informe o texto que acompanha os botões.";
    if (!input.reply_buttons?.length) return "Adicione ao menos um botão.";
  }
  return null;
}

function validateRule(input: RuleInput): string | null {
  if (input.trigger_type === "comment") {
    // keywordTerms, não trim: "," ou " , " passariam e nunca casariam com nada.
    if (!input.comment_any_word && keywordTerms(input.keyword ?? null).length === 0) {
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
  } else if (keywordTerms(input.keyword ?? null).length === 0) {
    return "Informe a palavra-chave.";
  }

  return validateReply(input);
}

const LIST_CAPS: Record<string, number> = {
  media_refs: 30,
  reply_buttons: 3,
  public_reply_variants: MAX_REPLY_VARIANTS,
  welcome_text_variants: MAX_REPLY_VARIANTS,
};

function oversizedList(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  return Object.entries(LIST_CAPS).some(([key, cap]) => Array.isArray(record[key]) && (record[key] as unknown[]).length > cap);
}

export async function saveRule(raw: RuleInput): Promise<ActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  // zod 3 valida todos os itens mesmo depois de estourar o .max(): lista
  // gigante (corpo de até 26 MB) é recusada antes do parse.
  if (oversizedList(raw)) return { error: "Automação inválida: listas acima do limite." };
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const input = parsed.data;

  const ruleError = validateRule(input);
  if (ruleError) return { error: ruleError };

  const expiryError = validateExpiry(input.expires_at);
  if (expiryError) return { error: expiryError };

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
    public_reply_variants:
      isComment && input.public_reply_enabled
        ? cleanVariants(input.public_reply_variants)
        : null,
    welcome_text: isComment ? input.welcome_text ?? null : null,
    welcome_text_variants: isComment ? cleanVariants(input.welcome_text_variants) : null,
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
    ...expiryColumns(input),
    ...followGateColumns(input),
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  if (
    input.id &&
    input.is_active &&
    input.expires_at === undefined &&
    (await isStoredExpired(supabase, "rules", input.id))
  ) {
    return { error: EXPIRED_RULE_ACTIVATION_ERROR };
  }

  // RLS garante que account_id / rule pertencem ao usuário logado.
  // Criando: devolve o id da automação nova, senão a checagem de conflito
  // abaixo acharia a própria automação como "outra ativa".
  const write = async (values: typeof row) => {
    if (input.id) {
      // select: RLS transforma id alheio/apagado em no-op silencioso; sem linha = não encontrada.
      const { data, error } = await supabase
        .from("rules")
        .update(values)
        .eq("id", input.id)
        .select("id")
        .maybeSingle();
      return { id: input.id, error, missing: !error && !data };
    }
    const { data, error } = await supabase
      .from("rules")
      .insert(values)
      .select("id")
      .maybeSingle();
    return { id: (data?.id as string | undefined) ?? undefined, error, missing: false };
  };
  let saved = await write(row);

  // Banco ainda sem a migration 0017: salva sem as variações do portão e avisa
  // (só se havia o que gravar). Cada detector casa só as próprias colunas, então
  // a ordem entre este bloco e o da 0007 não muda o resultado.
  let variantsWarning: string | undefined;
  if (saved.error && isMissingFollowGateVariantsColumn(saved.error)) {
    if (hasFollowGateVariants(row)) variantsWarning = FOLLOW_GATE_VARIANTS_MIGRATION_WARNING;
    saved = await write(withoutFollowGateVariantColumns(row));
  }

  // Banco ainda sem a migration 0007: salva sem o portão enquanto ele está
  // desligado; ligado, avisa o que falta em vez de um erro genérico.
  if (saved.error && isMissingFollowGateColumn(saved.error)) {
    if (row.follow_gate_enabled) return { error: FOLLOW_GATE_MIGRATION_ERROR };
    saved = await write(withoutFollowGateColumns(row));
    // O portão inteiro ficou de fora: o aviso das variações não se aplica.
    variantsWarning = undefined;
  }

  if (saved.error) {
    return { error: "Não foi possível salvar a regra. Tente novamente." };
  }
  if (saved.missing) return { error: RULE_NOT_FOUND_ERROR };

  // "layout": as contagens das abas moram no layout de /rules.
  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");

  const warning = input.is_active
    ? ((await findConflictingRuleName(supabase, {
        id: saved.id,
        account_id: input.account_id,
        trigger_type: input.trigger_type,
        keyword: row.keyword,
        media_mode: row.media_mode ?? null,
        media_refs: row.media_refs ?? null,
        comment_any_word: row.comment_any_word,
      })) ?? undefined)
    : undefined;

  const combined = [warning, variantsWarning].filter(Boolean).join(" ");
  return combined ? { warning: combined } : {};
}

export async function toggleRule(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  if (!z.string().uuid().safeParse(id).success) return { error: RULE_NOT_FOUND_ERROR };
  const supabase = createClient();
  if (isActive && (await isStoredExpired(supabase, "rules", id))) {
    return { error: EXPIRED_RULE_ACTIVATION_ERROR };
  }

  const { data: updated, error } = await supabase
    .from("rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Não foi possível atualizar a regra." };
  if (!updated) return { error: RULE_NOT_FOUND_ERROR };

  revalidatePath("/rules");

  if (!isActive) return {};

  const { data: rule } = await supabase
    .from("rules")
    .select("account_id, trigger_type, keyword, media_mode, media_refs, comment_any_word")
    .eq("id", id)
    .maybeSingle();
  if (!rule) return {};

  const warning =
    (await findConflictingRuleName(supabase, {
      id,
      account_id: rule.account_id,
      trigger_type: rule.trigger_type,
      keyword: rule.keyword,
      media_mode: rule.media_mode,
      media_refs: rule.media_refs,
      comment_any_word: rule.comment_any_word,
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
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  if (!z.string().uuid().safeParse(id).success) return { error: RULE_NOT_FOUND_ERROR };
  const supabase = createClient();
  const { data: deleted, error } = await supabase
    .from("rules")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Não foi possível excluir a regra." };
  if (!deleted) return { error: RULE_NOT_FOUND_ERROR };

  // "layout": as contagens das abas moram no layout de /rules.
  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");
  return {};
}

const RULE_NAME_MAX = 80;

/**
 * Duplica uma automação: copia todas as colunas (exceto id/created_at),
 * nasce pausada (`is_active = false`) para não disparar de imediato em cima
 * da original, com nome "Cópia de X". Não copia a expiração: a cópia nasce
 * permanente.
 */
export async function duplicateRule(id: string): Promise<ActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
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
    public_reply_variants: original.public_reply_variants,
    welcome_text: original.welcome_text,
    welcome_text_variants: original.welcome_text_variants,
    welcome_button_label: original.welcome_button_label,
    reply_type: original.reply_type,
    reply_text: original.reply_text,
    reply_image_url: original.reply_image_url,
    reply_buttons: original.reply_buttons,
    delay_seconds: original.delay_seconds,
    priority: original.priority,
    ...copyFollowGateColumns(original),
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

  // "layout": as contagens das abas moram no layout de /rules.
  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");
  return { id: data.id as string };
}
