import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_PREFIX = "sha256=";
const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Valida o header X-Hub-Signature-256 do webhook do Meta
 * (HMAC-SHA256 do corpo bruto com o App Secret).
 *
 * Recebe os bytes exatos da requisição: decodificar para texto antes
 * (request.text()) trocaria bytes inválidos em UTF-8 e quebraria a
 * assinatura. Uma string ainda é aceita (testes, chamadores antigos).
 *
 * A doc não deixa claro se apps com Login do Instagram assinam com o
 * Instagram App Secret ou com o App Secret geral do app — aceitamos
 * qualquer um dos dois que estiver configurado.
 */
export function verifyMetaSignature(
  rawBody: Uint8Array | string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;

  const hex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  // HMAC-SHA256 tem tamanho fixo: header fora do formato nem chega a comparar.
  if (!SHA256_HEX.test(hex)) return false;
  const received = Buffer.from(hex, "hex");
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

  const secrets = [
    process.env.INSTAGRAM_APP_SECRET,
    process.env.META_APP_SECRET,
  ].filter((s): s is string => Boolean(s));

  // Compara com todos os segredos (sem curto-circuito) para o tempo não
  // indicar qual deles foi usado.
  let valid = false;
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(body).digest();
    if (timingSafeEqual(expected, received)) valid = true;
  }
  return valid;
}
