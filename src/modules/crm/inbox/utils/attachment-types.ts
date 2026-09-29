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

/** Valida tipo e tamanho e devolve o tipo de envio e o Content-Type a gravar. */
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
