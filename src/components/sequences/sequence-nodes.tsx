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
  Plus,
  Shuffle,
  Timer,
  Trash2,
  Workflow,
  Zap,
  Split,
  Tag,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";

import {
  AutomationNodeContent,
  RuleSelect,
  TriggerAutomationSummary,
  useAutomationRules,
} from "@/components/sequences/automation";
import {
  CollectInputNodeContent,
  ConditionNodeContent,
  SetFieldNodeContent,
  TemplateHint,
} from "@/components/sequences/data";
import {
  GoToSequenceNodeContent,
  RefLinkFields,
  StopAutomationForm,
} from "@/components/sequences/extras";
import { useNodeDataChange } from "@/components/sequences/node-data-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BUTTON_TITLE_MAX,
  BUTTONS_TEXT_MAX,
  MAX_BUTTONS,
  MAX_QUICK_REPLIES,
  MAX_RANDOMIZER_BRANCHES,
  MIN_RANDOMIZER_BRANCHES,
  RANDOMIZER_WEIGHT_TOTAL,
  TEXT_MAX,
} from "@/lib/sequences/graph";
import { cn } from "@/lib/utils";
import type { MatchType, Rule } from "@/types/database";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  randomizerHandle,
  type AutomationNodeData,
  type ButtonsNodeData,
  type CollectInputNodeData,
  type ConditionNodeData,
  type DelayNodeData,
  type GoToSequenceNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type RandomizerBranch,
  type RandomizerNodeData,
  type SequenceButton,
  type SetFieldNodeData,
  type StopAutomationNodeData,
  type TriggerNodeData,
} from "@/types/sequence";

/**
 * Nós do canvas de sequências. Fluxo corre da esquerda para a direita:
 * alvo (entrada) à esquerda, saídas à direita — nos nós de botões e
 * respostas rápidas, cada opção tem a própria saída (ramificação).
 *
 * Cada bloco mostra um resumo somente-leitura quando não está selecionado, e
 * o formulário de edição completo DENTRO DO PRÓPRIO CARD quando selecionado
 * (estilo ManyChat) — não existe mais painel lateral para editar um bloco.
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
        "rounded-xl border bg-card text-card-foreground shadow-lg transition-[width,box-shadow]",
        selected ? "w-80" : "w-60",
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
      {/* Selecionado = editando: o corpo vira `nodrag`/`nopan` (senão o React
          Flow rouba clique/arrasto de qualquer input aqui dentro pro nó
          inteiro) e ganha rolagem própria pra formulários longos não estourar
          o canvas — o cabeçalho acima continua sendo a "alça" de arrasto. */}
      <div
        className={cn(
          "px-3 py-2.5",
          selected && "nodrag nopan nowheel max-h-[70vh] overflow-y-auto"
        )}
      >
        {children}
      </div>
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

// ── Gatilho ──────────────────────────────────────────────────────────────────

const TRIGGER_TITLES: Record<string, string> = {
  automation: "Gatilho por automação",
  storyReply: "Resposta a story",
  storyMention: "Menção em story",
  refLink: "Link de referência",
};

/** Opção do select "Quando começar" — "dm" vira duas linhas (com/sem palavra-chave). */
type TriggerWhen =
  | ""
  | "automation"
  | "dm-keyword"
  | "dm-any"
  | "storyReply"
  | "storyMention"
  | "refLink";

function triggerWhenOf(data: TriggerNodeData): TriggerWhen {
  const source = data.source ?? "dm";
  switch (source) {
    case "unset":
      return "";
    case "automation":
    case "storyReply":
    case "storyMention":
    case "refLink":
      return source;
    default:
      return data.anyMessage ? "dm-any" : "dm-keyword";
  }
}

function TriggerForm({
  data,
  patch,
  rules,
  accountUsername,
}: {
  data: TriggerNodeData;
  patch: (d: TriggerNodeData) => void;
  rules: Rule[];
  accountUsername?: string;
}) {
  const when = triggerWhenOf(data);

  // Trocar de modo limpa o que só fazia sentido no modo anterior: ruleId
  // residual contaria como uso da automação e anyMessage/keyword residuais
  // mudariam quando o gatilho dispara.
  function selectWhen(value: TriggerWhen) {
    const base = { ...data, anyMessage: false, ruleId: undefined };
    switch (value) {
      case "automation":
        patch({ ...base, source: "automation", ruleId: data.ruleId, keyword: "" });
        break;
      case "dm-keyword":
        patch({ ...base, source: "dm" });
        break;
      case "dm-any":
        patch({ ...base, source: "dm", anyMessage: true, keyword: "" });
        break;
      case "storyReply":
        patch({ ...base, source: value });
        break;
      case "storyMention":
      case "refLink":
        patch({ ...base, source: value, keyword: "" });
        break;
    }
  }

  const rule = data.ruleId ? rules.find((r) => r.id === data.ruleId) ?? null : null;
  const ruleRemoved = !!data.ruleId && !rule;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Quando começar</Label>
        <Select value={when} onValueChange={(v) => selectWhen(v as TriggerWhen)}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha o gatilho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="automation">Automação existente</SelectItem>
            <SelectItem value="dm-keyword">Palavra-chave na DM</SelectItem>
            <SelectItem value="dm-any">Qualquer DM</SelectItem>
            <SelectItem value="storyReply">Resposta a story</SelectItem>
            <SelectItem value="storyMention">Menção em story</SelectItem>
            <SelectItem value="refLink">Link de referência (ig.me)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {when === "" && (
        <p className="text-xs text-muted-foreground">
          Escolha acima quando este workflow deve começar.
        </p>
      )}

      {when === "automation" && (
        <div className="space-y-3">
          <RuleSelect
            rules={rules}
            value={data.ruleId ?? ""}
            onChange={(ruleId) => patch({ ...data, ruleId })}
          />
          {ruleRemoved && (
            <p className="text-xs text-destructive">
              A automação escolhida foi excluída. Escolha outra.
            </p>
          )}
          {rule && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                {rule.name?.trim() || rule.keyword?.trim() || "Automação sem nome"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="muted">
                  {rule.trigger_type === "comment" ? "Comentário" : "DM"}
                </Badge>
                <Badge variant={rule.is_active ? "success" : "warning"}>
                  {rule.is_active ? "Ativa" : "Pausada"}
                </Badge>
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Quando esta automação responder (DM ou o link do comentário), o
            fluxo continua pela saída do gatilho. Automação pausada = o
            workflow não inicia.
          </p>
        </div>
      )}

      {when === "refLink" && (
        <RefLinkFields data={data} patch={patch} accountUsername={accountUsername} />
      )}

      {when === "storyMention" && (
        <p className="text-xs text-muted-foreground">
          Dispara quando alguém marca a sua conta num story.
        </p>
      )}

      {(when === "dm-keyword" || when === "storyReply") && (
        <>
          <div className="space-y-2">
            <Label htmlFor="seq-keyword">
              {when === "dm-keyword" ? "Palavras-chave" : "Palavras-chave (opcional)"}
            </Label>
            <Input
              id="seq-keyword"
              placeholder="ex.: preço, link, comprar"
              className="font-mono"
              value={data.keyword}
              onChange={(e) => patch({ ...data, keyword: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {when === "dm-keyword"
                ? "Separe várias por vírgula: qualquer uma dispara."
                : "Deixe em branco pra disparar com qualquer evento desse tipo, ou filtre pelo texto que a pessoa mandar junto."}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Tipo de match</Label>
            <Select
              value={data.matchType}
              onValueChange={(v) => patch({ ...data, matchType: v as MatchType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contém a palavra</SelectItem>
                <SelectItem value="exact">Mensagem exata</SelectItem>
                <SelectItem value="starts_with">Começa com</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {when !== "" && when !== "automation" && (
        <p className="text-xs text-muted-foreground">
          Cada pessoa entra nesta sequência no máximo uma vez.
        </p>
      )}
    </div>
  );
}

export function TriggerNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  const source = d.source ?? "dm";
  const onNodeDataChange = useNodeDataChange();
  const { rules, account } = useAutomationRules();

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
      {selected ? (
        <TriggerForm
          data={d}
          patch={(next) => onNodeDataChange(id, next)}
          rules={rules}
          accountUsername={account?.ig_username}
        />
      ) : source === "unset" ? (
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

// ── Mensagem ─────────────────────────────────────────────────────────────────

function MessageForm({
  data,
  patch,
}: {
  data: MessageNodeData;
  patch: (d: MessageNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <Tabs
        value={data.kind}
        onValueChange={(v) => patch({ ...data, kind: v as "text" | "image" })}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text">Texto</TabsTrigger>
          <TabsTrigger value="image">Imagem</TabsTrigger>
        </TabsList>
      </Tabs>
      {data.kind === "text" ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Escreva a mensagem…"
            rows={5}
            maxLength={TEXT_MAX}
            value={data.text}
            onChange={(e) => patch({ ...data, text: e.target.value })}
          />
          <p className="text-right text-xs text-muted-foreground">
            {data.text.length}/{TEXT_MAX}
          </p>
          <TemplateHint />
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="https://exemplo.com/imagem.jpg"
            value={data.imageUrl}
            onChange={(e) => patch({ ...data, imageUrl: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            URL pública da imagem (JPG/PNG, até 8MB).
          </p>
        </div>
      )}
    </div>
  );
}

export function MessageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MessageNodeData;
  const isImage = d.kind === "image";
  const onNodeDataChange = useNodeDataChange();
  return (
    <NodeFrame
      id={id}
      icon={isImage ? ImageIcon : MessageSquareText}
      chipClass="bg-secondary text-foreground/70"
      title={isImage ? "Imagem" : "Mensagem"}
      selected={selected}
      hasOut
    >
      {selected ? (
        <MessageForm data={d} patch={(next) => onNodeDataChange(id, next)} />
      ) : isImage ? (
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

// ── Botões ───────────────────────────────────────────────────────────────────
// Cada botão "continuar o fluxo" tem a própria saída (handle na linha) — por
// isso não dá pra trocar o corpo inteiro por um formulário à parte quando
// selecionado: o handle precisa continuar na mesma linha, editada ou não.

export function ButtonsNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ButtonsNodeData;
  const hasBranch = d.buttons.some((b) => b.kind === "branch");
  const onNodeDataChange = useNodeDataChange();

  const patch = (next: ButtonsNodeData) => onNodeDataChange(id, next);
  const setButton = (i: number, partial: Partial<SequenceButton>) =>
    patch({
      ...d,
      buttons: d.buttons.map((b, idx) => (idx === i ? { ...b, ...partial } : b)),
    });

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
        {selected ? (
          <Textarea
            placeholder="Texto que acompanha os botões…"
            rows={3}
            maxLength={BUTTONS_TEXT_MAX}
            value={d.text}
            onChange={(e) => patch({ ...d, text: e.target.value })}
          />
        ) : d.text.trim() ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
            {d.text}
          </p>
        ) : (
          <Placeholder text="Escreva o texto…" />
        )}
        {selected && <TemplateHint />}

        {d.buttons.map((b, i) => (
          <div
            key={i}
            className={cn(
              "relative rounded-md border border-border/70 bg-secondary/40",
              selected ? "space-y-2 p-2.5" : "flex items-center gap-1.5 px-2 py-1"
            )}
          >
            {selected ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder={`Botão ${i + 1}`}
                    maxLength={BUTTON_TITLE_MAX}
                    className="h-8 flex-1 text-xs"
                    value={b.title}
                    onChange={(e) => setButton(i, { title: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      patch({ ...d, buttons: d.buttons.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Select
                  value={b.kind}
                  onValueChange={(v) => setButton(i, { kind: v as "url" | "branch" })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="url">
                      <span className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5" /> Abrir link
                      </span>
                    </SelectItem>
                    <SelectItem value="branch">
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5" /> Continuar o fluxo
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {b.kind === "url" && (
                  <Input
                    placeholder="https://…"
                    className="h-8 text-xs"
                    value={b.url}
                    onChange={(e) => setButton(i, { url: e.target.value })}
                  />
                )}
              </>
            ) : (
              <>
                {b.kind === "url" ? (
                  <Link2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                ) : (
                  <GitBranch className="h-3 w-3 shrink-0 text-primary" />
                )}
                <span className="truncate text-xs">
                  {b.title.trim() || `Botão ${i + 1}`}
                </span>
              </>
            )}
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

        {selected && d.buttons.length < MAX_BUTTONS && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              patch({
                ...d,
                buttons: [...d.buttons, { title: "", kind: "branch", url: "" }],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar botão
          </Button>
        )}
        {selected && (
          <p className="text-xs text-muted-foreground">
            Até {MAX_BUTTONS} botões. “Continuar o fluxo” cria uma saída no
            bloco para conectar o próximo passo; “Abrir link” só abre a
            página.
          </p>
        )}
      </div>
    </NodeFrame>
  );
}

// ── Respostas rápidas ────────────────────────────────────────────────────────
// Mesma razão de ButtonsNode: cada opção tem a própria saída, então a linha
// precisa manter o handle nos dois modos (resumo e edição).

export function QuickRepliesNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as QuickRepliesNodeData;
  const onNodeDataChange = useNodeDataChange();
  const patch = (next: QuickRepliesNodeData) => onNodeDataChange(id, next);

  return (
    <NodeFrame
      id={id}
      icon={ListChecks}
      chipClass="bg-secondary text-foreground/70"
      title="Respostas rápidas"
      selected={selected}
    >
      <div className="space-y-1.5">
        {selected ? (
          <Textarea
            placeholder="ex.: Qual desses assuntos te interessa mais?"
            rows={3}
            maxLength={TEXT_MAX}
            value={d.text}
            onChange={(e) => patch({ ...d, text: e.target.value })}
          />
        ) : d.text.trim() ? (
          <p className="line-clamp-2 break-words text-xs text-muted-foreground">
            {d.text}
          </p>
        ) : (
          <Placeholder text="Escreva a pergunta…" />
        )}
        {selected && <TemplateHint />}

        {d.options.map((option, i) => (
          <div
            key={i}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1",
              !selected && "rounded-full"
            )}
          >
            {selected ? (
              <>
                <Input
                  placeholder={`Opção ${i + 1}`}
                  maxLength={BUTTON_TITLE_MAX}
                  className="h-7 flex-1 text-xs"
                  value={option}
                  onChange={(e) =>
                    patch({
                      ...d,
                      options: d.options.map((o, idx) => (idx === i ? e.target.value : o)),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    patch({ ...d, options: d.options.filter((_, idx) => idx !== i) })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <span className="truncate text-xs">{option.trim() || `Opção ${i + 1}`}</span>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={quickReplyHandle(i)}
              className={ROW_HANDLE_CLASS}
            />
          </div>
        ))}
        {d.options.length === 0 && <Placeholder text="Adicione uma opção…" />}

        {selected && d.options.length < MAX_QUICK_REPLIES && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => patch({ ...d, options: [...d.options, ""] })}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar opção
          </Button>
        )}

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
        {selected && (
          <p className="text-xs text-muted-foreground">
            Até {MAX_QUICK_REPLIES} opções de {BUTTON_TITLE_MAX} caracteres.
            Cada opção vira um botão na DM e tem a própria saída no bloco; a
            saída <span className="italic">“se digitar outra coisa”</span>{" "}
            cobre quem responde em texto livre.
          </p>
        )}
      </div>
    </NodeFrame>
  );
}

// ── Atraso / Esperar resposta ───────────────────────────────────────────────

const UNIT_LABELS: Record<DelayNodeData["unit"], [string, string]> = {
  seconds: ["segundo", "segundos"],
  minutes: ["minuto", "minutos"],
  hours: ["hora", "horas"],
};

function DelayForm({
  data,
  patch,
}: {
  data: DelayNodeData;
  patch: (d: DelayNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="seq-delay">Esperar</Label>
          <Input
            id="seq-delay"
            type="number"
            min={1}
            value={Number.isFinite(data.amount) ? data.amount : ""}
            onChange={(e) => patch({ ...data, amount: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Unidade</Label>
          <Select
            value={data.unit}
            onValueChange={(v) => patch({ ...data, unit: v as DelayNodeData["unit"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">segundos</SelectItem>
              <SelectItem value="minutes">minutos</SelectItem>
              <SelectItem value="hours">horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        De 5 segundos a 23 horas. O limite existe porque a Meta só permite
        enviar mensagens até 24h após a última resposta da pessoa. Para fluxos
        mais longos, use “Esperar resposta” no meio (a resposta renova a
        janela).
      </p>
    </div>
  );
}

export function DelayNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DelayNodeData;
  const [singular, plural] = UNIT_LABELS[d.unit] ?? UNIT_LABELS.minutes;
  const onNodeDataChange = useNodeDataChange();
  return (
    <NodeFrame
      id={id}
      icon={Timer}
      chipClass="bg-secondary text-foreground/70"
      title="Atraso"
      selected={selected}
      hasOut
    >
      {selected ? (
        <DelayForm data={d} patch={(next) => onNodeDataChange(id, next)} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Espera{" "}
          <span className="font-medium text-foreground">
            {d.amount} {d.amount === 1 ? singular : plural}
          </span>{" "}
          antes de continuar
        </p>
      )}
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        {selected
          ? "O fluxo fica pausado neste ponto até a pessoa mandar qualquer mensagem. Quando ela responder, continua pela saída do bloco. A resposta dela também reabre a janela de 24h da Meta."
          : "Pausa o fluxo até a pessoa responder qualquer coisa"}
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
      <AutomationNodeContent id={id} data={d} selected={selected} />
    </NodeFrame>
  );
}

// ── Dados do contato (conteúdo em ./data) ───────────────────────────────────

export function CollectInputNode({ id, data, selected }: NodeProps) {
  return (
    <NodeFrame
      id={id}
      icon={TextCursorInput}
      chipClass="bg-secondary text-foreground/70"
      title="Coletar dado"
      selected={selected}
    >
      <CollectInputNodeContent
        id={id}
        data={data as unknown as CollectInputNodeData}
        selected={selected}
        handleClassName={ROW_HANDLE_CLASS}
      />
    </NodeFrame>
  );
}

export function ConditionNode({ id, data, selected }: NodeProps) {
  return (
    <NodeFrame
      id={id}
      icon={Split}
      chipClass="bg-secondary text-foreground/70"
      title="Condição"
      selected={selected}
    >
      <ConditionNodeContent
        id={id}
        data={data as unknown as ConditionNodeData}
        selected={selected}
        handleClassName={ROW_HANDLE_CLASS}
      />
    </NodeFrame>
  );
}

export function SetFieldNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as SetFieldNodeData;
  return (
    <NodeFrame
      id={id}
      icon={Tag}
      chipClass="bg-secondary text-foreground/70"
      title={d.mode === "tag" ? "Definir tag" : "Definir campo"}
      selected={selected}
      hasOut
    >
      <SetFieldNodeContent id={id} data={d} selected={selected} />
    </NodeFrame>
  );
}

// ── Extras (aleatório, ir para workflow, pausar automações) ──────────────────
// "Aleatório" fica aqui (e não em extras/) pela mesma razão de Botões: cada
// caminho tem a própria saída, e o handle precisa continuar na mesma linha
// que o rótulo, editado ou não.

export function RandomizerNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as RandomizerNodeData;
  const onNodeDataChange = useNodeDataChange();
  const total = d.branches.reduce((sum, b) => sum + b.weight, 0);

  const patch = (next: RandomizerNodeData) => onNodeDataChange(id, next);
  const setBranch = (i: number, partial: Partial<RandomizerBranch>) =>
    patch({
      ...d,
      branches: d.branches.map((b, idx) => (idx === i ? { ...b, ...partial } : b)),
    });

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
            {selected ? (
              <>
                <Input
                  placeholder={`Caminho ${i + 1}`}
                  maxLength={40}
                  className="h-7 flex-1 text-xs"
                  value={b.label}
                  onChange={(e) => setBranch(i, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="h-7 w-14 shrink-0 text-xs"
                  value={Number.isFinite(b.weight) ? b.weight : ""}
                  onChange={(e) => setBranch(i, { weight: Number(e.target.value) })}
                />
                <span className="shrink-0 text-[11px] text-muted-foreground">%</span>
                {d.branches.length > MIN_RANDOMIZER_BRANCHES && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      patch({ ...d, branches: d.branches.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="truncate text-xs">{b.label.trim() || `Caminho ${i + 1}`}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {b.weight}%
                </span>
              </>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={randomizerHandle(i)}
              className={ROW_HANDLE_CLASS}
            />
          </div>
        ))}
        {d.branches.length === 0 && <Placeholder text="Adicione um caminho…" />}

        {selected && d.branches.length < MAX_RANDOMIZER_BRANCHES && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              patch({ ...d, branches: [...d.branches, { label: "", weight: 0 }] })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar caminho
          </Button>
        )}

        {selected && (
          <p
            className={cn(
              "text-xs",
              total === RANDOMIZER_WEIGHT_TOTAL
                ? "text-muted-foreground"
                : "font-medium text-destructive"
            )}
          >
            Soma atual: {total}%. As porcentagens precisam somar{" "}
            {RANDOMIZER_WEIGHT_TOTAL}%.
          </p>
        )}
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
      <GoToSequenceNodeContent id={id} data={d} selected={selected} />
    </NodeFrame>
  );
}

export function StopAutomationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as StopAutomationNodeData;
  const onNodeDataChange = useNodeDataChange();
  return (
    <NodeFrame
      id={id}
      icon={PauseOctagon}
      chipClass="bg-secondary text-foreground/70"
      title="Pausar automações"
      selected={selected}
      hasOut
    >
      {selected ? (
        <StopAutomationForm data={d} patch={(next) => onNodeDataChange(id, next)} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Pausa novas automações para esta pessoa por{" "}
          <span className="font-medium text-foreground">
            {d.hours} {d.hours === 1 ? "hora" : "horas"}
          </span>
        </p>
      )}
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
  collectInput: CollectInputNode,
  condition: ConditionNode,
  setField: SetFieldNode,
  randomizer: RandomizerNode,
  goToSequence: GoToSequenceNode,
  stopAutomation: StopAutomationNode,
};
