import { describe, expect, it } from "vitest";

import type { SequenceGraph } from "@/types/sequence";

import { findTagWorkflowUsage, type SequenceForTagScan } from "../utils/tag-usage";

function graph(nodes: SequenceGraph["nodes"]): SequenceGraph {
  return { nodes, edges: [] };
}

describe("findTagWorkflowUsage", () => {
  const setFieldTagNode = (value: string) => ({
    id: "n1",
    type: "setField" as const,
    position: { x: 0, y: 0 },
    data: { mode: "tag" as const, fieldKey: "", value },
  });
  const setFieldValueNode = () => ({
    id: "n2",
    type: "setField" as const,
    position: { x: 0, y: 0 },
    data: { mode: "field" as const, fieldKey: "plano", value: "pro" },
  });
  const conditionHasTagNode = (value: string) => ({
    id: "n3",
    type: "condition" as const,
    position: { x: 0, y: 0 },
    data: { fieldKey: "", operator: "hasTag" as const, value },
  });
  const conditionFieldNode = () => ({
    id: "n4",
    type: "condition" as const,
    position: { x: 0, y: 0 },
    data: { fieldKey: "plano", operator: "equals" as const, value: "pro" },
  });

  const sequences: SequenceForTagScan[] = [
    { id: "s1", name: "Workflow VIP", graph: graph([setFieldTagNode("VIP")]) },
    { id: "s2", name: "Workflow condição", graph: graph([conditionHasTagNode("vip")]) },
    { id: "s3", name: "Workflow sem tag", graph: graph([setFieldValueNode(), conditionFieldNode()]) },
    { id: "s4", name: "Workflow outra tag", graph: graph([setFieldTagNode("cliente")]) },
  ];

  it("conta sem diferenciar maiúsculas/acentos e ignora nós que não usam a tag", () => {
    const usage = findTagWorkflowUsage(sequences, "Vip");
    expect(usage.count).toBe(2);
    expect(usage.sequenceNames.sort()).toEqual(["Workflow VIP", "Workflow condição"].sort());
  });

  it("devolve zero quando nenhum workflow usa a tag", () => {
    expect(findTagWorkflowUsage(sequences, "inexistente").count).toBe(0);
  });
});
