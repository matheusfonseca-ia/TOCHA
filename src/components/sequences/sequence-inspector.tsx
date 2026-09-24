"use client";

import { GitBranch, Link2, Plus, Trash2 } from "lucide-react";

import {
  AutomationNodeForm,
  RuleSelect,
  ruleDisplayName,
  ruleTypeLabel,
  type AutomationPreviewAccount,
} from "@/components/sequences/automation";
import {
  CollectInputForm,
  ConditionForm,
  SetFieldForm,
  TemplateHint,
} from "@/components/sequences/data";
import {
  GoToSequenceForm,
  RandomizerForm,
  RefLinkFields,
  StopAutomationForm,
} from "@/components/sequences/extras";
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
  TEXT_MAX,
} from "@/lib/sequences/graph";
import type { MatchType, Rule } from "@/types/database";
import type {
  AutomationNodeData,
  ButtonsNodeData,
  DelayNodeData,
  DelayUnit,
  GoToSequenceNodeData,
  MessageNodeData,
  QuickRepliesNodeData,
  RandomizerNodeData,
  SequenceNodeData,
  SequenceNodeType,
  StopAutomationNodeData,
  TriggerNodeData,
  TriggerSource,
  CollectInputNodeData,
  ConditionNodeData,
  SetFieldNodeData,
} from "@/types/sequence";

/**
 * Painel lateral do editor: formulário do bloco selecionado no canvas.
 * Toda mudança sobe via onChange e é aplicada direto no nó (preview ao vivo).
 */

export interface InspectorNode {
  id: string;
  type: SequenceNodeType;
  data: SequenceNodeData;
}

/** O que o nó "Automação" precisa saber do resto do fluxo. */
export interface InspectorAutomationContext {
  /** Automações da conta da sequência. */
  rules: Rule[];
  account: AutomationPreviewAccount | null;
  /** Id do bloco ligado direto à saída do gatilho (posição de entrada). */
  entryNodeId: string | null;
  triggerSource: TriggerSource;
  onTriggerSourceChange: (source: TriggerSource) => void;
}

interface InspectorProps {
  node: InspectorNode | null;
  onChange: (nodeId: string, data: SequenceNodeData) => void;
  automation: InspectorAutomationContext;
  /** Outros workflows ativos da mesma conta, para o nó "Ir para workflow". */
  goToSequenceOptions: { id: string; name: string }[];
}

const TYPE_TITLES: Record<SequenceNodeType, string> = {
  trigger: "Gatilho",
  message: "Mensagem",
  buttons: "Botões",
  quickReplies: "Respostas rápidas",
  delay: "Atraso",
  waitReply: "Esperar resposta",
  automation: "Automação",
  collectInput: "Coletar dado",
  condition: "Condição",
  setField: "Definir campo ou tag",
  randomizer: "Aleatório",
  goToSequence: "Ir para workflow",
  stopAutomation: "Pausar automações",
};

export function SequenceInspector({
  node,
  onChange,
  automation,
  goToSequenceOptions,
}: InspectorProps) {
  if (!node) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Como montar o fluxo</p>
        <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed">
          <li>Adicione blocos pela barra acima do canvas.</li>
          <li>
            Arraste da <span className="text-foreground">bolinha direita</span>{" "}
            de um bloco até a esquerda do próximo para conectar.
          </li>
          <li>
            Em <span className="text-foreground">Botões</span> e{" "}
            <span className="text-foreground">Respostas rápidas</span>, cada
            opção tem a própria saída: é assim que o fluxo ramifica.
          </li>
          <li>Clique num bloco para editá-lo aqui.</li>
          <li>
            Selecione um bloco ou conexão e aperte{" "}
            <span className="rounded bg-secondary px-1 text-foreground">Delete</span>{" "}
            para excluir.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{TYPE_TITLES[node.type]}</p>
      <NodeForm
        node={node}
        onChange={onChange}
        automation={automation}
        goToSequenceOptions={goToSequenceOptions}
      />
    </div>
  );
}

function NodeForm({
  node,
  onChange,
  automation,
  goToSequenceOptions,
}: {
  node: InspectorNode;
  onChange: InspectorProps["onChange"];
  automation: InspectorAutomationContext;
  goToSequenceOptions: { id: string; name: string }[];
}) {
  switch (node.type) {
    case "trigger":
      return (
        <TriggerForm
          data={node.data as TriggerNodeData}
          patch={(d) => onChange(node.id, d)}
          rules={automation.rules}
          accountUsername={automation.account?.ig_username}
        />
      );
    case "message":
      return (
        <MessageForm
          data={node.data as MessageNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
    case "buttons":
      return (
        <ButtonsForm
          data={node.data as ButtonsNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
    case "quickReplies":
      return (
        <QuickRepliesForm
          data={node.data as QuickRepliesNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
    case "delay":
      return (
        <DelayForm
          data={node.data as DelayNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
    case "waitReply":
      return (
        <p className="text-xs leading-relaxed text-muted-foreground">
          O fluxo fica pausado neste ponto até a pessoa mandar qualquer
          mensagem. Quando ela responder, continua pela saída do bloco. A
          resposta dela também reabre a janela de 24h da Meta.
        </p>
      );
    case "automation":
      return (
        <AutomationNodeForm
          data={node.data as AutomationNodeData}
          onChange={(d) => onChange(node.id, d)}
          rules={automation.rules}
          account={automation.account}
          isEntryPosition={automation.entryNodeId === node.id}
          triggerSource={automation.triggerSource}
          onTriggerSourceChange={automation.onTriggerSourceChange}
        />
      );
    // Dados do contato
    case "collectInput":
      return (
        <CollectInputForm
          data={node.data as CollectInputNodeData}
          onChange={(d) => onChange(node.id, d)}
        />
      );
    case "condition":
      return (
        <ConditionForm
          data={node.data as ConditionNodeData}
          onChange={(d) => onChange(node.id, d)}
        />
      );
    case "setField":
      return (
        <SetFieldForm
          data={node.data as SetFieldNodeData}
          onChange={(d) => onChange(node.id, d)}
        />
      );
    // Extras
    case "randomizer":
      return (
        <RandomizerForm
          data={node.data as RandomizerNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
    case "goToSequence":
      return (
        <GoToSequenceForm
          data={node.data as GoToSequenceNodeData}
          onChange={(d) => onChange(node.id, d)}
          options={goToSequenceOptions}
        />
      );
    case "stopAutomation":
      return (
        <StopAutomationForm
          data={node.data as StopAutomationNodeData}
          patch={(d) => onChange(node.id, d)}
        />
      );
  }
}

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
              <p className="text-xs font-medium text-foreground">{ruleDisplayName(rule)}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="muted">{ruleTypeLabel(rule)}</Badge>
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

function ButtonsForm({
  data,
  patch,
}: {
  data: ButtonsNodeData;
  patch: (d: ButtonsNodeData) => void;
}) {
  const setButton = (i: number, partial: Partial<ButtonsNodeData["buttons"][number]>) => {
    const buttons = data.buttons.map((b, idx) =>
      idx === i ? { ...b, ...partial } : b
    );
    patch({ ...data, buttons });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Texto da mensagem</Label>
        <Textarea
          placeholder="Texto que acompanha os botões…"
          rows={3}
          maxLength={BUTTONS_TEXT_MAX}
          value={data.text}
          onChange={(e) => patch({ ...data, text: e.target.value })}
        />
        <TemplateHint />
      </div>

      <div className="space-y-3">
        {data.buttons.map((b, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border/70 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                placeholder={`Botão ${i + 1}`}
                maxLength={BUTTON_TITLE_MAX}
                value={b.title}
                onChange={(e) => setButton(i, { title: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  patch({
                    ...data,
                    buttons: data.buttons.filter((_, idx) => idx !== i),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Select
              value={b.kind}
              onValueChange={(v) => setButton(i, { kind: v as "url" | "branch" })}
            >
              <SelectTrigger>
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
                value={b.url}
                onChange={(e) => setButton(i, { url: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>

      {data.buttons.length < MAX_BUTTONS && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            patch({
              ...data,
              buttons: [...data.buttons, { title: "", kind: "branch", url: "" }],
            })
          }
        >
          <Plus />
          Adicionar botão
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Até {MAX_BUTTONS} botões. “Continuar o fluxo” cria uma saída no bloco
        para conectar o próximo passo; “Abrir link” só abre a página.
      </p>
    </div>
  );
}

function QuickRepliesForm({
  data,
  patch,
}: {
  data: QuickRepliesNodeData;
  patch: (d: QuickRepliesNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Pergunta</Label>
        <Textarea
          placeholder="ex.: Qual desses assuntos te interessa mais?"
          rows={3}
          maxLength={TEXT_MAX}
          value={data.text}
          onChange={(e) => patch({ ...data, text: e.target.value })}
        />
        <TemplateHint />
      </div>

      <div className="space-y-2">
        <Label>Opções</Label>
        {data.options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder={`Opção ${i + 1}`}
              maxLength={BUTTON_TITLE_MAX}
              value={option}
              onChange={(e) =>
                patch({
                  ...data,
                  options: data.options.map((o, idx) =>
                    idx === i ? e.target.value : o
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() =>
                patch({
                  ...data,
                  options: data.options.filter((_, idx) => idx !== i),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {data.options.length < MAX_QUICK_REPLIES && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => patch({ ...data, options: [...data.options, ""] })}
        >
          <Plus />
          Adicionar opção
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Até {MAX_QUICK_REPLIES} opções de {BUTTON_TITLE_MAX} caracteres. Cada
        opção vira um botão na DM e tem a própria saída no bloco; a saída{" "}
        <span className="italic">“se digitar outra coisa”</span> cobre quem
        responde em texto livre.
      </p>
    </div>
  );
}

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
            onChange={(e) =>
              patch({ ...data, amount: Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Unidade</Label>
          <Select
            value={data.unit}
            onValueChange={(v) => patch({ ...data, unit: v as DelayUnit })}
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
