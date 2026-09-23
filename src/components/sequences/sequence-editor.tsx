"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Hourglass,
  ListChecks,
  Maximize2,
  MessageSquareText,
  Minimize2,
  MousePointerClick,
  Plus,
  Redo2,
  Timer,
  Undo2,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import {
  saveSequence,
  type SequenceInput,
} from "@/app/(dashboard)/rules/sequencias/actions";
import { AutomationRulesProvider } from "@/components/sequences/automation";
import { findFirstInvalidNode } from "@/components/sequences/find-invalid-node";
import { SequenceConfirmDialog } from "@/components/sequences/sequence-confirm-dialog";
import { SequenceInspector, type InspectorNode } from "@/components/sequences/sequence-inspector";
import { InvalidNodeContext, sequenceNodeTypes } from "@/components/sequences/sequence-nodes";
import { SequenceRunsPanel } from "@/components/sequences/sequence-runs-panel";
import { useGraphHistory } from "@/components/sequences/use-graph-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  entryRuleIdOf,
  findCyclesWithoutWait,
  findTriggerNode,
  sourceHandlesOf,
  targetOf,
  triggerSourceOf,
  validateSequenceGraph,
} from "@/lib/sequences/graph";
import { cn } from "@/lib/utils";
import type { Rule } from "@/types/database";
import {
  OUT_HANDLE,
  type Sequence,
  type SequenceGraph,
  type SequenceGraphNode,
  type SequenceNodeData,
  type SequenceNodeType,
  type SequenceRun,
  type TriggerSource,
} from "@/types/sequence";

/**
 * Editor de sequências: canvas de blocos conectáveis (React Flow) +
 * inspector lateral. O grafo é salvo como está — o runtime do webhook
 * percorre o mesmo JSON que o canvas desenha.
 */

type FlowNode = Node<Record<string, unknown>>;

interface AccountOption {
  id: string;
  ig_username: string;
  profile_picture_url?: string | null;
}

const PALETTE: {
  type: SequenceNodeType;
  label: string;
  icon: typeof MessageSquareText;
}[] = [
  { type: "message", label: "Mensagem", icon: MessageSquareText },
  { type: "buttons", label: "Botões", icon: MousePointerClick },
  { type: "quickReplies", label: "Respostas rápidas", icon: ListChecks },
  { type: "delay", label: "Atraso", icon: Timer },
  { type: "waitReply", label: "Esperar resposta", icon: Hourglass },
  { type: "automation", label: "Automação", icon: Workflow },
];

// Largura fixa dos blocos no canvas (w-60 em sequence-nodes.tsx) e altura
// aproximada usada só como palpite inicial, antes do React Flow medir o nó
// de verdade — serve pra posicionar/evitar sobreposição no primeiro frame.
const NODE_WIDTH = 240;
const FALLBACK_NODE_HEIGHT = 110;
const NODE_GAP_X = 300;
const OVERLAP_GAP_Y = 24;
// Debounce do histórico de undo/redo: só empilha um snapshot depois que o
// canvas fica parado por esse tanto — evita registrar cada frame de arrasto
// ou cada tecla digitada no inspector.
const HISTORY_DEBOUNCE_MS = 400;

function defaultDataFor(type: SequenceNodeType): SequenceNodeData {
  switch (type) {
    case "trigger":
      return { anyMessage: false, keyword: "", matchType: "contains" };
    case "message":
      return { kind: "text", text: "", imageUrl: "" };
    case "buttons":
      return { text: "", buttons: [{ title: "", kind: "branch", url: "" }] };
    case "quickReplies":
      return { text: "", options: ["", ""] };
    case "delay":
      return { amount: 1, unit: "minutes" };
    case "waitReply":
      return {};
    case "automation":
      return { ruleId: "" };
  }
}

function newNodeId(type: string): string {
  return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFlowNodes(graph: SequenceGraph): FlowNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as Record<string, unknown>,
    deletable: n.type !== "trigger",
  }));
}

function toFlowEdges(graph: SequenceGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
  }));
}

function initialGraph(sequence?: Sequence): SequenceGraph {
  return (
    sequence?.graph ?? {
      nodes: [
        {
          id: newNodeId("trigger"),
          type: "trigger",
          position: { x: 40, y: 200 },
          data: defaultDataFor("trigger"),
        },
      ],
      edges: [],
    }
  );
}

/** Um nó do canvas no formato do grafo salvo. */
function toGraphNode(n: FlowNode): SequenceGraphNode {
  return {
    id: n.id,
    type: (n.type ?? "message") as SequenceNodeType,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: n.data as unknown as SequenceNodeData,
  };
}

/** Converte o estado do canvas de volta para o formato salvo, descartando
 *  conexões órfãs (bloco removido ou botão/opção que deixou de existir). */
function serializeGraph(nodes: FlowNode[], edges: Edge[]): SequenceGraph {
  const graphNodes: SequenceGraphNode[] = nodes.map(toGraphNode);

  const byId = new Map(graphNodes.map((n) => [n.id, n]));
  const graphEdges = edges
    .filter((e) => {
      const source = byId.get(e.source);
      if (!source || !byId.has(e.target)) return false;
      return sourceHandlesOf(source).includes(e.sourceHandle ?? OUT_HANDLE);
    })
    .map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? OUT_HANDLE,
      target: e.target,
    }));

  return { nodes: graphNodes, edges: graphEdges };
}

/** Primeiro handle de saída do nó que ainda não tem nenhuma aresta saindo. */
function freeSourceHandle(node: FlowNode, edges: Edge[]): string | null {
  const handles = sourceHandlesOf(toGraphNode(node));
  const used = new Set(
    edges
      .filter((e) => e.source === node.id)
      .map((e) => e.sourceHandle ?? OUT_HANDLE)
  );
  return handles.find((h) => !used.has(h)) ?? null;
}

/** Empurra a posição desejada pra baixo até não sobrepor nenhum nó
 *  existente (bounding box aproximada, usando as dimensões medidas pelo
 *  React Flow quando já disponíveis). */
function findFreePosition(
  existing: FlowNode[],
  desired: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } {
  let y = desired.y;
  for (let i = 0; i < 60; i++) {
    const collides = existing.some((n) => {
      const nw = n.measured?.width ?? NODE_WIDTH;
      const nh = n.measured?.height ?? FALLBACK_NODE_HEIGHT;
      const overlapsX = desired.x < n.position.x + nw && desired.x + width > n.position.x;
      const overlapsY = y < n.position.y + nh && y + height > n.position.y;
      return overlapsX && overlapsY;
    });
    if (!collides) return { x: desired.x, y };
    y += height + OVERLAP_GAP_Y;
  }
  return { x: desired.x, y };
}

export function SequenceEditor(props: {
  accounts: AccountOption[];
  sequence?: Sequence;
  runs?: SequenceRun[];
  /** Automações (rules) de todas as contas do usuário, para o nó Automação. */
  rules?: Rule[];
}) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  accounts,
  sequence,
  runs = [],
  rules = [],
}: {
  accounts: AccountOption[];
  sequence?: Sequence;
  runs?: SequenceRun[];
  rules?: Rule[];
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView, getInternalNode } = useReactFlow();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const graph = useMemo(() => initialGraph(sequence), [sequence]);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<FlowNode>(
    toFlowNodes(graph)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    toFlowEdges(graph)
  );

  const [name, setName] = useState(sequence?.name ?? "");
  const [isActive, setIsActive] = useState(sequence?.is_active ?? true);
  const [accountId, setAccountId] = useState(
    sequence?.account_id ?? accounts[0]?.id ?? ""
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Nó "Automação" ──────────────────────────────────────────────────────
  // Só as automações da conta escolhida; a validação barra rule de outra
  // conta (ex.: depois de trocar a conta no seletor).
  const accountRules = useMemo(
    () => rules.filter((r) => r.account_id === accountId),
    [rules, accountId]
  );
  const liveGraph = useMemo(() => serializeGraph(nodes, edges), [nodes, edges]);
  const entryNodeId = useMemo(() => {
    const trigger = findTriggerNode(liveGraph);
    return trigger ? targetOf(liveGraph, trigger.id, OUT_HANDLE) : null;
  }, [liveGraph]);
  const [invalidNodeId, setInvalidNodeId] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    resolve: (ok: boolean) => void;
  } | null>(null);

  // ── Guarda de alterações não salvas ─────────────────────────────────────
  // Snapshot normalizado (mesma serialização usada ao salvar) do que está
  // gravado no banco agora — comparar com o estado atual do canvas diz se
  // há algo pra perder ao sair.
  const baseline = useMemo(
    () =>
      JSON.stringify({
        name: sequence?.name ?? "",
        isActive: sequence?.is_active ?? true,
        accountId: sequence?.account_id ?? accounts[0]?.id ?? "",
        graph: serializeGraph(toFlowNodes(graph), toFlowEdges(graph)),
      }),
    [sequence, accounts, graph]
  );
  const isDirty = useMemo(() => {
    const current = JSON.stringify({
      name,
      isActive,
      accountId,
      graph: serializeGraph(nodes, edges),
    });
    return current !== baseline;
  }, [name, isActive, accountId, nodes, edges, baseline]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    router.push("/rules/sequencias");
  }, [isDirty, router]);

  // ── Undo/Redo ────────────────────────────────────────────────────────────
  const history = useGraphHistory<FlowNode, Edge>({ nodes, edges });
  const { push: pushHistory, undo: popUndo, redo: popRedo, canUndo, canRedo } = history;
  const isDraggingRef = useRef(false);
  const suppressHistoryRef = useRef(false);
  const isFirstHistoryEffectRef = useRef(true);

  useEffect(() => {
    if (isFirstHistoryEffectRef.current) {
      isFirstHistoryEffectRef.current = false;
      return;
    }
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      return;
    }
    if (isDraggingRef.current) return;
    const timer = setTimeout(() => pushHistory({ nodes, edges }), HISTORY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [nodes, edges, pushHistory]);

  const handleUndo = useCallback(() => {
    const snapshot = popUndo();
    if (!snapshot) return;
    suppressHistoryRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setSelectedId(null);
  }, [popUndo, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const snapshot = popRedo();
    if (!snapshot) return;
    suppressHistoryRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setSelectedId(null);
  }, [popRedo, setNodes, setEdges]);

  // Intercepta o `onNodesChange` só pra saber quando um arrasto está em
  // andamento (não empilha histórico no meio dele, só quando solta).
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      for (const c of changes) {
        if (c.type === "position") {
          isDraggingRef.current = Boolean(c.dragging);
        }
      }
      onNodesChangeRaw(changes);
    },
    [onNodesChangeRaw]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditable) return;
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

  // Limpa o destaque de erro de validação assim que o grafo muda de novo —
  // o usuário já está mexendo pra corrigir.
  useEffect(() => {
    setInvalidNodeId(null);
  }, [nodes, edges]);

  // Nós com saídas dinâmicas (botões/opções) precisam avisar o React Flow
  // quando os handles mudam de quantidade/ordem. A dependência é a assinatura
  // dos handles, e não o array `nodes`: o React Flow troca `nodes` a cada
  // quadro de arrasto, então depender dele remediria o canvas inteiro ~60x/s
  // enquanto um único bloco é movido. Ids não contêm ":" nem "|".
  const handleSignature = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "buttons" || n.type === "quickReplies")
        .map((n) => `${n.id}:${sourceHandlesOf(toGraphNode(n)).join(",")}`)
        .join("|"),
    [nodes]
  );

  useEffect(() => {
    const ids = handleSignature
      .split("|")
      .filter(Boolean)
      .map((entry) => entry.slice(0, entry.indexOf(":")));
    if (ids.length > 0) updateNodeInternals(ids);
  }, [handleSignature, updateNodeInternals]);

  // Reenquadra o fluxo quando o canvas muda de tamanho (montagem e
  // entrada/saída da tela cheia) e permite sair da tela cheia com Esc.
  useEffect(() => {
    const timer = setTimeout(
      () => fitView({ padding: 0.25, maxZoom: 1 }),
      100
    );
    return () => clearTimeout(timer);
  }, [isFullscreen, fitView]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelectedId(selected[0]?.id ?? null);
    },
    []
  );

  // Cada saída (source handle) pode ter só uma conexão — conectar de novo
  // substitui a anterior, como no n8n.
  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) =>
        addEdge(
          conn,
          eds.filter(
            (e) =>
              !(
                e.source === conn.source &&
                (e.sourceHandle ?? OUT_HANDLE) ===
                  (conn.sourceHandle ?? OUT_HANDLE)
              )
          )
        )
      );
    },
    [setEdges]
  );

  // Apagar nó que tem conexão pergunta antes (Dialog); apagar aresta solta
  // (nenhum nó selecionado no lote) continua direto, sem interromper.
  const onBeforeDelete = useCallback(
    async ({ nodes: toDelete }: { nodes: FlowNode[]; edges: Edge[] }) => {
      if (toDelete.length === 0) return true;
      const hasConnection = toDelete.some((n) =>
        edges.some((e) => e.source === n.id || e.target === n.id)
      );
      if (!hasConnection) return true;
      return new Promise<boolean>((resolve) => {
        setDeleteConfirm({ resolve });
      });
    },
    [edges]
  );

  const handleDataChange = useCallback(
    (nodeId: string, data: SequenceNodeData) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: data as Record<string, unknown> } : n
        )
      );
      // Remover um botão/opção também remove a conexão que saía dele.
      setEdges((eds) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return eds;
        const handles = sourceHandlesOf({
          id: nodeId,
          type: (node.type ?? "message") as SequenceNodeType,
          position: node.position,
          data,
        });
        return eds.filter(
          (e) =>
            e.source !== nodeId ||
            handles.includes(e.sourceHandle ?? OUT_HANDLE)
        );
      });
    },
    [nodes, setNodes, setEdges]
  );

  // Bloco novo: se há um nó selecionado com saída livre, entra conectado a
  // ela (alinhado em Y com o handle de verdade, medido pelo React Flow);
  // sem seleção, mantém o comportamento anterior (à direita de tudo, na
  // altura do gatilho) — nos dois casos, empurra pra baixo se colidir com
  // um nó já existente.
  const addNode = useCallback(
    (type: SequenceNodeType) => {
      const id = newNodeId(type);
      const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

      let position: { x: number; y: number } | null = null;
      let connectFrom: { source: string; sourceHandle: string } | null = null;

      if (selected) {
        const handle = freeSourceHandle(selected, edges);
        if (handle) {
          const internal = getInternalNode(selected.id);
          const bound = internal?.internals.handleBounds?.source?.find(
            (h) => h.id === handle
          );
          const offsetY = bound ? bound.y + bound.height / 2 : FALLBACK_NODE_HEIGHT / 2;
          const selectedWidth = selected.measured?.width ?? NODE_WIDTH;
          position = {
            x: selected.position.x + selectedWidth + 60,
            y: selected.position.y + offsetY - FALLBACK_NODE_HEIGHT / 2,
          };
          connectFrom = { source: selected.id, sourceHandle: handle };
        }
      }

      if (!position) {
        const maxX = Math.max(...nodes.map((n) => n.position.x), 0);
        const triggerY = nodes.find((n) => n.type === "trigger")?.position.y ?? 200;
        position = { x: maxX + NODE_GAP_X, y: triggerY };
      }

      const finalPosition = findFreePosition(nodes, position, NODE_WIDTH, FALLBACK_NODE_HEIGHT);

      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        {
          id,
          type,
          position: finalPosition,
          data: defaultDataFor(type) as Record<string, unknown>,
          selected: true,
        },
      ]);

      if (connectFrom) {
        const { source, sourceHandle } = connectFrom;
        setEdges((eds) => [
          ...eds.filter(
            (e) => !(e.source === source && (e.sourceHandle ?? OUT_HANDLE) === sourceHandle)
          ),
          { id: `e-${source}-${id}`, source, sourceHandle, target: id },
        ]);
      }

      setSelectedId(id);
    },
    [selectedId, nodes, edges, setNodes, setEdges, getInternalNode]
  );

  const handleSave = useCallback(() => {
    setInvalidNodeId(null);
    if (!name.trim()) {
      toast.error("Dê um nome à sequência.");
      return;
    }
    if (!accountId) {
      toast.error("Selecione a conta do Instagram.");
      return;
    }
    const serialized = serializeGraph(nodes, edges);
    const graphError = validateSequenceGraph(serialized, {
      accountId,
      rulesById: new Map(accountRules.map((r) => [r.id, r])),
    });
    if (graphError) {
      toast.error(graphError);
      const badNodeId =
        findCyclesWithoutWait(serialized)[0] ?? findFirstInvalidNode(serialized);
      if (badNodeId) {
        setInvalidNodeId(badNodeId);
        fitView({ nodes: [{ id: badNodeId }], duration: 400, padding: 0.6, maxZoom: 1 });
      }
      return;
    }

    startTransition(async () => {
      const result = await saveSequence({
        id: sequence?.id,
        account_id: accountId,
        name: name.trim(),
        is_active: isActive,
        graph: serialized as SequenceInput["graph"],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isActive ? "Sequência ativada." : "Sequência salva.");
      router.push("/rules/sequencias");
      router.refresh();
    });
  }, [name, accountId, accountRules, nodes, edges, isActive, sequence?.id, router, fitView]);

  const handleTriggerSourceChange = useCallback(
    (source: TriggerSource) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.type === "trigger" ? { ...n, data: { ...n.data, source } } : n
        )
      );
    },
    [setNodes]
  );

  const selectedNode = useMemo<InspectorNode | null>(() => {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return null;
    return {
      id: node.id,
      type: (node.type ?? "message") as SequenceNodeType,
      data: node.data as unknown as SequenceNodeData,
    };
  }, [nodes, selectedId]);

  return (
    <div
      className={cn(
        "space-y-4",
        isFullscreen &&
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background p-4 md:p-6"
      )}
    >
      {/* ── Barra superior: nome, conta, status, salvar ───────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voltar para sequências"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          placeholder="Nome da sequência (ex.: Boas-vindas novos seguidores)"
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {accounts.length > 1 && (
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  @{a.ig_username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
          {sequence && (
            <SequenceRunsPanel sequenceId={sequence.id} graph={graph} initialRuns={runs} />
          )}
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <span className="text-sm text-muted-foreground">
              {isActive ? "Ativa" : "Pausada"}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen((f) => !f)}
            title={
              isFullscreen ? "Sair da tela cheia (Esc)" : "Tela cheia"
            }
            aria-label={
              isFullscreen ? "Sair da tela cheia" : "Tela cheia"
            }
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando…" : sequence ? "Salvar" : "Criar sequência"}
          </Button>
        </div>
      </div>

      {/* ── Paleta de blocos + undo/redo ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Adicionar bloco:
        </span>
        {PALETTE.map(({ type, label, icon: Icon }) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => addNode(type)}
          >
            <Plus className="h-3.5 w-3.5" />
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Canvas + inspector ────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col gap-4 lg:flex-row",
          isFullscreen && "min-h-0 flex-1"
        )}
      >
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card",
            isFullscreen
              ? "min-h-0 flex-1 lg:h-full"
              : "h-[420px] sm:h-[480px] lg:h-[calc(100vh-330px)] lg:min-h-[460px]"
          )}
        >
          <InvalidNodeContext.Provider value={invalidNodeId}>
            <AutomationRulesProvider
              rules={accountRules}
              entryRuleId={entryRuleIdOf(liveGraph)}
            >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onSelectionChange={onSelectionChange}
              nodeTypes={sequenceNodeTypes}
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.5}
              deleteKeyCode={["Backspace", "Delete"]}
              defaultEdgeOptions={{
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: "hsl(var(--success))",
                },
                style: { strokeWidth: 2, stroke: "hsl(var(--success))" },
              }}
              isValidConnection={(conn) => conn.source !== conn.target}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1.5}
                color="hsl(var(--border))"
              />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                className="hidden sm:block"
                position="bottom-right"
                pannable
                zoomable={false}
                ariaLabel="Miniatura do fluxo"
              />
            </ReactFlow>
            </AutomationRulesProvider>
          </InvalidNodeContext.Provider>
        </div>
        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4 lg:w-80",
            isFullscreen
              ? "max-h-[40vh] lg:h-full lg:max-h-none"
              : "max-h-[45vh] lg:h-[calc(100vh-330px)] lg:max-h-none lg:min-h-[460px]"
          )}
        >
          <SequenceInspector
            node={selectedNode}
            onChange={handleDataChange}
            automation={{
              rules: accountRules,
              account: accounts.find((a) => a.id === accountId) ?? null,
              entryNodeId,
              triggerSource: triggerSourceOf(liveGraph),
              onTriggerSourceChange: handleTriggerSourceChange,
            }}
          />
        </aside>
      </div>

      {/* ── Confirmações (substituem window.confirm) ──────────────────── */}
      <SequenceConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title="Sair sem salvar?"
        description="Você tem alterações não salvas nesta sequência. Elas se perdem se sair agora."
        confirmLabel="Sair sem salvar"
        destructive
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          router.push("/rules/sequencias");
        }}
      />
      <SequenceConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            deleteConfirm?.resolve(false);
            setDeleteConfirm(null);
          }
        }}
        title="Excluir bloco conectado?"
        description="Esse bloco tem conexão com outra parte do fluxo. Ao excluir, essas conexões somem junto."
        confirmLabel="Excluir bloco"
        destructive
        onConfirm={() => {
          deleteConfirm?.resolve(true);
          setDeleteConfirm(null);
        }}
      />
    </div>
  );
}
