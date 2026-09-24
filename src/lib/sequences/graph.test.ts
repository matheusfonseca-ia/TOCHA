import { describe, expect, it } from "vitest";

import {
  automationRuleIdsOf,
  entryRuleIdOf,
  findCyclesWithoutWait,
  goToSequenceIdsOf,
  sourceHandlesOf,
  triggerSourceOf,
  triggerSummary,
  validateSequenceGraph,
  type AutomationRuleRef,
} from "@/lib/sequences/graph";
import {
  buttonHandle,
  OUT_HANDLE,
  quickReplyHandle,
  randomizerHandle,
  type SequenceGraph,
  type SequenceGraphEdge,
  type SequenceGraphNode,
  type SequenceNodeData,
  type SequenceNodeType,
  type TriggerNodeData,
} from "@/types/sequence";

// ── Construtores de grafo ───────────────────────────────────────────────────

function node(
  id: string,
  type: SequenceNodeType,
  data: SequenceNodeData
): SequenceGraphNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function edge(source: string, target: string, handle = OUT_HANDLE): SequenceGraphEdge {
  return { id: `${source}-${handle}-${target}`, source, sourceHandle: handle, target };
}

const trigger = (data: Partial<TriggerNodeData> = {}) =>
  node("t", "trigger", {
    anyMessage: false,
    keyword: "preço",
    matchType: "contains",
    ...data,
  });
const msg = (id: string) => node(id, "message", { kind: "text", text: "oi", imageUrl: "" });
const waitReply = (id: string) => node(id, "waitReply", {});
const delay = (id: string, amount = 1, unit: "seconds" | "minutes" | "hours" = "minutes") =>
  node(id, "delay", { amount, unit });
const urlButtons = (id: string) =>
  node(id, "buttons", {
    text: "veja",
    buttons: [{ title: "Site", kind: "url", url: "https://falow.app" }],
  });
const branchButtons = (id: string) =>
  node(id, "buttons", {
    text: "escolha",
    buttons: [{ title: "Sim", kind: "branch", url: "" }],
  });
const quickReplies = (id: string) =>
  node(id, "quickReplies", { text: "qual?", options: ["A"] });
const automation = (id: string, ruleId: string) => node(id, "automation", { ruleId });
const randomizer = (id: string, branches = [{ label: "A", weight: 50 }, { label: "B", weight: 50 }]) =>
  node(id, "randomizer", { branches });
const goToSequence = (id: string, sequenceId: string) =>
  node(id, "goToSequence", { sequenceId });
const stopAutomation = (id: string, hours = 24) => node(id, "stopAutomation", { hours });

// ── Ciclos ──────────────────────────────────────────────────────────────────

describe("findCyclesWithoutWait", () => {
  it("retorna [] para fluxo linear", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), msg("b")],
      edges: [edge("t", "a"), edge("a", "b")],
    };
    expect(findCyclesWithoutWait(graph)).toEqual([]);
  });

  it("acha ciclo só de mensagens (inclusive botões só de link)", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), urlButtons("b"), msg("c")],
      edges: [edge("t", "a"), edge("a", "b"), edge("b", "c"), edge("c", "a")],
    };
    expect(findCyclesWithoutWait(graph).sort()).toEqual(["a", "b", "c"]);
  });

  it.each([
    ["esperar resposta", waitReply("w")],
    ["atraso de 1 hora", delay("w", 1, "hours")],
    ["respostas rápidas", quickReplies("w")],
    ["botões com ramificação", branchButtons("w")],
  ])("permite ciclo que passa por %s", (_, waitNode) => {
    const handle =
      waitNode.type === "buttons"
        ? buttonHandle(0)
        : waitNode.type === "quickReplies"
          ? quickReplyHandle(0)
          : OUT_HANDLE;
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), waitNode],
      edges: [edge("t", "a"), edge("a", "w"), edge("w", "a", handle)],
    };
    expect(findCyclesWithoutWait(graph)).toEqual([]);
  });

  it("atraso curto não segura um ciclo (mandaria mensagens sem parar)", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), delay("w", 5, "seconds")],
      edges: [edge("t", "a"), edge("a", "w"), edge("w", "a")],
    };
    expect(findCyclesWithoutWait(graph).sort()).toEqual(["a", "w"]);
  });

  it("devolve só os nós do ciclo sem espera, não os do ciclo com espera", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), waitReply("w"), msg("b"), msg("c")],
      edges: [
        edge("t", "a"),
        edge("a", "w"),
        edge("w", "b"),
        edge("b", "c"),
        edge("c", "b", OUT_HANDLE),
      ],
    };
    expect(findCyclesWithoutWait(graph).sort()).toEqual(["b", "c"]);
  });

  it("detecta laço de um nó para ele mesmo", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a")],
      edges: [edge("t", "a"), edge("a", "a")],
    };
    expect(findCyclesWithoutWait(graph)).toEqual(["a"]);
  });
});

describe("validateSequenceGraph: ciclos", () => {
  it("bloqueia ciclo sem espera", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), urlButtons("b")],
      edges: [edge("t", "a"), edge("a", "b"), edge("b", "a")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/ciclo sem nenhum bloco de espera/);
  });

  it("aceita ciclo com espera (menu que volta)", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), quickReplies("q")],
      edges: [
        edge("t", "a"),
        edge("a", "q"),
        edge("q", "a", quickReplyHandle(0)),
      ],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
  });
});

// ── Nó Automação ────────────────────────────────────────────────────────────

const ACCOUNT = "acc-1";
const rules = (...refs: AutomationRuleRef[]) =>
  new Map(refs.map((r) => [r.id, r]));
const dmRule: AutomationRuleRef = { id: "r-dm", trigger_type: "dm", account_id: ACCOUNT };
const commentRule: AutomationRuleRef = {
  id: "r-comment",
  trigger_type: "comment",
  account_id: ACCOUNT,
};

describe("validateSequenceGraph: nó Automação", () => {
  it("grafo legado sem source continua válido", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
    expect(triggerSummary(graph)).toBe("preço");
  });

  it("exige ruleId", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), automation("x", "")],
      edges: [edge("t", "x")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/selecione qual automação/);
  });

  it("rule de DM pode ficar no meio do fluxo", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), automation("x", dmRule.id), msg("b")],
      edges: [edge("t", "a"), edge("a", "x"), edge("x", "b")],
    };
    expect(
      validateSequenceGraph(graph, { accountId: ACCOUNT, rulesById: rules(dmRule) })
    ).toBeNull();
    expect(entryRuleIdOf(graph)).toBeNull();
  });

  it("rule de comentário como entrada (gatilho por automação) é válida", () => {
    const graph: SequenceGraph = {
      nodes: [trigger({ source: "automation" }), automation("x", commentRule.id), msg("a")],
      edges: [edge("t", "x"), edge("x", "a")],
    };
    expect(
      validateSequenceGraph(graph, { accountId: ACCOUNT, rulesById: rules(commentRule) })
    ).toBeNull();
    expect(entryRuleIdOf(graph)).toBe(commentRule.id);
    expect(triggerSummary(graph)).toBe("Quando uma automação disparar");
  });

  it("gatilho por automação dispensa palavra-chave", () => {
    const graph: SequenceGraph = {
      nodes: [
        node("t", "trigger", {
          source: "automation",
          anyMessage: false,
          keyword: "",
          matchType: "contains",
        }),
        automation("x", dmRule.id),
      ],
      edges: [edge("t", "x")],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
    expect(entryRuleIdOf(graph)).toBe(dmRule.id);
  });

  it("gatilho por automação exige um nó Automação ligado direto", () => {
    const graph: SequenceGraph = {
      nodes: [trigger({ source: "automation" }), msg("a"), automation("x", dmRule.id)],
      edges: [edge("t", "a"), edge("a", "x")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/ligue o gatilho direto/);
  });

  it("rule de comentário fora da entrada é inválida", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a"), automation("x", commentRule.id)],
      edges: [edge("t", "a"), edge("a", "x")],
    };
    expect(
      validateSequenceGraph(graph, { rulesById: rules(commentRule) })
    ).toMatch(/só pode ser o primeiro bloco/);
    // Sem contexto o grafo não sabe o tipo da rule: não bloqueia.
    expect(validateSequenceGraph(graph)).toBeNull();
  });

  it("rule de comentário ligada ao gatilho em source dm é inválida", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), automation("x", commentRule.id)],
      edges: [edge("t", "x")],
    };
    expect(
      validateSequenceGraph(graph, { rulesById: rules(commentRule) })
    ).toMatch(/só pode ser o primeiro bloco/);
  });

  it("nada pode voltar para o nó de comentário de entrada", () => {
    const graph: SequenceGraph = {
      nodes: [
        trigger({ source: "automation" }),
        automation("x", commentRule.id),
        waitReply("w"),
      ],
      edges: [edge("t", "x"), edge("x", "w"), edge("w", "x")],
    };
    expect(
      validateSequenceGraph(graph, { rulesById: rules(commentRule) })
    ).toMatch(/Nada pode voltar/);
  });

  it("rule excluída ou de outra conta é inválida", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), automation("x", "r-sumiu")],
      edges: [edge("t", "x")],
    };
    expect(validateSequenceGraph(graph, { rulesById: rules() })).toMatch(
      /Automação removida/
    );

    const other: SequenceGraph = {
      nodes: [trigger(), automation("x", "r-outra")],
      edges: [edge("t", "x")],
    };
    expect(
      validateSequenceGraph(other, {
        accountId: ACCOUNT,
        rulesById: rules({ id: "r-outra", trigger_type: "dm", account_id: "acc-2" }),
      })
    ).toMatch(/outra conta/);
  });

  it("automationRuleIdsOf lista as rules referenciadas sem repetir", () => {
    const graph: SequenceGraph = {
      nodes: [
        trigger(),
        automation("x", "r1"),
        waitReply("w"),
        automation("y", "r1"),
        automation("z", "r2"),
      ],
      edges: [edge("t", "x"), edge("x", "w"), edge("w", "y"), edge("y", "z")],
    };
    expect(automationRuleIdsOf(graph).sort()).toEqual(["r1", "r2"]);
  });
});

// ── Gatilho: "unset" e automação escolhida direto nele ──────────────────────

describe("validateSequenceGraph: gatilho unset / automação direto no gatilho", () => {
  it("source unset bloqueia salvar (workflow novo, gatilho ainda não escolhido)", () => {
    const graph: SequenceGraph = {
      nodes: [
        node("t", "trigger", {
          source: "unset",
          anyMessage: false,
          keyword: "",
          matchType: "contains",
        }),
        msg("a"),
      ],
      edges: [edge("t", "a")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/Defina o gatilho/);
  });

  it("grafo legado sem o campo source nunca é unset — continua dm", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(triggerSourceOf(graph)).toBe("dm");
    expect(validateSequenceGraph(graph)).toBeNull();
  });

  it("automação escolhida direto no gatilho (ruleId) é válida sem nenhum nó Automação", () => {
    const graph: SequenceGraph = {
      nodes: [trigger({ source: "automation", ruleId: dmRule.id }), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(
      validateSequenceGraph(graph, { accountId: ACCOUNT, rulesById: rules(dmRule) })
    ).toBeNull();
    expect(entryRuleIdOf(graph)).toBe(dmRule.id);
    expect(triggerSummary(graph)).toBe("Quando uma automação disparar");
  });

  it("rule escolhida direto no gatilho: removida ou de outra conta é inválida", () => {
    const removed: SequenceGraph = {
      nodes: [trigger({ source: "automation", ruleId: "r-sumiu" }), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(validateSequenceGraph(removed, { rulesById: rules() })).toMatch(
      /Automação removida/
    );

    const otherAccount: SequenceGraph = {
      nodes: [trigger({ source: "automation", ruleId: "r-outra" }), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(
      validateSequenceGraph(otherAccount, {
        accountId: ACCOUNT,
        rulesById: rules({ id: "r-outra", trigger_type: "dm", account_id: "acc-2" }),
      })
    ).toMatch(/outra conta/);
  });

  it("automação de comentário direto no gatilho não exige nenhum nó Automação conectado", () => {
    const graph: SequenceGraph = {
      nodes: [trigger({ source: "automation", ruleId: commentRule.id }), msg("a")],
      edges: [edge("t", "a")],
    };
    expect(
      validateSequenceGraph(graph, { accountId: ACCOUNT, rulesById: rules(commentRule) })
    ).toBeNull();
    expect(entryRuleIdOf(graph)).toBe(commentRule.id);
  });

  it("formato legado (nó Automação de entrada) continua válido quando o gatilho não tem ruleId", () => {
    // Mesmo grafo do teste "rule de comentário como entrada" acima — cobertura
    // explícita de que o formato antigo não quebrou com o gatilho novo.
    const graph: SequenceGraph = {
      nodes: [trigger({ source: "automation" }), automation("x", commentRule.id), msg("a")],
      edges: [edge("t", "x"), edge("x", "a")],
    };
    expect(
      validateSequenceGraph(graph, { accountId: ACCOUNT, rulesById: rules(commentRule) })
    ).toBeNull();
    expect(entryRuleIdOf(graph)).toBe(commentRule.id);
  });
});

// ── Nó Aleatório ──────────────────────────────────────────────────────────

describe("validateSequenceGraph: nó Aleatório", () => {
  it("2 caminhos 50/50 é válido, com um handle por caminho", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), randomizer("r"), msg("a"), msg("b")],
      edges: [
        edge("t", "r"),
        edge("r", "a", randomizerHandle(0)),
        edge("r", "b", randomizerHandle(1)),
      ],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
    const node = graph.nodes.find((n) => n.id === "r")!;
    expect(sourceHandlesOf(node)).toEqual([randomizerHandle(0), randomizerHandle(1)]);
  });

  it("menos de 2 ou mais de 5 caminhos é inválido", () => {
    const tooFew: SequenceGraph = {
      nodes: [trigger(), randomizer("r", [{ label: "A", weight: 100 }]), msg("a")],
      edges: [edge("t", "r"), edge("r", "a", randomizerHandle(0))],
    };
    expect(validateSequenceGraph(tooFew)).toMatch(/de 2 a 5 caminhos/);

    const tooMany: SequenceGraph = {
      nodes: [
        trigger(),
        randomizer(
          "r",
          Array.from({ length: 6 }, (_, i) => ({ label: `C${i}`, weight: 100 / 6 }))
        ),
      ],
      edges: [edge("t", "r")],
    };
    expect(validateSequenceGraph(tooMany)).toMatch(/de 2 a 5 caminhos/);
  });

  it("pesos que não somam 100 são inválidos", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), randomizer("r", [{ label: "A", weight: 30 }, { label: "B", weight: 30 }])],
      edges: [edge("t", "r")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/somar 100/);
  });

  it("caminho sem nome ou com peso zero é inválido", () => {
    const semNome: SequenceGraph = {
      nodes: [trigger(), randomizer("r", [{ label: "", weight: 50 }, { label: "B", weight: 50 }])],
      edges: [edge("t", "r")],
    };
    expect(validateSequenceGraph(semNome)).toMatch(/precisa de um nome/);

    const pesoZero: SequenceGraph = {
      nodes: [trigger(), randomizer("r", [{ label: "A", weight: 0 }, { label: "B", weight: 100 }])],
      edges: [edge("t", "r")],
    };
    expect(validateSequenceGraph(pesoZero)).toMatch(/maior que zero/);
  });
});

// ── Nó Ir para workflow ───────────────────────────────────────────────────

describe("validateSequenceGraph: nó Ir para workflow", () => {
  it("é terminal: sourceHandlesOf devolve []", () => {
    const n = goToSequence("g", "seq-2");
    expect(sourceHandlesOf(n)).toEqual([]);
  });

  it("sequenceId vazio é inválido", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), goToSequence("g", "")],
      edges: [edge("t", "g")],
    };
    expect(validateSequenceGraph(graph)).toMatch(/escolha o workflow de destino/i);
  });

  it("não pode apontar para o próprio workflow", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), goToSequence("g", "seq-self")],
      edges: [edge("t", "g")],
    };
    expect(
      validateSequenceGraph(graph, { selfSequenceId: "seq-self" })
    ).toMatch(/não pode apontar para o próprio workflow/);
  });

  it("com contexto: alvo inexistente ou de outra conta é inválido", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), goToSequence("g", "seq-2")],
      edges: [edge("t", "g")],
    };
    expect(
      validateSequenceGraph(graph, { sequencesById: new Map(), selfSequenceId: "seq-1" })
    ).toMatch(/não existe mais/);

    expect(
      validateSequenceGraph(graph, {
        accountId: ACCOUNT,
        sequencesById: new Map([["seq-2", { id: "seq-2", account_id: "acc-2" }]]),
        selfSequenceId: "seq-1",
      })
    ).toMatch(/outra conta/);
  });

  it("sem sequencesById (validação rápida do editor) só checa auto-referência", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), goToSequence("g", "seq-2")],
      edges: [edge("t", "g")],
    };
    expect(validateSequenceGraph(graph, { selfSequenceId: "seq-1" })).toBeNull();
  });

  it("goToSequenceIdsOf lista os ids referenciados sem repetir", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), goToSequence("g1", "seq-2"), goToSequence("g2", "seq-2")],
      edges: [edge("t", "g1")],
    };
    expect(goToSequenceIdsOf(graph)).toEqual(["seq-2"]);
  });
});

// ── Nó Pausar automações ──────────────────────────────────────────────────

describe("validateSequenceGraph: nó Pausar automações", () => {
  it("de 1 a 72 horas é válido", () => {
    const graph: SequenceGraph = {
      nodes: [trigger(), stopAutomation("s", 24), msg("a")],
      edges: [edge("t", "s"), edge("s", "a")],
    };
    expect(validateSequenceGraph(graph)).toBeNull();
  });

  it("fora de 1 a 72 horas é inválido", () => {
    const zero: SequenceGraph = {
      nodes: [trigger(), stopAutomation("s", 0)],
      edges: [edge("t", "s")],
    };
    expect(validateSequenceGraph(zero)).toMatch(/de 1 a 72 horas/);

    const acima: SequenceGraph = {
      nodes: [trigger(), stopAutomation("s", 73)],
      edges: [edge("t", "s")],
    };
    expect(validateSequenceGraph(acima)).toMatch(/de 1 a 72 horas/);
  });
});
