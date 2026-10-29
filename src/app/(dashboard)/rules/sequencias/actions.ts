"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isExpired, validateExpiry } from "@/lib/expiry/expiry";
import { EXPIRED_SEQUENCE_ACTIVATION_ERROR } from "@/lib/expiry/guard";
import { expiryColumns, expiryFields } from "@/lib/expiry/schema";
import { keywordTerms } from "@/lib/rules/engine";
import { cloneGraphWithFreshIds } from "@/lib/sequences/clone";
import {
  automationRuleIdsOf,
  entryRuleIdOf,
  findTriggerNode,
  type GraphValidationContext,
  goToSequenceIdsOf,
  MAX_NODES,
  stageIdsOf,
  triggerSourceOf,
  validateSequenceGraph,
} from "@/lib/sequences/graph";
import { createClient } from "@/lib/supabase/server";
import type { SequenceGraph, TriggerNodeData } from "@/types/sequence";

const positionSchema = z.object({ x: z.number(), y: z.number() });

const nodeBase = { id: z.string().min(1).max(64), position: positionSchema };

const nodeSchema = z.discriminatedUnion("type", [
  z.object({
    ...nodeBase,
    type: z.literal("trigger"),
    data: z.object({
      source: z
        .enum(["unset", "dm", "automation", "storyReply", "storyMention", "refLink"])
        .optional(),
      anyMessage: z.boolean(),
      keyword: z.string().max(200),
      matchType: z.enum(["exact", "contains", "starts_with"]),
      refCode: z.string().max(120).optional(),
      // Automação escolhida direto no gatilho (source "automation"). String
      // livre: o validateSequenceGraph devolve a mensagem amigável quando
      // nenhuma automação foi escolhida.
      ruleId: z.string().max(64).optional(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("message"),
    data: z.object({
      kind: z.enum(["text", "image"]),
      text: z.string().max(1000),
      imageUrl: z.string().max(2000),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("buttons"),
    data: z.object({
      text: z.string().max(640),
      buttons: z
        .array(
          z.object({
            title: z.string().max(20),
            kind: z.enum(["url", "branch"]),
            url: z.string().max(2000),
          })
        )
        .max(3),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("quickReplies"),
    data: z.object({
      text: z.string().max(1000),
      options: z.array(z.string().max(20)).max(13),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("delay"),
    data: z.object({
      amount: z.number(),
      unit: z.enum(["seconds", "minutes", "hours"]),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("waitReply"),
    data: z.object({}),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("automation"),
    // String livre (inclusive vazia): o validateSequenceGraph devolve a
    // mensagem amigável quando nenhuma automação foi escolhida.
    data: z.object({ ruleId: z.string().max(64) }),
  }),
  // ── Dados do contato: limites finos e mensagens em validateSequenceGraph ──
  z.object({
    ...nodeBase,
    type: z.literal("collectInput"),
    data: z.object({
      question: z.string().max(1000),
      fieldKey: z.string().max(40),
      inputType: z.enum(["text", "email", "phone", "number", "date"]),
      errorText: z.string().max(640),
      maxAttempts: z.number().int(),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("condition"),
    data: z.object({
      fieldKey: z.string().max(40),
      operator: z.enum(["equals", "contains", "exists", "gt", "lt", "hasTag", "inStage"]),
      value: z.string().max(500),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("setField"),
    data: z.object({
      mode: z.enum(["field", "tag"]),
      fieldKey: z.string().max(40),
      value: z.string().max(500),
      tagAction: z.enum(["add", "remove"]).optional(),
    }),
  }),
  // ── Extras ──
  z.object({
    ...nodeBase,
    type: z.literal("randomizer"),
    data: z.object({
      branches: z
        .array(
          z.object({
            label: z.string().max(40),
            weight: z.number(),
          })
        )
        .min(2)
        .max(5),
    }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("goToSequence"),
    data: z.object({ sequenceId: z.string().max(64) }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("stopAutomation"),
    data: z.object({ hours: z.number() }),
  }),
  z.object({
    ...nodeBase,
    type: z.literal("moveToStage"),
    data: z.object({ stageId: z.string().max(64) }),
  }),
]);

const graphSchema = z.object({
  nodes: z.array(nodeSchema).max(MAX_NODES),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(96),
        source: z.string().min(1).max(64),
        sourceHandle: z.string().max(64).nullable(),
        target: z.string().min(1).max(64),
      })
    )
    .max(200),
});

const sequenceSchema = z.object({
  id: z.guid().optional(),
  account_id: z.guid("Selecione uma conta."),
  name: z.string().trim().min(1, "Dê um nome à sequência.").max(80),
  is_active: z.boolean(),
  graph: graphSchema,
  /**
   * `updated_at` do workflow quando o editor abriu: se mudou desde então
   * (outra aba, outra pessoa), o save é recusado em vez de sobrescrever.
   */
  expected_updated_at: z.string().max(64).optional(),
  ...expiryFields,
});

export type SequenceInput = z.input<typeof sequenceSchema>;

export interface SequenceActionResult {
  error?: string;
  /** Id da sequência salva/duplicada (para o editor continuar na mesma página). */
  id?: string;
  /**
   * Aviso não bloqueante: outro workflow ativo já dispara pela mesma
   * palavra-chave (ou por qualquer mensagem). Salva/ativa normalmente,
   * só avisa.
   */
  warning?: string;
  /** O workflow foi alterado em outro lugar desde que o editor abriu. */
  conflict?: boolean;
}

const SEQUENCE_EDIT_CONFLICT_ERROR =
  "Este workflow foi alterado em outra aba ou por outra pessoa depois que você abriu o editor. Recarregue a página para ver a versão atual antes de salvar.";
const SEQUENCE_ACCOUNT_CHANGE_ERROR =
  "A conta de um workflow já criado não pode ser trocada (há execuções em andamento ligadas a ela). Duplique o workflow para usar em outra conta.";

/**
 * Confere as referências do grafo (automações, workflows de destino, etapas)
 * no banco e roda a validação completa. Usado no save e ao reativar: um
 * workflow pausado pode ter ficado com referência apagada nesse meio tempo.
 */
async function validateGraphReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  graph: SequenceGraph,
  accountId: string,
  selfSequenceId: string | undefined
): Promise<string | null> {
  const ruleIds = automationRuleIdsOf(graph);
  const targetSequenceIds = goToSequenceIdsOf(graph);
  const stageIds = stageIdsOf(graph);

  // Independentes entre si: em paralelo (antes eram 3 idas em série).
  const [{ data: ruleRefs }, { data: sequenceRefs }, { data: stageRefs }] = await Promise.all([
    // Automações referenciadas pelo grafo: o validador precisa do tipo e da
    // conta de cada uma (rule de comentário só vale como entrada, e nunca de
    // outra conta). RLS limita a busca às rules do usuário.
    ruleIds.length
      ? supabase.from("rules").select("id, trigger_type, account_id").in("id", ruleIds)
      : Promise.resolve({ data: [] as { id: string; trigger_type: string; account_id: string }[] }),
    // Workflows referenciados por nós "Ir para workflow": id + conta, pra
    // checar existência e que são da mesma conta.
    targetSequenceIds.length
      ? supabase.from("sequences").select("id, account_id").in("id", targetSequenceIds)
      : Promise.resolve({ data: [] as { id: string; account_id: string }[] }),
    // Etapas referenciadas ("Mover para etapa" e Condição "está na etapa"):
    // id + conta do funil (via join), pra checar existência e posse.
    stageIds.length
      ? supabase.from("pipeline_stages").select("id, pipelines!inner(account_id)").in("id", stageIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const stagesById = new Map(
    ((stageRefs ?? []) as unknown as { id: string; pipelines: { account_id: string } | null }[]).map((s) => [
      s.id,
      { id: s.id, account_id: s.pipelines?.account_id ?? "" },
    ])
  );

  return validateSequenceGraph(graph, {
    accountId,
    rulesById: new Map(
      ((ruleRefs ?? []) as { id: string; trigger_type: string; account_id: string }[]).map((r) => [r.id, r])
    ) as NonNullable<GraphValidationContext["rulesById"]>,
    sequencesById: new Map(
      ((sequenceRefs ?? []) as { id: string; account_id: string }[]).map((s) => [s.id, s])
    ),
    selfSequenceId,
    stagesById,
  });
}

type ConflictCandidate = { id: string; name: string; graph: SequenceGraph };

/**
 * Procura outra sequência ativa da mesma conta cujo gatilho colide com o de
 * `graph`: mesma palavra-chave, ou ambas em "qualquer mensagem".
 */
async function findConflictingSequenceName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { id?: string; account_id: string; graph: SequenceGraph }
): Promise<string | null> {
  const trigger = findTriggerNode(params.graph);
  if (!trigger) return null;
  const triggerData = trigger.data as TriggerNodeData;
  const entryRuleId = entryRuleIdOf(params.graph);

  let query = supabase
    .from("sequences")
    .select("id, name, graph")
    .eq("account_id", params.account_id)
    .eq("is_active", true);
  if (params.id) query = query.neq("id", params.id);

  const { data } = await query;
  const candidates = (data ?? []) as ConflictCandidate[];

  const terms = new Set(keywordTerms(triggerData.keyword));
  const conflict = candidates.find((c) => {
    // Gatilho por automação: só colide com outro workflow que parte da
    // mesma automação (o runtime roda apenas o mais antigo).
    if (entryRuleId || triggerSourceOf(c.graph) === "automation") {
      return !!entryRuleId && entryRuleIdOf(c.graph) === entryRuleId;
    }
    const otherTrigger = findTriggerNode(c.graph);
    if (!otherTrigger) return false;
    const otherData = otherTrigger.data as TriggerNodeData;
    if (triggerData.anyMessage || otherData.anyMessage) {
      return triggerData.anyMessage && otherData.anyMessage;
    }
    return keywordTerms(otherData.keyword).some((t) => terms.has(t));
  });

  if (conflict) {
    return entryRuleId
      ? `O workflow "${conflict.name}" também começa por esta automação. Só o mais antigo roda.`
      : `O workflow "${conflict.name}" também está ativo com a mesma palavra-chave. Só o mais antigo roda.`;
  }

  // Automação de DM ativa com termo em comum sempre responde primeiro: o
  // workflow só iniciaria quando ela já tiver respondido a pessoa antes.
  if (entryRuleId || triggerData.anyMessage || terms.size === 0) return null;
  const { data: rules } = await supabase
    .from("rules")
    .select("name, keyword")
    .eq("account_id", params.account_id)
    .eq("trigger_type", "dm")
    .eq("is_active", true);
  const rule = (rules ?? []).find((r) =>
    keywordTerms(r.keyword).some((t) => terms.has(t))
  );
  if (!rule) return null;
  return `A automação "${rule.name || rule.keyword}" responde a mesma palavra-chave e tem prioridade. O workflow só inicia para quem já recebeu a resposta dela.`;
}

export async function saveSequence(
  raw: SequenceInput
): Promise<SequenceActionResult> {
  const parsed = sequenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  const expiryError = validateExpiry(input.expires_at);
  if (expiryError) return { error: expiryError };

  const graph = input.graph as SequenceGraph;
  const supabase = await createClient();

  // Workflow existente (RLS: só do usuário) + validação das referências, em paralelo.
  const [existingResult, graphError] = await Promise.all([
    input.id
      ? supabase
          .from("sequences")
          .select("account_id, updated_at, expires_at")
          .eq("id", input.id)
          .maybeSingle<{ account_id: string; updated_at: string; expires_at: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    validateGraphReferences(supabase, graph, input.account_id, input.id),
  ]);
  const existing = existingResult.data;

  if (input.id) {
    if (existingResult.error) {
      return { error: "Não foi possível salvar a sequência. Tente novamente." };
    }
    if (!existing) return { error: "Workflow não encontrado." };
    // Runs em andamento pertencem à conta original: trocar a conta faria o
    // fluxo continuar com o token de outro @ (N-06).
    if (existing.account_id !== input.account_id) {
      return { error: SEQUENCE_ACCOUNT_CHANGE_ERROR };
    }
    if (input.expected_updated_at && existing.updated_at !== input.expected_updated_at) {
      return { error: SEQUENCE_EDIT_CONFLICT_ERROR, conflict: true };
    }
    if (input.is_active && input.expires_at === undefined && isExpired(existing.expires_at)) {
      return { error: EXPIRED_SEQUENCE_ACTIVATION_ERROR };
    }
  }
  if (graphError) return { error: graphError };

  const row = {
    account_id: input.account_id,
    name: input.name,
    graph,
    entry_rule_id: entryRuleIdOf(graph),
    is_active: input.is_active,
    ...expiryColumns(input),
    updated_at: new Date().toISOString(),
  };

  // RLS garante que account_id / sequence pertencem ao usuário logado. No
  // update, conta e updated_at entram no próprio WHERE: um save concorrente
  // entre a leitura acima e esta escrita também é detectado.
  let data: { id: string } | null = null;
  let error: unknown = null;
  if (input.id && existing) {
    const result = await supabase
      .from("sequences")
      .update(row)
      .eq("id", input.id)
      .eq("account_id", existing.account_id)
      .eq("updated_at", existing.updated_at)
      .select("id")
      .maybeSingle();
    data = result.data;
    error = result.error;
    if (!error && !data) {
      return { error: SEQUENCE_EDIT_CONFLICT_ERROR, conflict: true };
    }
  } else {
    const result = await supabase.from("sequences").insert(row).select("id").maybeSingle();
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    return { error: "Não foi possível salvar a sequência. Tente novamente." };
  }

  // "layout": criar workflow muda a contagem das abas (layout das telas com abas).
  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");

  const id = data.id as string;

  // Snapshot pro histórico de versões do editor (com a poda das antigas) e
  // checagem de conflito de gatilho, em paralelo. O histórico é auxiliar
  // (não é a fonte de verdade): erro aqui não falha o save principal.
  const [, warningText] = await Promise.all([
    saveVersionSnapshot(supabase, id, input.account_id, input.name, graph, input.is_active),
    input.is_active
      ? findConflictingSequenceName(supabase, { id, account_id: input.account_id, graph })
      : Promise.resolve(null),
  ]);
  const warning = warningText ?? undefined;

  return warning ? { id, warning } : { id };
}

/** Versão pro histórico do editor; poda pra manter só as 30 mais recentes por sequência. */
async function saveVersionSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sequenceId: string,
  accountId: string,
  name: string,
  graph: SequenceGraph,
  isActive: boolean
): Promise<void> {
  const { error: versionError } = await supabase.from("sequence_versions").insert({
    sequence_id: sequenceId,
    account_id: accountId,
    name,
    graph,
    is_active: isActive,
  });
  if (versionError) return;
  const { data: staleVersions } = await supabase
    .from("sequence_versions")
    .select("id")
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: false })
    .range(30, 1000);
  if (staleVersions && staleVersions.length > 0) {
    await supabase
      .from("sequence_versions")
      .delete()
      .in("id", staleVersions.map((v) => v.id));
  }
}
export async function toggleSequence(
  id: string,
  isActive: boolean
): Promise<SequenceActionResult> {
  const supabase = await createClient();

  // Reativar revalida o grafo como no save (N-10): enquanto pausado, uma
  // automação, etapa ou workflow de destino pode ter sido apagado, e cada
  // pessoa que entrasse daria erro.
  let current: { account_id: string; graph: SequenceGraph } | null = null;
  if (isActive) {
    const { data: sequence } = await supabase
      .from("sequences")
      .select("account_id, graph, expires_at")
      .eq("id", id)
      .maybeSingle<{ account_id: string; graph: SequenceGraph; expires_at: string | null }>();
    if (!sequence) return { error: "Workflow não encontrado." };
    if (isExpired(sequence.expires_at)) {
      return { error: EXPIRED_SEQUENCE_ACTIVATION_ERROR };
    }
    const graphError = await validateGraphReferences(supabase, sequence.graph, sequence.account_id, id);
    if (graphError) {
      return { error: `Corrija o workflow antes de ativar: ${graphError}` };
    }
    current = sequence;
  }

  const { error } = await supabase
    .from("sequences")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: "Não foi possível atualizar a sequência." };

  revalidatePath("/rules/sequencias");

  if (!current) return {};

  const warning =
    (await findConflictingSequenceName(supabase, {
      id,
      account_id: current.account_id,
      graph: current.graph,
    })) ?? undefined;

  return warning ? { warning } : {};
}

export async function deleteSequence(id: string): Promise<SequenceActionResult> {
  const supabase = await createClient();
  // As execuções (sequence_runs) caem junto via ON DELETE CASCADE.
  const { error } = await supabase.from("sequences").delete().eq("id", id);

  if (error) return { error: "Não foi possível excluir a sequência." };

  // "layout": as contagens das abas moram no layout de /rules.
  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");
  return {};
}

const SEQUENCE_NAME_MAX = 80;

/**
 * Duplica um workflow: grafo com ids novos (`cloneGraphWithFreshIds`), não
 * copia `sequence_runs`, nasce pausado. `entry_rule_id` é derivado do
 * grafo clonado: a cópia parte da mesma automação, mas só roda quando
 * for ativada. Não copia a expiração: a cópia nasce permanente.
 */
export async function duplicateSequence(
  id: string
): Promise<SequenceActionResult> {
  const supabase = await createClient();
  const { data: original, error: fetchError } = await supabase
    .from("sequences")
    .select("account_id, name, graph")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !original) {
    return { error: "Não foi possível encontrar a sequência para duplicar." };
  }

  const name = `Cópia de ${original.name}`.slice(0, SEQUENCE_NAME_MAX);
  const graph = cloneGraphWithFreshIds(original.graph as SequenceGraph);

  const row = {
    account_id: original.account_id,
    name,
    graph,
    entry_rule_id: entryRuleIdOf(graph),
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("sequences")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível duplicar a sequência. Tente novamente." };
  }

  revalidatePath("/rules", "layout");
  revalidatePath("/dashboard");
  return { id: data.id as string };
}
