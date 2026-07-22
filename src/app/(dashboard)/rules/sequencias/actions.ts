"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_NODES,
  validateSequenceGraph,
} from "@/lib/sequences/graph";
import { createClient } from "@/lib/supabase/server";
import type { SequenceGraph } from "@/types/sequence";

const positionSchema = z.object({ x: z.number(), y: z.number() });

const nodeBase = { id: z.string().min(1).max(64), position: positionSchema };

const nodeSchema = z.discriminatedUnion("type", [
  z.object({
    ...nodeBase,
    type: z.literal("trigger"),
    data: z.object({
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
  /** Id da sequência salva (para o editor continuar na mesma página). */
  id?: string;
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
  const graphError = validateSequenceGraph(graph);
  if (graphError) return { error: graphError };

  const supabase = createClient();
  const row = {
    account_id: input.account_id,
    name: input.name,
    graph,
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
  return { id: data.id as string };
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
  return {};
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
