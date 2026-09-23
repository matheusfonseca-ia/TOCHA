import { describe, expect, it } from "vitest";

import { cloneGraphWithFreshIds } from "@/lib/sequences/clone";
import { OUT_HANDLE, buttonHandle, quickReplyHandle, QR_FALLBACK_HANDLE } from "@/types/sequence";
import type { SequenceGraph } from "@/types/sequence";

function buildGraph(): SequenceGraph {
  return {
    nodes: [
      {
        id: "trigger-abc123",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { anyMessage: false, keyword: "preço", matchType: "contains" },
      },
      {
        id: "buttons-def456",
        type: "buttons",
        position: { x: 200, y: 0 },
        data: {
          text: "Escolha uma opção",
          buttons: [
            { title: "Sim", kind: "branch", url: "" },
            { title: "Site", kind: "url", url: "https://exemplo.com" },
          ],
        },
      },
      {
        id: "quick-ghi789",
        type: "quickReplies",
        position: { x: 400, y: 0 },
        data: { text: "Qual?", options: ["A", "B"] },
      },
      {
        id: "message-jkl012",
        type: "message",
        position: { x: 600, y: 0 },
        data: { kind: "text", text: "Fim do fluxo A", imageUrl: "" },
      },
      {
        id: "message-mno345",
        type: "message",
        position: { x: 600, y: 100 },
        data: { kind: "text", text: "Fim do fluxo B", imageUrl: "" },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "trigger-abc123",
        sourceHandle: OUT_HANDLE,
        target: "buttons-def456",
      },
      {
        id: "edge-2",
        source: "buttons-def456",
        sourceHandle: buttonHandle(0),
        target: "quick-ghi789",
      },
      {
        id: "edge-3",
        source: "quick-ghi789",
        sourceHandle: quickReplyHandle(0),
        target: "message-jkl012",
      },
      {
        id: "edge-4",
        source: "quick-ghi789",
        sourceHandle: QR_FALLBACK_HANDLE,
        target: "message-mno345",
      },
    ],
  };
}

describe("cloneGraphWithFreshIds", () => {
  it("gera ids novos para todos os nós e arestas", () => {
    const original = buildGraph();
    const clone = cloneGraphWithFreshIds(original);

    const originalNodeIds = new Set(original.nodes.map((n) => n.id));
    const originalEdgeIds = new Set(original.edges.map((e) => e.id));

    for (const node of clone.nodes) {
      expect(originalNodeIds.has(node.id)).toBe(false);
    }
    for (const edge of clone.edges) {
      expect(originalEdgeIds.has(edge.id)).toBe(false);
    }

    // ids novos são únicos entre si
    expect(new Set(clone.nodes.map((n) => n.id)).size).toBe(clone.nodes.length);
    expect(new Set(clone.edges.map((e) => e.id)).size).toBe(clone.edges.length);
  });

  it("preserva as conexões (source/target remapeados), incluindo btn-i e qr-i", () => {
    const original = buildGraph();
    const clone = cloneGraphWithFreshIds(original);

    const idByOldIndex = (oldIndex: number) => original.nodes[oldIndex].id;
    const newIdFor = (oldId: string) => {
      const oldIndex = original.nodes.findIndex((n) => n.id === oldId);
      return clone.nodes[oldIndex].id;
    };

    // trigger -> buttons (handle padrão)
    const triggerToButtons = clone.edges.find(
      (e) => e.source === newIdFor(idByOldIndex(0))
    );
    expect(triggerToButtons?.target).toBe(newIdFor(idByOldIndex(1)));
    expect(triggerToButtons?.sourceHandle).toBe(OUT_HANDLE);

    // buttons -[btn-0]-> quickReplies
    const buttonsToQuick = clone.edges.find(
      (e) => e.source === newIdFor(idByOldIndex(1))
    );
    expect(buttonsToQuick?.sourceHandle).toBe(buttonHandle(0));
    expect(buttonsToQuick?.target).toBe(newIdFor(idByOldIndex(2)));

    // quickReplies -[qr-0]-> message A e -[qr-fallback]-> message B
    const quickEdges = clone.edges.filter(
      (e) => e.source === newIdFor(idByOldIndex(2))
    );
    expect(quickEdges).toHaveLength(2);
    const qr0 = quickEdges.find((e) => e.sourceHandle === quickReplyHandle(0));
    const qrFallback = quickEdges.find(
      (e) => e.sourceHandle === QR_FALLBACK_HANDLE
    );
    expect(qr0?.target).toBe(newIdFor(idByOldIndex(3)));
    expect(qrFallback?.target).toBe(newIdFor(idByOldIndex(4)));
  });

  it("não muta o grafo original", () => {
    const original = buildGraph();
    const snapshot = JSON.parse(JSON.stringify(original));

    cloneGraphWithFreshIds(original);

    expect(original).toEqual(snapshot);
  });

  it("copia os dados dos nós em profundidade (alterar a cópia não afeta o original)", () => {
    const original = buildGraph();
    const clone = cloneGraphWithFreshIds(original);

    const clonedButtons = clone.nodes.find((n) => n.type === "buttons");
    expect(clonedButtons).toBeDefined();
    // Muta a cópia diretamente.
    (clonedButtons!.data as { buttons: { title: string }[] }).buttons[0].title =
      "Alterado";

    const originalButtons = original.nodes.find((n) => n.type === "buttons");
    expect(
      (originalButtons!.data as { buttons: { title: string }[] }).buttons[0]
        .title
    ).toBe("Sim");
  });
});
