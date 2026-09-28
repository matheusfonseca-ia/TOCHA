import { describe, expect, it } from "vitest";

import { parseSentMessage } from "../utils/parse-sent";

const NOW = Date.parse("2026-09-28T18:00:00Z");
const ok = { recipient_id: "lead-1", message_id: "mid-1" };

describe("parseSentMessage", () => {
  it("texto", () => {
    expect(parseSentMessage({ recipient: { id: "lead-1" }, message: { text: "Oi" } }, ok, NOW)).toEqual({
      leadId: "lead-1",
      direction: "outbound",
      mid: "mid-1",
      kind: "text",
      text: "Oi",
      attachments: null,
      meta: null,
      replyToMid: null,
      createdAt: "2026-09-28T18:00:00.000Z",
    });
  });

  it("citação no topo da requisição (formato que funcionou na Fase 0)", () => {
    const draft = parseSentMessage(
      { recipient: { id: "lead-1" }, reply_to: { mid: "m0" }, message: { text: "citando" } },
      ok,
      NOW
    );
    expect(draft?.replyToMid).toBe("m0");
  });

  it("imagem", () => {
    const draft = parseSentMessage(
      { recipient: { id: "lead-1" }, message: { attachment: { type: "image", payload: { url: "https://x/a.png" } } } },
      ok,
      NOW
    );
    expect(draft).toMatchObject({ kind: "image", text: null, attachments: [{ type: "image", url: "https://x/a.png" }] });
  });

  it("button template (portão de seguidor, nós de botões)", () => {
    const draft = parseSentMessage(
      {
        recipient: { id: "lead-1" },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: "Pra liberar, é só me seguir",
              buttons: [
                { type: "web_url", title: "Seguir perfil", url: "https://instagram.com/x" },
                { type: "postback", title: "Já segui", payload: "p" },
              ],
            },
          },
        },
      },
      ok,
      NOW
    );
    expect(draft).toMatchObject({
      kind: "buttons",
      text: "Pra liberar, é só me seguir",
      meta: {
        buttons: [
          { title: "Seguir perfil", type: "web_url", url: "https://instagram.com/x" },
          { title: "Já segui", type: "postback", url: null },
        ],
      },
    });
  });

  it("generic template (resposta de regra com botões): texto vem do título do elemento", () => {
    const draft = parseSentMessage(
      {
        recipient: { id: "lead-1" },
        message: {
          attachment: {
            type: "template",
            payload: { template_type: "generic", elements: [{ title: "Link aqui", buttons: [{ type: "web_url", title: "Abrir", url: "u" }] }] },
          },
        },
      },
      ok,
      NOW
    );
    expect(draft).toMatchObject({ kind: "buttons", text: "Link aqui", meta: { buttons: [{ title: "Abrir" }] } });
  });

  it("respostas rápidas guardam as opções", () => {
    const draft = parseSentMessage(
      { recipient: { id: "lead-1" }, message: { text: "Escolha", quick_replies: [{ title: "A", payload: "a" }, { title: "B", payload: "b" }] } },
      ok,
      NOW
    );
    expect(draft).toMatchObject({ kind: "quick_replies", text: "Escolha", meta: { options: ["A", "B"] } });
  });

  it("resposta privada a comentário: lead vem da resposta da Meta", () => {
    const draft = parseSentMessage(
      { recipient: { comment_id: "c-1" }, message: { text: "Oi" } },
      { recipient_id: "lead-9", message_id: "mid-9" },
      NOW
    );
    expect(draft).toMatchObject({ leadId: "lead-9", mid: "mid-9" });
  });

  it("sem mensagem (digitando, visto) ou sem lead: não grava", () => {
    expect(parseSentMessage({ recipient: { id: "lead-1" }, sender_action: "typing_on" }, ok, NOW)).toBeNull();
    expect(parseSentMessage({ recipient: { comment_id: "c" }, message: { text: "x" } }, {}, NOW)).toBeNull();
  });
});
