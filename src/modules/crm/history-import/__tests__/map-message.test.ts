import { describe, expect, it } from "vitest";

import type { IgConversationMessage } from "@/lib/meta/graph";

import { findLeadParticipant, mapImportedMessage } from "../utils/map-message";

const ACCOUNT_ID = "acc-1";
const LEAD_ID = "lead-1";

describe("findLeadParticipant", () => {
  it("acha o participante que não é a conta", () => {
    expect(findLeadParticipant([{ id: ACCOUNT_ID }, { id: LEAD_ID }], ACCOUNT_ID)).toBe(LEAD_ID);
  });

  it("sem participante além da conta, devolve null", () => {
    expect(findLeadParticipant([{ id: ACCOUNT_ID }], ACCOUNT_ID)).toBeNull();
  });
});

describe("mapImportedMessage", () => {
  const base: IgConversationMessage = {
    id: "m1",
    created_time: "2026-09-01T10:00:00+0000",
  };

  it("mensagem de texto do lead: inbound", () => {
    const draft = mapImportedMessage(
      { ...base, from: { id: LEAD_ID }, message: "oi, tudo bem?" },
      ACCOUNT_ID,
      LEAD_ID
    );
    expect(draft).toMatchObject({
      leadId: LEAD_ID,
      direction: "inbound",
      mid: "m1",
      kind: "text",
      text: "oi, tudo bem?",
      attachments: null,
      replyToMid: null,
    });
    expect(draft.createdAt).toBe(new Date("2026-09-01T10:00:00+0000").toISOString());
  });

  it("mensagem da conta: outbound", () => {
    const draft = mapImportedMessage(
      { ...base, from: { id: ACCOUNT_ID }, message: "oi! como posso ajudar?" },
      ACCOUNT_ID,
      LEAD_ID
    );
    expect(draft.direction).toBe("outbound");
  });

  it("imagem: kind image com a URL do anexo", () => {
    const draft = mapImportedMessage(
      {
        ...base,
        from: { id: LEAD_ID },
        attachments: { data: [{ image_data: { url: "https://cdn.example.com/foto.jpg" } }] },
      },
      ACCOUNT_ID,
      LEAD_ID
    );
    expect(draft.kind).toBe("image");
    expect(draft.attachments).toEqual([{ type: "attachment", url: "https://cdn.example.com/foto.jpg" }]);
  });

  it("vídeo: kind video", () => {
    const draft = mapImportedMessage(
      { ...base, from: { id: LEAD_ID }, attachments: { data: [{ video_data: { url: "https://cdn.example.com/v.mp4" } }] } },
      ACCOUNT_ID,
      LEAD_ID
    );
    expect(draft.kind).toBe("video");
  });

  it("mensagem vazia recebida do lead (mídia que a API não devolve) vira anexo", () => {
    const draft = mapImportedMessage({ id: "m-x", created_time: "2026-09-28T18:06:22+0000", from: { id: "lead-1" }, message: "" }, "conta-1", "lead-1");
    expect(draft.kind).toBe("attachment");
    expect(draft.text).toBeNull();
  });

  it("mensagem com botões enviada pela conta: texto vazio vira kind buttons sem texto", () => {
    const draft = mapImportedMessage({ ...base, from: { id: ACCOUNT_ID }, message: "" }, ACCOUNT_ID, LEAD_ID);
    expect(draft.kind).toBe("buttons");
    expect(draft.text).toBeNull();
  });

  it("citação: replyToMid vem do reply_to.id", () => {
    const draft = mapImportedMessage(
      { ...base, from: { id: LEAD_ID }, message: "concordo", reply_to: { id: "m0" } },
      ACCOUNT_ID,
      LEAD_ID
    );
    expect(draft.replyToMid).toBe("m0");
  });
});
