"use client";

import { GitBranch, Link2, Plus, Trash2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BUTTON_TITLE_MAX,
  BUTTONS_TEXT_MAX,
  MAX_BUTTONS,
  MAX_QUICK_REPLIES,
  TEXT_MAX,
} from "@/lib/sequences/graph";
import type { MatchType } from "@/types/database";
import type {
  ButtonsNodeData,
  DelayNodeData,
  DelayUnit,
  MessageNodeData,
  QuickRepliesNodeData,
  SequenceNodeData,
  SequenceNodeType,
  TriggerNodeData,
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

interface InspectorProps {
  node: InspectorNode | null;
  onChange: (nodeId: string, data: SequenceNodeData) => void;
}

const TYPE_TITLES: Record<SequenceNodeType, string> = {
  trigger: "Gatilho",
  message: "Mensagem",
  buttons: "Botões",
  quickReplies: "Respostas rápidas",
  delay: "Atraso",
  waitReply: "Esperar resposta",
};

export function SequenceInspector({ node, onChange }: InspectorProps) {
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
            opção tem a própria saída — é assim que o fluxo ramifica.
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
      <NodeForm node={node} onChange={onChange} />
    </div>
  );
}

function NodeForm({ node, onChange }: { node: InspectorNode; onChange: InspectorProps["onChange"] }) {
  switch (node.type) {
    case "trigger":
      return (
        <TriggerForm
          data={node.data as TriggerNodeData}
          patch={(d) => onChange(node.id, d)}
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
          mensagem. Quando ela responder, continua pela saída do bloco — e a
          resposta dela reabre a janela de 24h da Meta.
        </p>
      );
  }
}

function TriggerForm({
  data,
  patch,
}: {
  data: TriggerNodeData;
  patch: (d: TriggerNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border border-input px-3 py-2.5">
        <span className="text-sm">Qualquer mensagem</span>
        <Switch
          checked={data.anyMessage}
          onCheckedChange={(v) => patch({ ...data, anyMessage: v })}
        />
      </div>
      {!data.anyMessage && (
        <>
          <div className="space-y-2">
            <Label htmlFor="seq-keyword">Palavras-chave</Label>
            <Input
              id="seq-keyword"
              placeholder="ex.: preço, link, comprar"
              className="font-mono"
              value={data.keyword}
              onChange={(e) => patch({ ...data, keyword: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Separe várias por vírgula — qualquer uma dispara.
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
      <p className="text-xs text-muted-foreground">
        Cada pessoa entra nesta sequência no máximo uma vez.
      </p>
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
        De 5 segundos a 23 horas — o limite existe porque a Meta só permite
        enviar mensagens até 24h após a última resposta da pessoa. Para fluxos
        mais longos, use “Esperar resposta” no meio (a resposta renova a
        janela).
      </p>
    </div>
  );
}
