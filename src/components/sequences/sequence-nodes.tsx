"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  GitBranch,
  Hourglass,
  Image as ImageIcon,
  Link2,
  ListChecks,
  MessageSquareText,
  MousePointerClick,
  PauseOctagon,
  Shuffle,
  Timer,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  AutomationNodeBody,
  TriggerAutomationSummary,
} from "@/components/sequences/automation";
import { GoToSequenceNodeBody } from "@/components/sequences/extras";
import { cn } from "@/lib/utils";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  randomizerHandle,
  type AutomationNodeData,
  type ButtonsNodeData,
  type DelayNodeData,
  type GoToSequenceNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type RandomizerNodeData,
  type StopAutomationNodeData,
  type TriggerNodeData,
} from "@/types/sequence";

/**
 * Nós do canvas de sequências. Fluxo corre da esquerda para a direita:
 * alvo (entrada) à esquerda, saídas à direita — nos nós de botões e
 * respostas rápidas, cada opção tem a própria saída (ramificação).
 */

/** Id do bloco com erro de validação (setado pelo editor após tentar salvar
 *  sem sucesso) — usado só pra destacar a borda em vermelho e ajudar a achar
 *  o problema no canvas. `null` quando não há erro pendente. */
export const InvalidNodeContext = createContext<string | null>(null);

// Handle visualmente discreto (~8px), mas com área de toque de 24px (mínimo
// recomendado pra alvos de toque): a borda, pintada na cor do fundo, cria o
// "furo" ao redor do miolo colorido sem encolher a caixa clicável.
const HANDLE_CLASS =
  "!h-6 !w-6 !rounded-full !border-[8px] !border-background !bg-primary";
const ROW_HANDLE_CLASS = cn(
  HANDLE_CLASS,
  "!absolute !top-1/2 !-translate-y-1/2 !-right-[25px]"
);

function NodeFrame({
  id,
  icon: Icon,
  chipClass,
  title,
  selected,
  hasTarget = true,
  hasOut = false,
  children,
}: {
  id: string;
  icon: LucideIcon;
  chipClass: string;
  title: string;
  selected?: boolean;
  hasTarget?: boolean;
  hasOut?: boolean;
  children: React.ReactNode;
}) {
  const invalidId = useContext(InvalidNodeContext);
  const isInvalid = invalidId === id;
  return (
    <div
      className={cn(
        "w-60 rounded-xl border bg-card text-card-foreground shadow-lg transition-shadow",
        isInvalid
          ? "border-destructive ring-2 ring-destructive/50"
          : selected
            ? "border-primary ring-2 ring-primary/40"
            : "border-border"
      )}
    >
      {hasTarget && (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      )}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            chipClass
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[13px] font-semibold">{title}</span>
      </div>
      <div className="px-3 py-2.5">{children}</div>
      {hasOut && (
        <Handle
          type="source"
          position={Position.Right}
          id={OUT_HANDLE}
          className={HANDLE_CLASS}
        />
      )}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="text-xs italic text-muted-foreground/70">{text}</p>;
}

const TRIGGER_TITLES: Record<string, string> = {
  automation: "Gatilho por automação",
  storyReply: "Resposta a story",
  storyMention: "Menção em story",
  refLink: "Link de referência",
};

export function TriggerNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  const source = d.source ?? "dm";
  return (
    <NodeFrame
      id={id}
      icon={Zap}
      chipClass="bg-warning text-[#0B0D0C]"
      title={TRIGGER_TITLES[source] ?? "Gatilho"}
      selected={selected}
      hasTarget={false}
      hasOut
    >
      {source === "unset" ? (
        <Placeholder text="Escolha o gatilho…" />
      ) : source === "automation" ? (
        <TriggerAutomationSummary />
      ) : source === "storyMention" ? (
        <p className="text-xs text-muted-foreground">
          Dispara quando marcam a conta{" "}
          <span className="font-medium text-foreground">num story</span>
        </p>
      ) : source === "storyReply" ? (
        d.keyword.trim() ? (
          <p className="break-words text-xs text-muted-foreground">
            Resposta a story com{" "}
            <span className="font-mono font-medium text-foreground">{d.keyword}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Dispara com <span className="font-medium text-foreground">qualquer resposta</span> a story
          </p>
        )
      ) : source === "refLink" ? (
        d.refCode?.trim() ? (
          <p className="break-words text-xs text-muted-foreground">
            Link com código{" "}
            <span className="font-mono font-medium text-foreground">{d.refCode}</span>
          </p>
        ) : (
          <Placeholder text="Defina o código do link…" />
        )
      ) : d.anyMessage ? (
        <p className="text-xs text-muted-foreground">
          Dispara com <span className="font-medium text-foreground">qualquer DM</span>
        </p>
      ) : d.keyword.trim() ? (
        <p className="break-words text-xs text-muted-foreground">
          DM com{" "}
          <span className="font-mono font-medium text-foreground">
            {d.keyword}
          </span>
        </p>
      ) : (
        <Placeholder text="Defina a palavra-chave…" />
      )}
    </NodeFrame>
  );
}

export function MessageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData;
  const isImage = d.kind === "image";
  return (
    <NodeFrame
      id={id}
      icon={isImage ? ImageIcon : MessageSquareText}
      chipClass="bg-secondary text-foreground/70"
      title={isImage ? "Imagem" : "Mensagem"}
      selected={selected}
      hasOut
    >
      {isImage ? (
        d.imageUrl.trim() ? (
          <p className="truncate text-xs text-muted-foreground">{d.imageUrl}</p>
        ) : (
          <Placeholder text="Informe a URL da imagem…" />
        )
      ) : d.text.trim() ? (
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
          {d.text}
        </p>
      ) : (
        <Placeholder text="Escreva a mensagem…" />
      )}
    </NodeFrame>
  );
}

export function ButtonsNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ButtonsNodeData;
  const hasBranch = d.buttons.some((b) => b.kind === "branch");
  return (
    <NodeFrame
      id={id}
      icon={MousePointerClick}
      chipClass="bg-secondary text-foreground/70"
      title="Botões"
      selected={selected}
      hasOut={!hasBranch}
    >
      <div className="space-y-1.5">
        {d.text.trim() ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
            {d.text}
          </p>
        ) : (
          <Placeholder text="Escreva o texto…" />
        )}
        {d.buttons.map((b, i) => (
          <div
            key={i}
            className="relative flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1"
          >
            {b.kind === "url" ? (
              <Link2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            ) : (
              <GitBranch className="h-3 w-3 shrink-0 text-primary" />
            )}
            <span className="truncate text-xs">
              {b.title.trim() || `Botão ${i + 1}`}
            </span>
            {b.kind === "branch" && (
              <Handle
                type="source"
                position={Position.Right}
                id={buttonHandle(i)}
                className={ROW_HANDLE_CLASS}
              />
            )}
          </div>
        ))}
        {d.buttons.length === 0 && <Placeholder text="Adicione um botão…" />}
      </div>
    </NodeFrame>
  );
}

export function QuickRepliesNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as QuickRepliesNodeData;
  return (
    <NodeFrame
      id={id}
      icon={ListChecks}
      chipClass="bg-secondary text-foreground/70"
      title="Respostas rápidas"
      selected={selected}
    >
      <div className="space-y-1.5">
        {d.text.trim() ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
            {d.text}
          </p>
        ) : (
          <Placeholder text="Escreva a pergunta…" />
        )}
        {d.options.map((option, i) => (
          <div
            key={i}
            className="relative flex items-center rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1"
          >
            <span className="truncate text-xs">
              {option.trim() || `Opção ${i + 1}`}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={quickReplyHandle(i)}
              className={ROW_HANDLE_CLASS}
            />
          </div>
        ))}
        {d.options.length === 0 && <Placeholder text="Adicione uma opção…" />}
        <div className="relative flex items-center px-2.5 py-0.5">
          <span className="text-[11px] italic text-muted-foreground/70">
            Se digitar outra coisa…
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={QR_FALLBACK_HANDLE}
            className={ROW_HANDLE_CLASS}
          />
        </div>
      </div>
    </NodeFrame>
  );
}

const UNIT_LABELS: Record<DelayNodeData["unit"], [string, string]> = {
  seconds: ["segundo", "segundos"],
  minutes: ["minuto", "minutos"],
  hours: ["hora", "horas"],
};

export function DelayNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DelayNodeData;
  const [singular, plural] = UNIT_LABELS[d.unit] ?? UNIT_LABELS.minutes;
  return (
    <NodeFrame
      id={id}
      icon={Timer}
      chipClass="bg-secondary text-foreground/70"
      title="Atraso"
      selected={selected}
      hasOut
    >
      <p className="text-xs text-muted-foreground">
        Espera{" "}
        <span className="font-medium text-foreground">
          {d.amount} {d.amount === 1 ? singular : plural}
        </span>{" "}
        antes de continuar
      </p>
    </NodeFrame>
  );
}

export function WaitReplyNode({ id, selected }: NodeProps) {
  return (
    <NodeFrame
      id={id}
      icon={Hourglass}
      chipClass="bg-secondary text-foreground/70"
      title="Esperar resposta"
      selected={selected}
      hasOut
    >
      <p className="text-xs text-muted-foreground">
        Pausa o fluxo até a pessoa responder qualquer coisa
      </p>
    </NodeFrame>
  );
}

export function AutomationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as AutomationNodeData;
  return (
    <NodeFrame
      id={id}
      icon={Workflow}
      chipClass="bg-secondary text-foreground/70"
      title="Automação"
      selected={selected}
      hasOut
    >
      <AutomationNodeBody ruleId={d.ruleId} />
    </NodeFrame>
  );
}

export function RandomizerNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as RandomizerNodeData;
  return (
    <NodeFrame
      id={id}
      icon={Shuffle}
      chipClass="bg-secondary text-foreground/70"
      title="Aleatório"
      selected={selected}
    >
      <div className="space-y-1.5">
        {d.branches.map((b, i) => (
          <div
            key={i}
            className="relative flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1"
          >
            <span className="truncate text-xs">
              {b.label.trim() || `Caminho ${i + 1}`}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {b.weight}%
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={randomizerHandle(i)}
              className={ROW_HANDLE_CLASS}
            />
          </div>
        ))}
        {d.branches.length === 0 && <Placeholder text="Adicione um caminho…" />}
      </div>
    </NodeFrame>
  );
}

export function GoToSequenceNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GoToSequenceNodeData;
  return (
    <NodeFrame
      id={id}
      icon={Workflow}
      chipClass="bg-secondary text-foreground/70"
      title="Ir para workflow"
      selected={selected}
      // Terminal: o run atual encerra aqui, não há saída pra conectar.
    >
      <GoToSequenceNodeBody sequenceId={d.sequenceId} />
    </NodeFrame>
  );
}

export function StopAutomationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as StopAutomationNodeData;
  return (
    <NodeFrame
      id={id}
      icon={PauseOctagon}
      chipClass="bg-secondary text-foreground/70"
      title="Pausar automações"
      selected={selected}
      hasOut
    >
      <p className="text-xs text-muted-foreground">
        Pausa novas automações para esta pessoa por{" "}
        <span className="font-medium text-foreground">
          {d.hours} {d.hours === 1 ? "hora" : "horas"}
        </span>
      </p>
    </NodeFrame>
  );
}

export const sequenceNodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  buttons: ButtonsNode,
  quickReplies: QuickRepliesNode,
  delay: DelayNode,
  waitReply: WaitReplyNode,
  automation: AutomationNode,
  randomizer: RandomizerNode,
  goToSequence: GoToSequenceNode,
  stopAutomation: StopAutomationNode,
};
