"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  GitBranch,
  Hourglass,
  Image as ImageIcon,
  Link2,
  ListChecks,
  MessageSquareText,
  MousePointerClick,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  type ButtonsNodeData,
  type DelayNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type TriggerNodeData,
} from "@/types/sequence";

/**
 * Nós do canvas de sequências. Fluxo corre da esquerda para a direita:
 * alvo (entrada) à esquerda, saídas à direita — nos nós de botões e
 * respostas rápidas, cada opção tem a própria saída (ramificação).
 */

const HANDLE_CLASS =
  "!h-3 !w-3 !rounded-full !border-2 !border-background !bg-primary";
const ROW_HANDLE_CLASS = cn(
  HANDLE_CLASS,
  "!absolute !top-1/2 !-translate-y-1/2 !-right-[19px]"
);

function NodeFrame({
  icon: Icon,
  chipClass,
  title,
  selected,
  hasTarget = true,
  hasOut = false,
  children,
}: {
  icon: LucideIcon;
  chipClass: string;
  title: string;
  selected?: boolean;
  hasTarget?: boolean;
  hasOut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-60 rounded-xl border bg-card text-card-foreground shadow-lg transition-shadow",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border"
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

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <NodeFrame
      icon={Zap}
      chipClass="bg-primary/20 text-primary"
      title="Gatilho"
      selected={selected}
      hasTarget={false}
      hasOut
    >
      {d.anyMessage ? (
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

export function MessageNode({ data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData;
  const isImage = d.kind === "image";
  return (
    <NodeFrame
      icon={isImage ? ImageIcon : MessageSquareText}
      chipClass="bg-sky-500/20 text-sky-400"
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

export function ButtonsNode({ data, selected }: NodeProps) {
  const d = data as unknown as ButtonsNodeData;
  const hasBranch = d.buttons.some((b) => b.kind === "branch");
  return (
    <NodeFrame
      icon={MousePointerClick}
      chipClass="bg-amber-500/20 text-amber-400"
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
              <GitBranch className="h-3 w-3 shrink-0 text-amber-400" />
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

export function QuickRepliesNode({ data, selected }: NodeProps) {
  const d = data as unknown as QuickRepliesNodeData;
  return (
    <NodeFrame
      icon={ListChecks}
      chipClass="bg-emerald-500/20 text-emerald-400"
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

export function DelayNode({ data, selected }: NodeProps) {
  const d = data as unknown as DelayNodeData;
  const [singular, plural] = UNIT_LABELS[d.unit] ?? UNIT_LABELS.minutes;
  return (
    <NodeFrame
      icon={Timer}
      chipClass="bg-orange-500/20 text-orange-400"
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

export function WaitReplyNode({ selected }: NodeProps) {
  return (
    <NodeFrame
      icon={Hourglass}
      chipClass="bg-pink-500/20 text-pink-400"
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

export const sequenceNodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  buttons: ButtonsNode,
  quickReplies: QuickRepliesNode,
  delay: DelayNode,
  waitReply: WaitReplyNode,
};
