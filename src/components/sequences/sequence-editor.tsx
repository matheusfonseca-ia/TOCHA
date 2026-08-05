"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
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
  Timer,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import {
  saveSequence,
  type SequenceInput,
} from "@/app/(dashboard)/rules/sequencias/actions";
import { SequenceInspector, type InspectorNode } from "@/components/sequences/sequence-inspector";
import { sequenceNodeTypes } from "@/components/sequences/sequence-nodes";
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
import { sourceHandlesOf, validateSequenceGraph } from "@/lib/sequences/graph";
import { cn } from "@/lib/utils";
import { OUT_HANDLE, type Sequence, type SequenceGraph, type SequenceGraphNode, type SequenceNodeData, type SequenceNodeType } from "@/types/sequence";

/**
 * Editor de sequências: canvas de blocos conectáveis (React Flow) +
 * inspector lateral. O grafo é salvo como está — o runtime do webhook
 * percorre o mesmo JSON que o canvas desenha.
 */

type FlowNode = Node<Record<string, unknown>>;

interface AccountOption {
  id: string;
  ig_username: string;
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
];

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

/** Converte o estado do canvas de volta para o formato salvo, descartando
 *  conexões órfãs (bloco removido ou botão/opção que deixou de existir). */
function serializeGraph(nodes: FlowNode[], edges: Edge[]): SequenceGraph {
  const graphNodes: SequenceGraphNode[] = nodes.map((n) => ({
    id: n.id,
    type: (n.type ?? "message") as SequenceNodeType,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: n.data as unknown as SequenceNodeData,
  }));

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

export function SequenceEditor(props: {
  accounts: AccountOption[];
  sequence?: Sequence;
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
}: {
  accounts: AccountOption[];
  sequence?: Sequence;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView } = useReactFlow();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const graph = useMemo(() => initialGraph(sequence), [sequence]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
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

  // Nós com saídas dinâmicas (botões/opções) precisam avisar o React Flow
  // quando os handles mudam de posição/quantidade.
  useEffect(() => {
    updateNodeInternals(nodes.map((n) => n.id));
  }, [nodes, updateNodeInternals]);

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

  const addNode = useCallback(
    (type: SequenceNodeType) => {
      const id = newNodeId(type);
      setNodes((nds) => {
        const maxX = Math.max(...nds.map((n) => n.position.x), 0);
        const triggerY =
          nds.find((n) => n.type === "trigger")?.position.y ?? 200;
        return [
          ...nds.map((n) => ({ ...n, selected: false })),
          {
            id,
            type,
            position: { x: maxX + 300, y: triggerY },
            data: defaultDataFor(type) as Record<string, unknown>,
            selected: true,
          },
        ];
      });
      setSelectedId(id);
    },
    [setNodes]
  );

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error("Dê um nome à sequência.");
      return;
    }
    if (!accountId) {
      toast.error("Selecione a conta do Instagram.");
      return;
    }
    const serialized = serializeGraph(nodes, edges);
    const graphError = validateSequenceGraph(serialized);
    if (graphError) {
      toast.error(graphError);
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
  }, [name, accountId, nodes, edges, isActive, sequence?.id, router]);

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
        <Button variant="ghost" size="icon" asChild>
          <Link href="/rules/sequencias" aria-label="Voltar para sequências">
            <ArrowLeft className="h-4 w-4" />
          </Link>
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
        <div className="ml-auto flex items-center gap-3">
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

      {/* ── Paleta de blocos ──────────────────────────────────────────── */}
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
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4 lg:w-80",
            isFullscreen
              ? "max-h-[40vh] lg:h-full lg:max-h-none"
              : "max-h-[45vh] lg:h-[calc(100vh-330px)] lg:max-h-none lg:min-h-[460px]"
          )}
        >
          <SequenceInspector node={selectedNode} onChange={handleDataChange} />
        </aside>
      </div>
    </div>
  );
}
