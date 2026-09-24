"use client";

import { TriangleAlert } from "lucide-react";

import { CommentPhonePreview } from "@/components/rules/comment-phone-preview";
import { DmPhonePreview } from "@/components/rules/dm-phone-preview";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Rule } from "@/types/database";
import type { AutomationNodeData, TriggerSource } from "@/types/sequence";

import { ruleDisplayName, ruleTypeLabel } from "./automation-rules-context";
import { RuleSelect } from "./rule-select";

/**
 * Formulário do inspector para o nó "Automação": escolhe uma automação da
 * conta (por referência) e mostra o preview reaproveitado dos builders de
 * regra. Editar a automação muda o que o fluxo envia; aqui é só seleção.
 *
 * Regras de posição (espelham validateSequenceGraph):
 *  - DM: qualquer ponto do fluxo.
 *  - Comentário: só no bloco ligado direto ao gatilho, que passa a ser
 *    "gatilho por automação" (a automação é quem inicia o fluxo).
 */

export interface AutomationPreviewAccount {
  ig_username: string;
  profile_picture_url?: string | null;
}

interface AutomationNodeFormProps {
  data: AutomationNodeData;
  onChange: (data: AutomationNodeData) => void;
  /** Automações da conta da sequência (ativas e pausadas). */
  rules: Rule[];
  /** Conta da sequência, para o preview. Sem ela o preview usa um nome genérico. */
  account?: AutomationPreviewAccount | null;
  /** true quando este bloco é o ligado direto à saída do gatilho. */
  isEntryPosition: boolean;
  /** source atual do gatilho (ausente no grafo = "dm"). */
  triggerSource: TriggerSource;
  /** Troca o source do gatilho. Sem ele, o switch de entrada não aparece. */
  onTriggerSourceChange?: (source: TriggerSource) => void;
}

export function AutomationNodeForm({
  data,
  onChange,
  rules,
  account,
  isEntryPosition,
  triggerSource,
  onTriggerSourceChange,
}: AutomationNodeFormProps) {
  const rule = rules.find((r) => r.id === data.ruleId) ?? null;
  const removed = !!data.ruleId && !rule;
  const commentRules = rules.filter((r) => r.trigger_type === "comment");
  const isEntry = isEntryPosition && triggerSource === "automation";

  function selectRule(ruleId: string) {
    onChange({ ...data, ruleId });
    const next = rules.find((r) => r.id === ruleId);
    // Automação de comentário só existe como entrada: liga o modo sozinho.
    if (next?.trigger_type === "comment" && isEntryPosition) {
      onTriggerSourceChange?.("automation");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Automação</Label>
        <RuleSelect
          rules={rules}
          value={rule ? rule.id : ""}
          onChange={selectRule}
          disableComment={!isEntryPosition}
        />
        {commentRules.length > 0 && !isEntryPosition && (
          <p className="text-xs text-muted-foreground">
            Automações de comentário só podem ser o primeiro bloco, ligado
            direto ao gatilho.
          </p>
        )}
      </div>

      {removed && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A automação deste bloco foi excluída. Escolha outra ou exclua o
            bloco para salvar o fluxo.
          </span>
        </div>
      )}

      {rule && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="muted">{ruleTypeLabel(rule)}</Badge>
            <Badge variant={rule.is_active ? "success" : "warning"}>
              {rule.is_active ? "Ativa" : "Pausada"}
            </Badge>
          </div>

          {isEntryPosition && rule.trigger_type !== "comment" && onTriggerSourceChange && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2.5">
              <span className="text-sm">
                Iniciar o fluxo quando esta automação disparar
              </span>
              <Switch
                checked={triggerSource === "automation"}
                onCheckedChange={(v) => onTriggerSourceChange(v ? "automation" : "dm")}
              />
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            {entryHint(rule, isEntry)}
          </p>

          <AutomationPreview rule={rule} account={account} />
        </>
      )}
    </div>
  );
}

function entryHint(rule: Rule, isEntry: boolean): string {
  if (rule.trigger_type === "comment") {
    return isEntry
      ? "A automação responde o comentário como sempre. Quando a pessoa toca no botão e recebe o link, o fluxo continua pela saída deste bloco. Se o fluxo estiver pausado, a automação responde sozinha."
      : "Ligue este bloco direto ao gatilho para a automação de comentário iniciar o fluxo.";
  }
  if (isEntry) {
    return rule.is_active
      ? "Quando a automação responder uma DM, o fluxo continua pela saída deste bloco."
      : "A automação está pausada: enquanto ela não responder, o fluxo não inicia.";
  }
  return "O fluxo envia a resposta atual desta automação e segue pela saída do bloco. Editar a automação muda o que é enviado aqui.";
}

function AutomationPreview({
  rule,
  account,
}: {
  rule: Rule;
  account?: AutomationPreviewAccount | null;
}) {
  const username = account?.ig_username ?? "sua_conta";
  const avatarUrl = account?.profile_picture_url ?? null;
  const firstTerm = (rule.keyword ?? "").split(",")[0]?.trim() ?? "";
  const links = (rule.reply_buttons ?? []).map((b) => ({
    title: b.title || "Link",
    url: b.url,
  }));
  const replyText =
    rule.reply_type === "image" ? "(imagem)" : (rule.reply_text ?? "");

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      {rule.trigger_type === "comment" ? (
        <CommentPhonePreview
          username={username}
          avatarUrl={avatarUrl}
          selectedMedia={rule.media_refs?.[0] ?? null}
          anyMedia={rule.media_mode === "any"}
          commentText={rule.comment_any_word ? "" : firstTerm}
          publicReplyEnabled={rule.public_reply_enabled}
          publicReplyText={rule.public_reply_text ?? ""}
          welcomeText={rule.welcome_text ?? ""}
          welcomeButtonLabel={rule.welcome_button_label ?? ""}
          linkMessageText={replyText}
          links={links}
        />
      ) : (
        <DmPhonePreview
          username={username}
          avatarUrl={avatarUrl}
          incomingText={firstTerm}
          replyText={replyText}
          links={links}
        />
      )}
    </div>
  );
}
