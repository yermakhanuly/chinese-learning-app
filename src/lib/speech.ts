import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

/**
 * Word and sentence audio with the device's built-in Chinese voice (iPhone, or the browser's).
 * Phase 6 replaces this with recorded neural voices; callers only use `useSpeech()`.
 */
let voiceLookup: Promise<string | undefined> | null = null;

/** Best Mandarin (mainland) voice: enhanced quality first, then any zh-CN, then any Chinese. */
function chineseVoice(): Promise<string | undefined> {
  // Browsers without voices never answer; give up after a moment and use the default voice.
  const timeout = new Promise<Speech.Voice[]>((resolve) => setTimeout(() => resolve([]), 1500));
  voiceLookup ??= Promise.race([Speech.getAvailableVoicesAsync(), timeout])
    .then((voices) => {
      const lang = (v: Speech.Voice) => v.language.replace('_', '-').toLowerCase();
      const mainland = voices.filter(
        (v) => lang(v) === 'zh-cn' || lang(v).startsWith('zh-hans') || lang(v) === 'cmn-cn',
      );
      const best =
        mainland.find((v) => v.quality === Speech.VoiceQuality.Enhanced) ??
        mainland[0] ??
        voices.find((v) => lang(v).startsWith('zh') && !lang(v).includes('hk'));
      return best?.identifier;
    })
    .catch(() => undefined);
  return voiceLookup;
}

// Which text is playing, so only that button shows as active.
let playing: string | null = null;
const listeners = new Set<() => void>();
function setPlaying(id: string | null) {
  playing = id;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function speakChinese(text: string, id = text) {
  await Speech.stop();
  const voice = await chineseVoice();
  setPlaying(id);
  const done = () => {
    if (playing === id) setPlaying(null);
  };
  Speech.speak(text, {
    language: 'zh-CN',
    voice,
    rate: 0.85,
    onDone: done,
    onStopped: done,
    onError: done,
  });
}

export function useSpeech() {
  const current = useSyncExternalStore(
    subscribe,
    () => playing,
    () => null,
  );
  return { playingId: current, speak: speakChinese, stop: () => Speech.stop() };
}
