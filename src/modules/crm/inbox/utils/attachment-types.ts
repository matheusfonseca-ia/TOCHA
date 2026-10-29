/**
 * O que o composer aceita como anexo. Formatos de áudio conferidos com conta
 * real em 28/09/2026: M4A (AAC), MP4 só com áudio e WAV passam; MP3 e WebM
 * (o que o Chrome grava por padrão) a Meta recusa com "formato de anexo não
 * é aceito". Por isso o gravador do painel gera WAV.
 */

export type UploadKind = "image" | "audio" | "file";

const MB = 1024 * 1024;

export const COMPOSER_ACCEPT =
  "image/png,image/jpeg,application/pdf,audio/mp4,audio/x-m4a,audio/m4a,audio/wav,audio/x-wav,audio/wave,.m4a,.wav";

const IMAGE_TYPES = ["image/png", "image/jpeg"];
const AUDIO_TYPES = ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"];

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type UploadCheck =
  | { kind: UploadKind; contentType: string }
  | { error: string };

/**
 * Valida tipo e tamanho e devolve o tipo de envio e o Content-Type a gravar.
 * Só olha o que o navegador declarou: o conteúdo é conferido depois, com
 * `contentMatchesType`.
 */
export function classifyUpload(type: string, size: number, name: string): UploadCheck {
  const ext = extension(name);

  if (IMAGE_TYPES.includes(type)) {
    return size > 8 * MB ? { error: "Imagem maior que 8MB." } : { kind: "image", contentType: type };
  }
  if (type === "application/pdf" || ext === "pdf") {
    return size > 25 * MB ? { error: "PDF maior que 25MB." } : { kind: "file", contentType: "application/pdf" };
  }
  if (type === "audio/mpeg" || ext === "mp3") {
    return { error: "O Instagram não aceita MP3. Envie o áudio em M4A ou WAV, ou grave pelo microfone." };
  }
  const isWav = ext === "wav" || type.includes("wav");
  if (AUDIO_TYPES.includes(type) || ext === "m4a" || ext === "wav") {
    if (size > 25 * MB) return { error: "Áudio maior que 25MB." };
    return { kind: "audio", contentType: isWav ? "audio/wav" : "audio/mp4" };
  }
  return { error: "Envie uma imagem (PNG ou JPG), um PDF ou um áudio (M4A ou WAV)." };
}

/** Quantos bytes do começo do arquivo `contentMatchesType` precisa ler. */
export const SNIFF_BYTES = 16;

function startsWith(head: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  return bytes.every((b, i) => head[offset + i] === b);
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * Confere a assinatura (magic bytes) do arquivo contra o Content-Type que
 * vai ser gravado: o tipo e a extensão vêm do navegador e não provam nada.
 * PNG, JPEG, PDF (`%PDF-`), WAV (`RIFF....WAVE`) e M4A/MP4 (`....ftyp`).
 */
export function contentMatchesType(contentType: string, head: Uint8Array): boolean {
  switch (contentType) {
    case "image/png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "application/pdf":
      return startsWith(head, ascii("%PDF-"));
    case "audio/wav":
      return startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WAVE"), 8);
    case "audio/mp4":
      return startsWith(head, ascii("ftyp"), 4);
    default:
      return false;
  }
}

/** Tipos de anexo que o composer envia (os mesmos que o upload devolve). */
export const SENDABLE_KINDS: readonly UploadKind[] = ["image", "audio", "file"];

export function isSendableKind(kind: unknown): kind is UploadKind {
  return typeof kind === "string" && (SENDABLE_KINDS as readonly string[]).includes(kind);
}

const BUCKET_PUBLIC_PATH = "/storage/v1/object/public/crm-uploads/";
// `<uuid>-<nome sanitizado>`, o formato que `uploadComposerAttachment` grava.
const OBJECT_NAME = /^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$/;

/**
 * A URL do anexo é um arquivo que o próprio painel subiu para esta conta:
 * mesma origem do Supabase do projeto, bucket `crm-uploads`, pasta da conta
 * e nome no formato do upload (sem subpasta, query ou `..`).
 */
export function isOwnUploadUrl(url: unknown, supabaseUrl: string | undefined, accountId: string): boolean {
  if (typeof url !== "string" || !supabaseUrl || !accountId) return false;
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== base.origin || parsed.search || parsed.hash || parsed.username || parsed.password) return false;
  const prefix = `${BUCKET_PUBLIC_PATH}${accountId}/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  return OBJECT_NAME.test(parsed.pathname.slice(prefix.length));
}
