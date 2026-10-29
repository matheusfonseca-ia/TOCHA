import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyMetaSignature } from "./verify";

const SECRET = "segredo-do-app";
const sign = (body: Uint8Array | string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyMetaSignature", () => {
  const saved = { ig: process.env.INSTAGRAM_APP_SECRET, meta: process.env.META_APP_SECRET };

  beforeEach(() => {
    process.env.INSTAGRAM_APP_SECRET = SECRET;
    delete process.env.META_APP_SECRET;
  });
  afterEach(() => {
    process.env.INSTAGRAM_APP_SECRET = saved.ig;
    process.env.META_APP_SECRET = saved.meta;
  });

  it("aceita a assinatura válida sobre os bytes brutos", () => {
    const body = new TextEncoder().encode('{"object":"instagram"}');
    expect(verifyMetaSignature(body, sign(body))).toBe(true);
  });

  it("assina os bytes, não o texto decodificado (byte inválido em UTF-8)", () => {
    const body = new Uint8Array([0x7b, 0xff, 0x7d]);
    expect(verifyMetaSignature(body, sign(body))).toBe(true);
    // Decodificar e recodificar troca o 0xff por U+FFFD: a assinatura não bate.
    const roundTrip = new TextDecoder().decode(body);
    expect(verifyMetaSignature(roundTrip, sign(body))).toBe(false);
  });

  it("aceita também o META_APP_SECRET", () => {
    process.env.META_APP_SECRET = "outro";
    const body = "{}";
    expect(verifyMetaSignature(body, sign(body, "outro"))).toBe(true);
  });

  it("recusa header ausente, prefixo errado, hex inválido e segredo errado", () => {
    const body = "{}";
    expect(verifyMetaSignature(body, null)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).replace("sha256=", "sha1="))).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abcd")).toBe(false);
    expect(verifyMetaSignature(body, sign(body, "errado"))).toBe(false);
  });

  it("sem nenhum segredo configurado, nada passa", () => {
    delete process.env.INSTAGRAM_APP_SECRET;
    const body = "{}";
    expect(verifyMetaSignature(body, sign(body))).toBe(false);
  });
});
