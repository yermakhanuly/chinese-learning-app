/**
 * WAV encoding and pitch (F0) tracking for pronunciation feedback: the learner's pitch curve is
 * drawn over the model voice's. Pure, no dependencies. (Automatic tone verdicts were tried and
 * judged too unreliable on real speech: final syllables often go creaky and lose their pitch.)
 */

/** Little-endian 16-bit PCM WAV → mono samples in -1..1 and the sample rate. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('Only 16-bit WAV is supported');
      const end = Math.min(bytes.length, body + size);
      const frames = Math.floor((end - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = view.getInt16(body + i * 2 * channels, true) / 32768;
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV has no data');
}

/** Mono samples → 16-bit PCM WAV bytes. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return bytes;
}

/** Linear resampling (good enough for speech going to 16 kHz). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.floor((samples.length * to) / from));
  const ratio = from / to;
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const t = x - j;
    out[i] = (samples[j] ?? 0) * (1 - t) + (samples[j + 1] ?? samples[j] ?? 0) * t;
  }
  return out;
}

export type PitchFrame = { time: number; hz: number | null };

/**
 * YIN pitch tracker: one estimate every `hop` seconds; `hz` is null for unvoiced/silent frames.
 */
export function trackPitch(
  samples: Float32Array,
  sampleRate: number,
  { minHz = 70, maxHz = 450, hop = 0.01, window = 0.04, threshold = 0.3 } = {},
): PitchFrame[] {
  const size = Math.round(window * sampleRate);
  const step = Math.round(hop * sampleRate);
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(size - 1, Math.ceil(sampleRate / minHz));
  const diff = new Float32Array(maxLag + 1);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const silence = Math.max(0.003, peak * 0.02);
  const frames: PitchFrame[] = [];

  for (let start = 0; start + size + maxLag < samples.length; start += step) {
    const time = (start + size / 2) / sampleRate;
    let energy = 0;
    for (let i = 0; i < size; i++) energy += samples[start + i] ** 2;
    if (Math.sqrt(energy / size) < silence) {
      frames.push({ time, hz: null });
      continue;
    }
    // Difference function and cumulative mean normalization.
    diff[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < size; i++) {
        const d = samples[start + i] - samples[start + i + lag];
        sum += d * d;
      }
      running += sum;
      diff[lag] = running ? (sum * lag) / running : 1;
    }
    let lag = -1;
    for (let l = minLag; l <= maxLag; l++) {
      if (diff[l] < threshold) {
        while (l + 1 <= maxLag && diff[l + 1] < diff[l]) l++;
        lag = l;
        break;
      }
    }
    if (lag < 0) {
      frames.push({ time, hz: null });
      continue;
    }
    // Parabolic interpolation around the minimum.
    const a = diff[lag - 1] ?? diff[lag];
    const b = diff[lag];
    const c = diff[lag + 1] ?? diff[lag];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    frames.push({ time, hz: sampleRate / (lag + (Number.isFinite(shift) ? shift : 0)) });
  }
  return smoothPitch(frames);
}

/** Removes octave jumps and single-frame spikes (median of 5). */
function smoothPitch(frames: PitchFrame[]): PitchFrame[] {
  return frames.map((f, i) => {
    if (f.hz == null) return f;
    const near = frames
      .slice(Math.max(0, i - 2), i + 3)
      .map((n) => n.hz)
      .filter((h): h is number => h != null)
      .sort((x, y) => x - y);
    const median = near[Math.floor(near.length / 2)];
    let hz = f.hz;
    if (hz > median * 1.7) hz /= 2;
    else if (hz < median / 1.7) hz *= 2;
    return { time: f.time, hz: Math.abs(hz - median) / median > 0.25 ? median : hz };
  });
}

const semitones = (hz: number, ref: number) => 12 * Math.log2(hz / ref);

export type CurvePoint = { t: number; v: number | null };

/**
 * A recording's pitch curve for drawing: time 0–1 across the voiced part, value in the speaker's
 * own range (−0.5 = their low, +0.5 = their high), so a deep and a high voice can be compared.
 */
export function pitchCurve(frames: PitchFrame[]): { points: CurvePoint[]; start: number; end: number } {
  const voiced = frames.filter((f) => f.hz != null);
  if (voiced.length < 5) return { points: [], start: 0, end: 0 };
  const sorted = voiced.map((f) => f.hz!).sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.05)];
  const high = sorted[Math.floor(sorted.length * 0.95)];
  const mid = Math.sqrt(low * high);
  const range = Math.max(5, semitones(high, low));
  const start = voiced[0].time;
  const end = voiced[voiced.length - 1].time;
  const span = end - start || 1;
  return {
    start,
    end,
    points: frames
      .filter((f) => f.time >= start && f.time <= end)
      .map((f) => ({ t: (f.time - start) / span, v: f.hz == null ? null : Math.max(-0.8, Math.min(0.8, semitones(f.hz, mid) / range)) })),
  };
}

/**
 * The tones a speaker should actually say: third-tone sandhi (3+3 → 2+3) and the tone changes of
 * 不 (bù → bú before a 4th tone) and 一 (yī → yí before 4th, yì before others) inside a word/phrase.
 */
export function spokenTones(chars: string[], tones: number[]): number[] {
  const out = [...tones];
  for (let i = 0; i < out.length - 1; i++) {
    const next = tones[i + 1];
    if (chars[i] === '不' && tones[i] === 4 && next === 4) out[i] = 2;
    else if (chars[i] === '一' && tones[i] === 1 && i + 1 < out.length && next !== 5) out[i] = next === 4 ? 2 : 4;
  }
  // 3-3 sandhi: a third tone before another third tone is said as a second tone (3 3 3 → 2 2 3).
  for (let i = 0; i < out.length - 1; i++) if (tones[i] === 3 && tones[i + 1] === 3) out[i] = 2;
  return out;
}
