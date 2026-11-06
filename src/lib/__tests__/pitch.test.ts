import { audioKey } from '../audio-key';
import { decodeWav, encodeWav, pitchCurve, resample, spokenTones, trackPitch } from '../pitch';

const RATE = 16000;
/** A voiced-like test signal (fundamental + harmonics) whose pitch glides from f0 to f1 Hz. */
function glide(f0: number, f1: number, seconds = 0.5) {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    phase += (2 * Math.PI * f) / RATE;
    out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase);
  }
  return out;
}

describe('pitch tracking', () => {
  it('finds the pitch of a steady voice', () => {
    const hz = trackPitch(glide(200, 200), RATE).filter((f) => f.hz).map((f) => f.hz!);
    expect(hz.length).toBeGreaterThan(30);
    for (const h of hz) expect(Math.abs(h - 200)).toBeLessThan(5);
  });

  it('follows a rising and a falling pitch, and the curve shows it', () => {
    for (const [from, to] of [
      [150, 260],
      [280, 160],
    ]) {
      const frames = trackPitch(glide(from, to), RATE);
      const voiced = frames.filter((f) => f.hz);
      expect(Math.sign(voiced[voiced.length - 1].hz! - voiced[0].hz!)).toBe(Math.sign(to - from));
      const { points } = pitchCurve(frames);
      const vals = points.filter((p) => p.v != null).map((p) => p.v!);
      expect(Math.sign(vals[vals.length - 1] - vals[0])).toBe(Math.sign(to - from));
    }
  });

  it('marks silence as unvoiced', () => {
    expect(trackPitch(new Float32Array(RATE / 2), RATE).every((f) => f.hz === null)).toBe(true);
  });
});

describe('WAV', () => {
  it('round-trips 16-bit PCM and resamples', () => {
    const samples = glide(220, 220, 0.1);
    const back = decodeWav(encodeWav(samples, RATE));
    expect(back.sampleRate).toBe(RATE);
    expect(back.samples.length).toBe(samples.length);
    expect(Math.abs(back.samples[100] - samples[100])).toBeLessThan(0.001);
    expect(resample(samples, 48000, 16000).length).toBe(Math.floor(samples.length / 3));
  });
});

describe('tone changes', () => {
  it('applies third-tone sandhi and the changes of 不 and 一', () => {
    expect(spokenTones(['你', '好'], [3, 3])).toEqual([2, 3]);
    expect(spokenTones(['我', '很', '好'], [3, 3, 3])).toEqual([2, 2, 3]);
    expect(spokenTones(['不', '是'], [4, 4])).toEqual([2, 4]);
    expect(spokenTones(['不', '好'], [4, 3])).toEqual([4, 3]);
    expect(spokenTones(['一', '个'], [1, 4])).toEqual([2, 4]);
    expect(spokenTones(['一', '起'], [1, 3])).toEqual([4, 3]);
  });
});

describe('audioKey', () => {
  it('is stable, 16 hex chars, and differs between texts', () => {
    expect(audioKey('你好')).toMatch(/^[0-9a-f]{16}$/);
    expect(audioKey('你好')).toBe(audioKey('你好'));
    expect(audioKey('你好')).not.toBe(audioKey('您好'));
  });
});

describe('bytesToBase64', () => {
  it('matches the standard encoding', () => {
    const { bytesToBase64 } = jest.requireActual('../base64');
    for (const s of ['', 'a', 'ab', 'abc', 'hello world', '你好']) {
      const bytes = new TextEncoder().encode(s);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
