import { createHmac, timingSafeEqual } from "crypto";

/**
 * Valida o header X-Hub-Signature-256 do webhook do Meta
 * (HMAC-SHA256 do corpo bruto com o App Secret).
 *
 * A doc não deixa claro se apps com Login do Instagram assinam com o
 * Instagram App Secret ou com o App Secret geral do app — aceitamos
 * qualquer um dos dois que estiver configurado.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const secrets = [
    process.env.INSTAGRAM_APP_SECRET,
    process.env.META_APP_SECRET,
  ].filter((s): s is string => Boolean(s));

  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest();
    return (
      received.length === expected.length && timingSafeEqual(expected, received)
    );
  });
}
