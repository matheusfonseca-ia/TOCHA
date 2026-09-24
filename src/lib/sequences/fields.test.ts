import { describe, expect, it } from "vitest";

import {
  collectInputNode,
  conditionNode,
  edge,
  messageNode,
  setFieldNode,
  triggerNode,
} from "@/lib/sequences/__tests__/fixtures";
import {
  dataNodesWarning,
  fieldKeysOf,
  isValidFieldKey,
  toFieldKey,
} from "@/lib/sequences/fields";
import { findCyclesWithoutWait, validateSequenceGraph } from "@/lib/sequences/graph";
import { INVALID_HANDLE, NO_HANDLE, YES_HANDLE, type SequenceGraph } from "@/types/sequence";

const linear = (...nodes: SequenceGraph["nodes"]): SequenceGraph => ({
  nodes: [triggerNode(), ...nodes],
  edges: nodes.map((n, i) => edge(i === 0 ? "trigger" : nodes[i - 1].id, n.id)),
});

describe("nome de campo", () => {
  it("aceita minúsculas, números e _ começando por letra ou número", () => {
    expect(isValidFieldKey("email")).toBe(true);
    expect(isValidFieldKey("plano_2")).toBe(true);
    expect(isValidFieldKey("a".repeat(40))).toBe(true);
  });
  it("recusa vazio, maiúsculas, espaço, acento, __ e acima de 40", () => {
    expect(isValidFieldKey("")).toBe(false);
    expect(isValidFieldKey("Email")).toBe(false);
    expect(isValidFieldKey("meu email")).toBe(false);
    expect(isValidFieldKey("cidade_são")).toBe(false);
    expect(isValidFieldKey("__attempts")).toBe(false);
    expect(isValidFieldKey("a".repeat(41))).toBe(false);
  });
  it("toFieldKey sugere um nome válido", () => {
    expect(toFieldKey("E-mail Comercial")).toBe("e_mail_comercial");
    expect(toFieldKey("Profissão")).toBe("profissao");
  });
});

describe("validateSequenceGraph com nós de dados", () => {
  it("fluxo válido passa", () => {
    expect(
      validateSequenceGraph(linear(collectInputNode("c"), setFieldNode("s"), messageNode("m")))
    ).toBeNull();
  });

  it("coletar dado exige pergunta, campo válido e tentativas de 1 a 5", () => {
    expect(validateSequenceGraph(linear(collectInputNode("c", { question: " " })))).toMatch(
      /pergunta/
    );
    expect(validateSequenceGraph(linear(collectInputNode("c", { fieldKey: "E-mail" })))).toMatch(
      /nome do campo/
    );
    expect(validateSequenceGraph(linear(collectInputNode("c", { maxAttempts: 6 })))).toMatch(
      /tentativas/
    );
    expect(
      validateSequenceGraph(linear(collectInputNode("c", { maxAttempts: 3, errorText: "" })))
    ).toMatch(/resposta inválida/);
    // Com 1 tentativa o texto de erro nunca é enviado.
    expect(
      validateSequenceGraph(linear(collectInputNode("c", { maxAttempts: 1, errorText: "" })))
    ).toBeNull();
  });

  it("condição exige campo (exceto hasTag) e valor (exceto exists)", () => {
    expect(validateSequenceGraph(linear(conditionNode("k", { fieldKey: "" })))).toMatch(/campo/);
    expect(validateSequenceGraph(linear(conditionNode("k", { value: "" })))).toMatch(/valor/);
    expect(
      validateSequenceGraph(linear(conditionNode("k", { operator: "exists", value: "" })))
    ).toBeNull();
    expect(
      validateSequenceGraph(linear(conditionNode("k", { operator: "hasTag", fieldKey: "", value: "" })))
    ).toMatch(/tag/);
  });

  it("definir campo: tag obrigatória no modo tag, campo válido no modo campo", () => {
    expect(validateSequenceGraph(linear(setFieldNode("s", { mode: "tag", value: "" })))).toMatch(
      /tag/
    );
    expect(validateSequenceGraph(linear(setFieldNode("s", { fieldKey: "x y" })))).toMatch(/campo/);
  });

  it("aceita as saídas invalid/yes/no e recusa handle inexistente", () => {
    const graph: SequenceGraph = {
      nodes: [triggerNode(), collectInputNode("c"), conditionNode("k"), messageNode("a"), messageNode("b")],
      edges: [
        edge("trigger", "c"),
        edge("c", "k"),
        edge("c", "b", INVALID_HANDLE),
        edge("k", "a", YES_HANDLE),
      ],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
    expect(
      validateSequenceGraph({ ...graph, edges: [...graph.edges, edge("k", "b", "talvez")] })
    ).toMatch(/não existe mais/);
  });

  it("coletar dado conta como espera num ciclo; condição e definir campo não", () => {
    const withCollect: SequenceGraph = {
      nodes: [triggerNode(), collectInputNode("c"), conditionNode("k")],
      edges: [edge("trigger", "c"), edge("c", "k"), edge("k", "c", NO_HANDLE)],
    };
    expect(findCyclesWithoutWait(withCollect)).toEqual([]);

    const withoutWait: SequenceGraph = {
      nodes: [triggerNode(), setFieldNode("s"), conditionNode("k")],
      edges: [edge("trigger", "s"), edge("s", "k"), edge("k", "s", NO_HANDLE)],
    };
    expect(findCyclesWithoutWait(withoutWait).sort()).toEqual(["k", "s"]);
  });
});

describe("dataNodesWarning / fieldKeysOf", () => {
  it("avisa quando a condição tem sim ou não sem ligação", () => {
    const graph = linear(conditionNode("k"));
    expect(dataNodesWarning(graph)).toMatch(/“sim” e “não”/);
    graph.nodes.push(messageNode("a"));
    graph.edges = [edge("trigger", "k"), edge("k", "a", YES_HANDLE)];
    expect(dataNodesWarning(graph)).toMatch(/“não”/);
    graph.nodes.push(messageNode("b"));
    graph.edges.push(edge("k", "b", NO_HANDLE));
    expect(dataNodesWarning(graph)).toBeNull();
  });

  it("lista os campos gravados pelo fluxo", () => {
    const graph = linear(
      collectInputNode("c", { fieldKey: "email" }),
      setFieldNode("s", { fieldKey: "plano" }),
      setFieldNode("t", { mode: "tag", fieldKey: "ignorado", value: "vip" })
    );
    expect(fieldKeysOf(graph)).toEqual(["email", "plano"]);
  });
});
