import { describe, expect, it } from "vitest";

import {
  classifyInboundEvent,
  refLinkUrl,
  triggerMatchesInbound,
} from "@/lib/meta/triggers";
import type { TriggerNodeData } from "@/types/sequence";

const triggerData = (
  overrides: Partial<TriggerNodeData> = {}
): TriggerNodeData => ({
  anyMessage: false,
  keyword: "",
  matchType: "contains",
  ...overrides,
});

describe("classifyInboundEvent", () => {
  it("classifica DM com texto", () => {
    expect(classifyInboundEvent({ message: { text: "oi" } })).toEqual({
      kind: "dm",
      text: "oi",
    });
  });

  it("classifica resposta a story (message.reply_to.story)", () => {
    expect(
      classifyInboundEvent({
        message: {
          text: "adorei!",
          reply_to: { story: { id: "s1", url: "https://cdn/x.jpg" } },
        },
      })
    ).toEqual({ kind: "storyReply", text: "adorei!" });
  });

  it("classifica menção em story (attachments[].type === story_mention), sem texto", () => {
    expect(
      classifyInboundEvent({
        message: { attachments: [{ type: "story_mention" }] },
      })
    ).toEqual({ kind: "storyMention", text: "" });
  });

  it("classifica link de referência (referral.ref), mesmo sem message", () => {
    expect(
      classifyInboundEvent({
        referral: { ref: "promo10", source: "https://ig.me/m/conta?ref=promo10", type: "OPEN_THREAD" },
      })
    ).toEqual({ kind: "refLink", text: "", ref: "promo10" });
  });

  it("referral junto de uma mensagem de texto ainda é refLink (ref é o sinal mais específico)", () => {
    expect(
      classifyInboundEvent({
        message: { text: "quero saber mais" },
        referral: { ref: "promo10" },
      })
    ).toEqual({ kind: "refLink", text: "quero saber mais", ref: "promo10" });
  });

  it("retorna null sem nenhum sinal (eco, delivery receipt, etc.)", () => {
    expect(classifyInboundEvent({})).toBeNull();
    expect(classifyInboundEvent({ message: {} })).toBeNull();
    expect(
      classifyInboundEvent({ message: { attachments: [{ type: "image" }] } })
    ).toBeNull();
  });
});

describe("triggerMatchesInbound", () => {
  it("dm: exige keyword ou anyMessage, nunca casa com outra fonte", () => {
    const data = triggerData({ keyword: "preço", matchType: "contains" });
    expect(triggerMatchesInbound(data, { kind: "dm", text: "qual o preço?" })).toBe(true);
    expect(triggerMatchesInbound(data, { kind: "dm", text: "oi" })).toBe(false);
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "preço" })).toBe(false);
  });

  it("automation nunca casa por evento de entrada", () => {
    const data = triggerData({ source: "automation" });
    expect(triggerMatchesInbound(data, { kind: "dm", text: "qualquer coisa" })).toBe(false);
  });

  it("storyReply sem keyword casa com qualquer resposta a story", () => {
    const data = triggerData({ source: "storyReply" });
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "" })).toBe(true);
    expect(triggerMatchesInbound(data, { kind: "storyMention", text: "" })).toBe(false);
  });

  it("storyReply com keyword filtra pelo texto da resposta", () => {
    const data = triggerData({ source: "storyReply", keyword: "top" });
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "top demais" })).toBe(true);
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "legal" })).toBe(false);
  });

  it("storyMention sem keyword casa com qualquer menção (não tem texto de verdade)", () => {
    const data = triggerData({ source: "storyMention" });
    expect(triggerMatchesInbound(data, { kind: "storyMention", text: "" })).toBe(true);
  });

  it("refLink exige refCode configurado e igual ao ref recebido", () => {
    const data = triggerData({ source: "refLink", refCode: "promo10" });
    expect(
      triggerMatchesInbound(data, { kind: "refLink", text: "", ref: "promo10" })
    ).toBe(true);
    expect(
      triggerMatchesInbound(data, { kind: "refLink", text: "", ref: "outro" })
    ).toBe(false);
  });

  it("refLink sem refCode configurado nunca casa (gatilho incompleto)", () => {
    const data = triggerData({ source: "refLink" });
    expect(
      triggerMatchesInbound(data, { kind: "refLink", text: "", ref: "promo10" })
    ).toBe(false);
  });

  it("refLink ignora palavra-chave que sobrou de outro modo: o código basta", () => {
    const data = triggerData({ source: "refLink", refCode: "promo10", keyword: "quero" });
    expect(
      triggerMatchesInbound(data, { kind: "refLink", text: "", ref: "promo10" })
    ).toBe(true);
  });

  it("storyMention ignora palavra-chave (menção não tem texto)", () => {
    const data = triggerData({ source: "storyMention", keyword: "promo" });
    expect(triggerMatchesInbound(data, { kind: "storyMention", text: "" })).toBe(true);
  });

  it("anyMessage que sobrou do modo 'Qualquer DM' não anula o filtro de story", () => {
    const data = triggerData({ source: "storyReply", anyMessage: true, keyword: "top" });
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "legal" })).toBe(false);
    expect(triggerMatchesInbound(data, { kind: "storyReply", text: "top!" })).toBe(true);
  });

  it("gatilho ainda não definido (unset) nunca casa", () => {
    const data = triggerData({ source: "unset", anyMessage: true });
    expect(triggerMatchesInbound(data, { kind: "dm", text: "oi" })).toBe(false);
  });
});

describe("classifyInboundEvent: referral dentro da mensagem", () => {
  it("conversa nova aberta por ig.me?ref traz o ref em message.referral", () => {
    expect(
      classifyInboundEvent({ message: { text: "oi", referral: { ref: "promo10" } } })
    ).toEqual({ kind: "refLink", text: "oi", ref: "promo10" });
  });
});

describe("refLinkUrl", () => {
  it("monta a URL ig.me/m/<usuário>?ref=<código>", () => {
    expect(refLinkUrl("minha_conta", "promo10")).toBe(
      "https://ig.me/m/minha_conta?ref=promo10"
    );
  });

  it("usa placeholders quando usuário/código ainda não foram preenchidos", () => {
    expect(refLinkUrl("", "")).toBe("https://ig.me/m/sua_conta?ref=codigo");
  });
});
