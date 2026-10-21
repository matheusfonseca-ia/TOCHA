import { describe, expect, it } from "vitest";

import type { SequenceGraph } from "@/types/sequence";

import {
  countLabel,
  ruleTitle,
  ruleTriggerLine,
  sequenceBlockCount,
  sequenceTriggerLine,
} from "../utils/display";

const dmRule = {
  name: null,
  keyword: "preço",
  trigger_type: "dm" as const,
  match_type: "contains" as const,
  reply_type: "text" as const,
  comment_any_word: false,
};

function graph(triggerData: Record<string, unknown>, extraNodes = 0): SequenceGraph {
  const nodes = [
    { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: triggerData },
    ...Array.from({ length: extraNodes }, (_, i) => ({
      id: `n${i}`,
      type: "message",
      position: { x: 0, y: 0 },
      data: {},
    })),
  ];
  return { nodes, edges: [] } as unknown as SequenceGraph;
}

describe("ruleTitle", () => {
  it("usa o nome, depois a palavra-chave, depois um padrão", () => {
    expect(ruleTitle({ ...dmRule, name: "  Preço do curso " })).toBe("Preço do curso");
    expect(ruleTitle(dmRule)).toBe("preço");
    expect(ruleTitle({ ...dmRule, trigger_type: "comment", keyword: null })).toBe(
      "Qualquer comentário"
    );
    expect(ruleTitle({ ...dmRule, keyword: null })).toBe("Sem nome");
  });
});

describe("ruleTriggerLine", () => {
  it("DM: tipo, match com a palavra e o tipo de resposta", () => {
    expect(ruleTriggerLine(dmRule)).toBe("DM · Contém “preço” · Texto");
    expect(ruleTriggerLine({ ...dmRule, match_type: "exact", reply_type: "image" })).toBe(
      "DM · Exatamente “preço” · Imagem"
    );
  });

  it("comentário com qualquer palavra ignora a palavra-chave", () => {
    expect(
      ruleTriggerLine({
        ...dmRule,
        trigger_type: "comment",
        comment_any_word: true,
        reply_type: "buttons",
      })
    ).toBe("Comentário · Qualquer comentário · Botões");
  });

  it("comentário com palavra e DM sem palavra", () => {
    expect(
      ruleTriggerLine({ ...dmRule, trigger_type: "comment", match_type: "starts_with" })
    ).toBe("Comentário · Começa com “preço” · Texto");
    expect(ruleTriggerLine({ ...dmRule, keyword: "  " })).toBe(
      "DM · Sem palavra-chave · Texto"
    );
  });
});

describe("workflow", () => {
  it("conta os blocos sem o gatilho", () => {
    expect(sequenceBlockCount({ graph: graph({ source: "dm" }, 4) })).toBe(4);
    expect(sequenceBlockCount({ graph: { nodes: [], edges: [] } })).toBe(0);
  });

  it("resume o gatilho e os blocos", () => {
    expect(
      sequenceTriggerLine({
        graph: graph({ source: "dm", anyMessage: true, keyword: "", matchType: "contains" }, 1),
      })
    ).toBe("Gatilho: Qualquer mensagem · 1 bloco");
    expect(
      sequenceTriggerLine({
        graph: graph({ source: "storyMention", anyMessage: false, keyword: "", matchType: "contains" }, 3),
      })
    ).toBe("Gatilho: Menção em story · 3 blocos");
  });
});

describe("countLabel", () => {
  it("singular só no 1", () => {
    expect(countLabel(0, "execução", "execuções")).toBe("0 execuções");
    expect(countLabel(1, "execução", "execuções")).toBe("1 execução");
    expect(countLabel(2, "execução", "execuções")).toBe("2 execuções");
  });
});
