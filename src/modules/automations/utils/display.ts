import { triggerSummary } from "@/lib/sequences/graph";
import type { MatchType, ReplyType } from "@/types/database";

import type {
  ListAdapter,
  RuleWithAccount,
  SequenceStats,
  SequenceWithAccount,
} from "../types";

/** Tipo de match em versão curta, antes da palavra-chave na linha de gatilho. */
const MATCH_VERBS: Record<MatchType, string> = {
  exact: "Exatamente",
  contains: "Contém",
  starts_with: "Começa com",
};

/**
 * Data de criação sempre no fuso de Brasília: a linha é renderizada no
 * servidor (Worker em UTC) e o texto do SSR fica, então um fuso fixo evita
 * mostrar o dia seguinte para o que foi criado à noite.
 */
const createdDateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "21/10/2026" no fuso de Brasília. */
export function createdDate(iso: string): string {
  return createdDateFmt.format(new Date(iso));
}

export const REPLY_LABELS: Record<ReplyType, string> = {
  text: "Texto",
  image: "Imagem",
  buttons: "Botões",
};

type RuleLike = Pick<
  RuleWithAccount,
  "name" | "keyword" | "trigger_type" | "match_type" | "reply_type" | "comment_any_word"
>;

/** "execução" ou "execuções", conforme a quantidade. */
export function pluralWord(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** "1 execução", "2 execuções". */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${pluralWord(count, singular, plural)}`;
}

/** Nome mostrado na lista e nos diálogos (mover, expiração). */
export function ruleTitle(rule: RuleLike): string {
  const keywordLabel =
    rule.keyword ?? (rule.trigger_type === "comment" ? "Qualquer comentário" : "");
  return rule.name?.trim() || keywordLabel || "Sem nome";
}

/** "DM · Contém “preço” · Texto" / "Comentário · Qualquer comentário · Botões". */
export function ruleTriggerLine(rule: RuleLike): string {
  const isComment = rule.trigger_type === "comment";
  const keyword = rule.keyword?.trim();
  const match =
    isComment && rule.comment_any_word
      ? "Qualquer comentário"
      : keyword
        ? `${MATCH_VERBS[rule.match_type]} “${keyword}”`
        : isComment
          ? "Qualquer comentário"
          : "Sem palavra-chave";
  return [isComment ? "Comentário" : "DM", match, REPLY_LABELS[rule.reply_type]].join(" · ");
}

/** Passos do fluxo, sem contar o gatilho. */
export function sequenceBlockCount(sequence: Pick<SequenceWithAccount, "graph">): number {
  return Math.max(sequence.graph.nodes.length - 1, 0);
}

/** "Gatilho: preço · 4 blocos". */
export function sequenceTriggerLine(sequence: Pick<SequenceWithAccount, "graph">): string {
  const blocks = sequenceBlockCount(sequence);
  return `Gatilho: ${triggerSummary(sequence.graph)} · ${countLabel(blocks, "bloco", "blocos")}`;
}

export function ruleAdapter(
  executionCounts: Record<string, number>
): ListAdapter<RuleWithAccount> {
  return {
    searchFields: (rule) => [rule.name, rule.keyword],
    name: (rule) => ruleTitle(rule),
    isActive: (rule) => rule.is_active,
    createdAt: (rule) => rule.created_at,
    updatedAt: (rule) => rule.updated_at,
    executions: (rule) => executionCounts[rule.id] ?? 0,
    priority: (rule) => rule.priority,
    folderId: (rule) => rule.folder_id,
    kind: (rule) => rule.trigger_type,
    accountId: (rule) => rule.account_id,
  };
}

export function sequenceAdapter(
  stats: Record<string, SequenceStats>
): ListAdapter<SequenceWithAccount> {
  return {
    searchFields: (sequence) => [sequence.name],
    name: (sequence) => sequence.name,
    isActive: (sequence) => sequence.is_active,
    createdAt: (sequence) => sequence.created_at,
    updatedAt: (sequence) => sequence.updated_at,
    executions: (sequence) => stats[sequence.id]?.total ?? 0,
    folderId: (sequence) => sequence.folder_id,
  };
}
