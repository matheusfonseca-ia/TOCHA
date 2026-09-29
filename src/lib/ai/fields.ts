/**
 * Catálogo dos campos de texto que o botão ✨ sabe escrever.
 *
 * Cada campo carrega o próprio limite e o próprio papel, então o prompt nasce
 * pronto: quem clica não precisa explicar que a resposta pública tem 300
 * caracteres nem que ela serve pra avisar que a mensagem foi pro direct.
 *
 * Os limites aqui são os mesmos aplicados na validação (rules/actions.ts,
 * follow-gate/copy.ts e sequences/graph.ts) — se um mudar lá, muda aqui.
 */

export type AiFieldKind =
  | "publicReply"
  | "welcomeText"
  | "buttonLabel"
  | "replyText"
  | "followGateText"
  | "followGateRetry"
  | "messageNode"
  | "quickReply"
  | "collectQuestion";

export interface AiFieldSpec {
  /** Como o campo se chama na tela (aparece no prompt e no popover). */
  label: string;
  /** Teto de caracteres do campo. Sugestão maior que isso é descartada. */
  maxChars: number;
  /** O que esse texto precisa fazer. É a instrução base do prompt. */
  role: string;
}

export const AI_FIELD_SPECS: Record<AiFieldKind, AiFieldSpec> = {
  publicReply: {
    label: "Resposta pública do comentário",
    maxChars: 300,
    role: "responder publicamente ao comentário avisando, de forma curta e natural, que a mensagem foi enviada no direct",
  },
  welcomeText: {
    label: "Mensagem de boas-vindas",
    maxChars: 640,
    role: "abrir a conversa no direct depois do comentário e convencer a pessoa a tocar no botão que vem logo abaixo",
  },
  buttonLabel: {
    label: "Rótulo do botão",
    maxChars: 20,
    role: "rotular um botão: uma chamada curta, no imperativo, que diga o que acontece ao tocar",
  },
  replyText: {
    label: "Mensagem entregue",
    maxChars: 1000,
    role: "entregar o que foi prometido na conversa do direct, de forma direta e sem enrolação",
  },
  followGateText: {
    label: "Mensagem do portão de seguidor",
    maxChars: 640,
    role: "pedir com leveza que a pessoa siga o perfil antes de receber o conteúdo, sem soar como cobrança",
  },
  followGateRetry: {
    label: "Mensagem de ainda não segue",
    maxChars: 640,
    role: "avisar, sem constranger, que o Instagram ainda não mostrou que a pessoa seguiu, e pedir pra tocar de novo em Já segui",
  },
  messageNode: {
    label: "Mensagem do workflow",
    maxChars: 1000,
    role: "mandar mais uma mensagem dentro de uma conversa automática que já está em andamento",
  },
  quickReply: {
    label: "Resposta rápida",
    maxChars: 20,
    role: "rotular uma resposta rápida: duas ou três palavras que a pessoa toca pra responder",
  },
  collectQuestion: {
    label: "Pergunta do coletar dado",
    maxChars: 1000,
    role: "perguntar um dado (nome, e-mail, telefone) de um jeito que a pessoa tenha vontade de responder",
  },
};

export function aiFieldSpec(field: AiFieldKind): AiFieldSpec {
  return AI_FIELD_SPECS[field];
}
