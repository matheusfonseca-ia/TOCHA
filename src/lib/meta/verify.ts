import { createHmac, timingSafeEqual } from "crypto";

/**
 * Valida o header X-Hub-Signature-256 do webhook do Meta
 * (HMAC-SHA256 do corpo bruto com o App Secret).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");

  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}
