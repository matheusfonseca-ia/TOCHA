"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { normalizeText } from "@/lib/rules/engine";
import { cloneGraphWithFreshIds } from "@/lib/sequences/clone";
import {
  automationRuleIdsOf,
  entryRuleIdOf,
  findTriggerNode,
  MAX_NODES,
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
      source: z.enum(["dm", "automation"]).optional(),
      anyMessage: z.boolean(),
      keyword: z.string().max(200),
      matchType: z.enum(["exact", "contains", "starts_with"]),
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
  id: z.string().uuid().optional(),
  account_id: z.string().uuid("Selecione uma conta."),
  name: z.string().trim().min(1, "Dê um nome à sequência.").max(80),
  is_active: z.boolean(),
  graph: graphSchema,
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
}

type ConflictCandidate = { id: string; name: string; graph: SequenceGraph };

/**
 * Procura outra sequência ativa da mesma conta cujo gatilho colide com o de
 * `graph`: mesma palavra-chave, ou ambas em "qualquer mensagem".
 */
async function findConflictingSequenceName(
  supabase: ReturnType<typeof createClient>,
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
    return normalizeText(triggerData.keyword) === normalizeText(otherData.keyword);
  });

  return conflict?.name ?? null;
}

export async function saveSequence(
  raw: SequenceInput
): Promise<SequenceActionResult> {
  const parsed = sequenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const input = parsed.data;

  const graph = input.graph as SequenceGraph;
  const supabase = createClient();

  // Automações referenciadas pelo grafo: o validador precisa do tipo e da
  // conta de cada uma (rule de comentário só vale como entrada, e nunca de
  // outra conta). RLS limita a busca às rules do usuário.
  const ruleIds = automationRuleIdsOf(graph);
  const { data: ruleRefs } = ruleIds.length
    ? await supabase
        .from("rules")
        .select("id, trigger_type, account_id")
        .in("id", ruleIds)
    : { data: [] };
  const graphError = validateSequenceGraph(graph, {
    accountId: input.account_id,
    rulesById: new Map((ruleRefs ?? []).map((r) => [r.id, r])),
  });
  if (graphError) return { error: graphError };

  const row = {
    account_id: input.account_id,
    name: input.name,
    graph,
    entry_rule_id: entryRuleIdOf(graph),
    is_active: input.is_active,
    updated_at: new Date().toISOString(),
  };

  // RLS garante que account_id / sequence pertencem ao usuário logado.
  const { data, error } = input.id
    ? await supabase
        .from("sequences")
        .update(row)
        .eq("id", input.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("sequences").insert(row).select("id").maybeSingle();

  if (error || !data) {
    return { error: "Não foi possível salvar a sequência. Tente novamente." };
  }

  revalidatePath("/rules/sequencias");
  revalidatePath("/dashboard");

  const id = data.id as string;
  const warning = input.is_active
    ? ((await findConflictingSequenceName(supabase, {
        id,
        account_id: input.account_id,
        graph,
      })) ?? undefined)
    : undefined;

  return warning ? { id, warning } : { id };
}

export async function toggleSequence(
  id: string,
  isActive: boolean
): Promise<SequenceActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: "Não foi possível atualizar a sequência." };

  revalidatePath("/rules/sequencias");

  if (!isActive) return {};

  const { data: sequence } = await supabase
    .from("sequences")
    .select("account_id, graph")
    .eq("id", id)
    .maybeSingle();
  if (!sequence) return {};

  const warning =
    (await findConflictingSequenceName(supabase, {
      id,
      account_id: sequence.account_id,
      graph: sequence.graph as SequenceGraph,
    })) ?? undefined;

  return warning ? { warning } : {};
}

export async function deleteSequence(id: string): Promise<SequenceActionResult> {
  const supabase = createClient();
  // As execuções (sequence_runs) caem junto via ON DELETE CASCADE.
  const { error } = await supabase.from("sequences").delete().eq("id", id);

  if (error) return { error: "Não foi possível excluir a sequência." };

  revalidatePath("/rules/sequencias");
  revalidatePath("/dashboard");
  return {};
}

const SEQUENCE_NAME_MAX = 80;

/**
 * Duplica um workflow: grafo com ids novos (`cloneGraphWithFreshIds`), não
 * copia `sequence_runs`, nasce pausado. `entry_rule_id` é derivado do
 * grafo clonado: a cópia parte da mesma automação, mas só roda quando
 * for ativada.
 */
export async function duplicateSequence(
  id: string
): Promise<SequenceActionResult> {
  const supabase = createClient();
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

  revalidatePath("/rules/sequencias");
  revalidatePath("/dashboard");
  return { id: data.id as string };
}
