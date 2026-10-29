import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Criptografia AES-256-GCM para tokens do Meta em repouso.
 * Formato do payload: base64(iv).base64(authTag).base64(ciphertext)
 *
 * O formato fica sem versão e sem AAD de propósito: todo cifrado já gravado
 * (ig_accounts, user_ai_settings) e um rollback do deploy precisam continuar
 * abrindo. A rotação planejada usa TOKEN_ENCRYPTION_KEY_PREVIOUS: a chave
 * nova cifra; a antiga só decifra o que ainda não foi recifrado.
 */

const ALGO = "aes-256-gcm";

/** O cifrado não abre com nenhuma chave configurada (chave trocada/perdida ou payload adulterado). */
export class TokenUndecryptableError extends Error {
  constructor(message = "Token criptografado não pode ser decifrado com a chave atual.") {
    super(message);
    this.name = "TokenUndecryptableError";
  }
}

function parseKey(hex: string | undefined, name: string): Buffer {
  if (!hex || hex.length !== 64) {
    throw new Error(`${name} deve conter 32 bytes em hex (64 caracteres).`);
  }
  return Buffer.from(hex, "hex");
}

function getKey(): Buffer {
  return parseKey(process.env.TOKEN_ENCRYPTION_KEY, "TOKEN_ENCRYPTION_KEY");
}

/** Chave anterior, só para decifrar durante uma rotação. Vazia = sem rotação em andamento. */
function previousKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS?.trim();
  return hex ? parseKey(hex, "TOKEN_ENCRYPTION_KEY_PREVIOUS") : null;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

function decryptWith(key: Buffer, iv: Buffer, tag: Buffer, data: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token criptografado em formato inválido.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const current = getKey();
  try {
    return decryptWith(current, iv, tag, data);
  } catch {
    // GCM falha na autenticação com a chave errada: tenta a anterior (rotação).
  }
  const previous = previousKey();
  if (previous) {
    try {
      return decryptWith(previous, iv, tag, data);
    } catch {
      // cai no erro tipado abaixo
    }
  }
  throw new TokenUndecryptableError();
}

/**
 * Compara segredos (CRON_SECRET, verify token) em tempo constante. Os dois
 * lados passam por SHA-256 antes: assim os buffers sempre têm 32 bytes e nem o
 * tamanho do segredo vaza. Vazio nunca bate.
 */
export function secretEquals(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false;
  const a = createHash("sha256").update(received, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
