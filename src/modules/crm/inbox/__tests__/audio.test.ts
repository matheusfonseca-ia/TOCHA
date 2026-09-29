import { describe, expect, it } from "vitest";

import { classifyUpload } from "../utils/attachment-types";
import { VOICE_SAMPLE_RATE, concatChunks, downsample, encodeWav } from "../utils/wav";

const MB = 1024 * 1024;

describe("classifyUpload (formatos conferidos com a Meta em 28/09/2026)", () => {
  it("M4A e MP4 de áudio viram audio/mp4; WAV vira audio/wav", () => {
    expect(classifyUpload("audio/x-m4a", MB, "voz.m4a")).toEqual({ kind: "audio", contentType: "audio/mp4" });
    expect(classifyUpload("audio/mp4", MB, "voz.mp4")).toEqual({ kind: "audio", contentType: "audio/mp4" });
    expect(classifyUpload("audio/wav", MB, "voz.wav")).toEqual({ kind: "audio", contentType: "audio/wav" });
    expect(classifyUpload("audio/x-wav", MB, "voz.wav")).toEqual({ kind: "audio", contentType: "audio/wav" });
    // Navegador que não informa o tipo: decide pela extensão.
    expect(classifyUpload("", MB, "voz.m4a")).toEqual({ kind: "audio", contentType: "audio/mp4" });
  });

  it("MP3 e WebM são recusados com explicação (a Meta recusa os dois)", () => {
    const mp3 = classifyUpload("audio/mpeg", MB, "musica.mp3");
    expect(mp3).toMatchObject({ error: expect.stringContaining("MP3") });
    expect(classifyUpload("audio/webm", MB, "gravacao.webm")).toHaveProperty("error");
  });

  it("imagem e PDF continuam como antes, com os limites de tamanho", () => {
    expect(classifyUpload("image/png", MB, "a.png")).toEqual({ kind: "image", contentType: "image/png" });
    expect(classifyUpload("image/jpeg", 9 * MB, "a.jpg")).toEqual({ error: "Imagem maior que 8MB." });
    expect(classifyUpload("application/pdf", MB, "a.pdf")).toEqual({ kind: "file", contentType: "application/pdf" });
    expect(classifyUpload("audio/wav", 26 * MB, "longo.wav")).toEqual({ error: "Áudio maior que 25MB." });
  });
});

describe("gravação em WAV", () => {
  it("downsample de 48 kHz para 16 kHz reduz a 1/3 e mantém o nível", () => {
    const input = new Float32Array(48000).fill(0.5);
    const out = downsample(input, 48000, VOICE_SAMPLE_RATE);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.5, 5);
  });

  it("taxa igual ou menor não mexe no áudio", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsample(input, 16000, 16000)).toBe(input);
  });

  it("junta os pedaços na ordem", () => {
    expect(Array.from(concatChunks([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
  });

  it("cabeçalho WAV PCM 16-bit mono correto e amostras limitadas a [-1, 1]", () => {
    const samples = new Float32Array([0, 1, -1, 2, -2]);
    const view = new DataView(encodeWav(samples, VOICE_SAMPLE_RATE));
    const text = (o: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(o + i)));

    expect(view.byteLength).toBe(44 + samples.length * 2);
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.getInt16(44 + 2, true)).toBe(32767); // 1
    expect(view.getInt16(44 + 4, true)).toBe(-32768); // -1
    expect(view.getInt16(44 + 6, true)).toBe(32767); // 2 limitado a 1
  });
});
