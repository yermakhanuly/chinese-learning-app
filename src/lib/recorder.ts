import { useRef, useState } from 'react';

import { encodeWav, resample } from '@/lib/pitch';
import type { Recording, Recorder } from '@/lib/recorder.types';

/**
 * Web: records raw audio with the Web Audio API and builds a 16 kHz WAV (the browser's own
 * recorder makes WebM, which Azure pronunciation assessment doesn't accept).
 */
export function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<{ stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode; chunks: Float32Array[] } | null>(null);

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('Microphone access is blocked. Allow it in your browser (the icon in the address bar).');
      return false;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    session.current = { stream, ctx, node, chunks };
    setRecording(true);
    return true;
  }

  async function stop(): Promise<Recording | null> {
    const s = session.current;
    session.current = null;
    setRecording(false);
    if (!s) return null;
    s.node.disconnect();
    s.stream.getTracks().forEach((t) => t.stop());
    const rate = s.ctx.sampleRate;
    await s.ctx.close();
    const all = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of s.chunks) {
      all.set(c, o);
      o += c.length;
    }
    const samples = resample(all, rate, 16000);
    const wav = encodeWav(samples, 16000);
    const uri = URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }));
    return { wav, samples, uri, durationMs: Math.round((samples.length / 16000) * 1000) };
  }

  return { start, stop, recording, error };
}
