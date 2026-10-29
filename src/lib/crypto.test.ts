import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken, secretEquals, TokenUndecryptableError } from "@/lib/crypto";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("encryptToken/decryptToken", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY_A);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ida e volta no formato de 3 partes (o mesmo dos cifrados já gravados)", () => {
    const enc = encryptToken("segredo");
    expect(enc.split(".")).toHaveLength(3);
    expect(decryptToken(enc)).toBe("segredo");
  });

  it("chave trocada sem a anterior configurada: erro tipado", () => {
    const enc = encryptToken("segredo");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY_B);
    expect(() => decryptToken(enc)).toThrow(TokenUndecryptableError);
  });

  it("rotação: decifra com TOKEN_ENCRYPTION_KEY_PREVIOUS e cifra com a nova", () => {
    const old = encryptToken("segredo");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY_B);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", KEY_A);
    expect(decryptToken(old)).toBe("segredo");
    const fresh = encryptToken("segredo");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", "");
    expect(decryptToken(fresh)).toBe("segredo");
  });

  it("payload adulterado não abre", () => {
    const [iv, tag, data] = encryptToken("segredo").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptToken([iv, tag, flipped.toString("base64")].join("."))).toThrow(TokenUndecryptableError);
  });
});

describe("secretEquals", () => {
  it("compara o conteúdo, inclusive com tamanhos diferentes", () => {
    expect(secretEquals("abc", "abc")).toBe(true);
    expect(secretEquals("abc", "abd")).toBe(false);
    expect(secretEquals("abc", "abcd")).toBe(false);
  });
  it("vazio ou ausente nunca bate", () => {
    expect(secretEquals("", "")).toBe(false);
    expect(secretEquals(null, "x")).toBe(false);
    expect(secretEquals("x", undefined)).toBe(false);
  });
});
