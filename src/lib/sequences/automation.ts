import {
  sendButtonsMessage,
  sendImageMessage,
  sendTextMessage,
} from "@/lib/meta/graph";
import type { Rule } from "@/types/database";

/**
 * Lado servidor do nó "Automação": envio da resposta de uma rule, usado
 * tanto pelo pipeline de regras (`process.ts`) quanto pelo runtime das
 * sequências (nó Automação no meio do fluxo). Um único ponto de envio garante
 * que editar a rule muda o que o fluxo manda.
 */

/** last_error do run quando a rule referenciada pelo nó foi excluída. */
export const AUTOMATION_REMOVED_ERROR = "Automação removida";

/**
 * Envia a 2ª mensagem de uma regra: a resposta direta de uma rule de DM, ou
 * o link entregue após o toque no botão de uma rule de comentário.
 */
export async function sendRuleReply(
  token: string,
  recipientId: string,
  rule: Rule
): Promise<void> {
  if (rule.reply_type === "text") {
    await sendTextMessage(token, recipientId, rule.reply_text ?? "");
  } else if (rule.reply_type === "image") {
    await sendImageMessage(token, recipientId, rule.reply_image_url ?? "");
  } else {
    await sendButtonsMessage(
      token,
      recipientId,
      rule.reply_text ?? "",
      rule.reply_buttons ?? []
    );
  }
}
