"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { VOICE_SAMPLE_RATE, concatChunks, downsample, encodeWav } from "../utils/wav";

/** Limite de uma gravação (a Meta aceita até 25MB; 5 min em WAV 16 kHz dá ~10MB). */
const MAX_SECONDS = 5 * 60;

type RecorderState = "idle" | "recording";

interface Session {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
}

/**
 * Grava a voz pelo microfone e entrega um arquivo WAV (formato aceito pela
 * Meta). Captura PCM com Web Audio em vez de MediaRecorder, porque o
 * MediaRecorder do Chrome só grava WebM, que a Meta recusa.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const s = session.current;
    session.current = null;
    if (!s) return null;
    s.processor.disconnect();
    s.source.disconnect();
    s.stream.getTracks().forEach((t) => t.stop());
    const rate = s.ctx.sampleRate;
    void s.ctx.close().catch(() => {});
    return { chunks: s.chunks, rate };
  }, []);

  useEffect(() => () => void teardown(), [teardown]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite gravar áudio aqui.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      // Sem ligar na saída o Chrome não processa; a saída fica muda (nada é escrito nela).
      processor.connect(ctx.destination);
      session.current = { stream, ctx, source, processor, chunks };
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        setSeconds((n) => {
          if (n + 1 >= MAX_SECONDS) autoStop.current?.();
          return n + 1;
        });
      }, 1000);
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setError(
        denied
          ? "Permita o uso do microfone no navegador para gravar áudio."
          : "Não foi possível acessar o microfone."
      );
      teardown();
      setState("idle");
    }
  }, [teardown]);

  /** Para e devolve o WAV (null se não gravou nada). */
  const stop = useCallback((): File | null => {
    const captured = teardown();
    setState("idle");
    if (!captured || captured.chunks.length === 0) return null;
    const samples = downsample(concatChunks(captured.chunks), captured.rate, VOICE_SAMPLE_RATE);
    if (samples.length < VOICE_SAMPLE_RATE / 2) return null; // menos de meio segundo: toque acidental
    const wav = encodeWav(samples, VOICE_SAMPLE_RATE);
    return new File([wav], `audio-${Date.now()}.wav`, { type: "audio/wav" });
  }, [teardown]);

  const cancel = useCallback(() => {
    teardown();
    setState("idle");
    setSeconds(0);
  }, [teardown]);

  return { state, seconds, error, start, stop, cancel, autoStop, clearError: () => setError(null) };
}
