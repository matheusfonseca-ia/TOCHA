import { describe, expect, it } from "vitest";

import { eventTime, parseMessagingEvent } from "../utils/parse-event";

/**
 * Formatos reais capturados na Fase 0 do CRM (28/09/2026) com a conta
 * @euheliomonteiro e o lead de teste @ion_comunnity. Os mids foram encurtados.
 */

const BIZ = "17841479948189084";
const LEAD = "4181139912021434";
const NOW = Date.parse("2026-09-28T18:10:00Z");
const TS = Date.parse("2026-09-28T18:03:10Z");

const fromLead = { sender: { id: LEAD }, recipient: { id: BIZ }, timestamp: TS };
const fromBiz = { sender: { id: BIZ }, recipient: { id: LEAD }, timestamp: TS };

describe("parseMessagingEvent", () => {
  it("texto do lead", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "m1", text: "alo" } }, NOW);
    expect(action).toEqual({
      type: "message",
      echo: false,
      message: {
        leadId: LEAD,
        direction: "inbound",
        mid: "m1",
        kind: "text",
        text: "alo",
        attachments: null,
        meta: null,
        replyToMid: null,
        createdAt: "2026-09-28T18:03:10.000Z",
      },
    });
  });

  it("eco (API ou app, idênticos): saída para o lead que é o recipient", () => {
    const action = parseMessagingEvent(
      BIZ,
      { ...fromBiz, message: { mid: "m2", text: "teste que o claude pediu", is_echo: true } },
      NOW
    );
    expect(action).toMatchObject({
      type: "message",
      echo: true,
      message: { leadId: LEAD, direction: "outbound", kind: "text", text: "teste que o claude pediu" },
    });
  });

  it("citação do lead guarda o mid citado", () => {
    const action = parseMessagingEvent(
      BIZ,
      { ...fromLead, message: { mid: "m3", text: "citando", reply_to: { mid: "m0" } } },
      NOW
    );
    expect(action).toMatchObject({ type: "message", message: { text: "citando", replyToMid: "m0" } });
  });

  it("foto e áudio: tipo pelo anexo, só a URL da CDN, sem texto", () => {
    const url = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=x";
    for (const type of ["image", "audio"] as const) {
      const action = parseMessagingEvent(
        BIZ,
        { ...fromLead, message: { mid: `m-${type}`, attachments: [{ type, payload: { url } }] } },
        NOW
      );
      expect(action).toMatchObject({
        type: "message",
        message: { kind: type, text: null, attachments: [{ type, url }] },
      });
    }
  });

  it("reel e anexo desconhecido", () => {
    const reel = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "r", attachments: [{ type: "ig_reel", payload: { url: "u" } }] } }, NOW);
    expect(reel).toMatchObject({ message: { kind: "reel" } });
    const other = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "o", attachments: [{ type: "novidade" }] } }, NOW);
    expect(other).toMatchObject({ message: { kind: "attachment", attachments: [{ type: "novidade", url: null }] } });
  });

  it("resposta a story guarda o story no meta", () => {
    const action = parseMessagingEvent(
      BIZ,
      { ...fromLead, message: { mid: "s", text: "🔥", reply_to: { story: { id: "18117", url: "https://lookaside.fbsbx.com/x" } } } },
      NOW
    );
    expect(action).toMatchObject({
      message: { kind: "story_reply", text: "🔥", meta: { story: { id: "18117", url: "https://lookaside.fbsbx.com/x" } } },
    });
  });

  it("resposta rápida guarda o payload", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "q", text: "Sim", quick_reply: { payload: "p1" } } }, NOW);
    expect(action).toMatchObject({ message: { kind: "text", meta: { quickReplyPayload: "p1" } } });
  });

  it("toque em botão vira mensagem do lead com o título", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, postback: { mid: "pb", title: "Já segui", payload: "falow:x" } }, NOW);
    expect(action).toMatchObject({
      type: "message",
      message: { direction: "inbound", kind: "postback", text: "Já segui", meta: { payload: "falow:x" } },
    });
  });

  it("mensagem não suportada", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "u", is_unsupported: true } }, NOW);
    expect(action).toMatchObject({ message: { kind: "unsupported" } });
  });

  it("abertura por link sem mensagem é ignorada", () => {
    expect(parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "x" } }, NOW)).toBeNull();
  });

  it("reação do lead usa o emoji exato", () => {
    const action = parseMessagingEvent(
      BIZ,
      { ...fromLead, reaction: { mid: "m1", action: "react", reaction: "like", emoji: "👍" } },
      NOW
    );
    expect(action).toEqual({
      type: "signal",
      leadId: LEAD,
      mid: "m1",
      signal: { type: "reaction", emoji: "👍" },
      at: "2026-09-28T18:03:10.000Z",
    });
  });

  it("remover reação", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, reaction: { mid: "m1", action: "unreact" } }, NOW);
    expect(action).toMatchObject({ type: "signal", signal: { type: "unreaction" } });
  });

  it("edição do lead", () => {
    const action = parseMessagingEvent(
      BIZ,
      { ...fromLead, message_edit: { mid: "m4", text: "teste de edição - editado agora", num_edit: 1 } },
      NOW
    );
    expect(action).toMatchObject({
      type: "signal",
      mid: "m4",
      signal: { type: "edit", text: "teste de edição - editado agora", editCount: 1 },
    });
  });

  it("lead desfez o envio", () => {
    const action = parseMessagingEvent(BIZ, { ...fromLead, message: { mid: "m4", is_deleted: true } }, NOW);
    expect(action).toMatchObject({ type: "signal", mid: "m4", signal: { type: "deleted" } });
  });

  it("visto do lead; visto da própria conta é ignorado", () => {
    expect(parseMessagingEvent(BIZ, { ...fromLead, read: { mid: "m1" } }, NOW)).toEqual({
      type: "seen",
      leadId: LEAD,
      at: "2026-09-28T18:03:10.000Z",
    });
    expect(parseMessagingEvent(BIZ, { ...fromBiz, read: { mid: "m1" } }, NOW)).toBeNull();
  });

  it("reação e edição vindas da conta são ignoradas", () => {
    expect(parseMessagingEvent(BIZ, { ...fromBiz, reaction: { mid: "m1", action: "react", emoji: "❤️" } }, NOW)).toBeNull();
    expect(parseMessagingEvent(BIZ, { ...fromBiz, message_edit: { mid: "m1", text: "x" } }, NOW)).toBeNull();
  });

  it("evento sem remetente é ignorado", () => {
    expect(parseMessagingEvent(BIZ, { message: { mid: "m", text: "oi" } }, NOW)).toBeNull();
  });
});

describe("eventTime", () => {
  it("usa o horário da Meta, ou o nosso se vier no futuro ou ausente", () => {
    expect(eventTime(TS, NOW)).toBe("2026-09-28T18:03:10.000Z");
    expect(eventTime(NOW + 60_000, NOW)).toBe(new Date(NOW).toISOString());
    expect(eventTime(undefined, NOW)).toBe(new Date(NOW).toISOString());
  });
});
