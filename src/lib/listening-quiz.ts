/** Builds tone and listening quiz questions (pure; `rand` injectable for tests). */
import type { AudioQuestion } from '@/components/speaking/audio-quiz';
import { TONE_SYLLABLES } from '@/constants/tones';
import { syllableText } from '@/lib/audio-key';
import { shuffle } from '@/lib/character-quiz';
import { numberedSyllableToMarked } from '@/lib/pinyin';

type Rand = () => number;

/** Hear one syllable → which of its four tones? */
export function syllableToneQuestions(count = 10, rand: Rand = Math.random): AudioQuestion[] {
  const all = TONE_SYLLABLES.flatMap((s) => s.marked.map((_, i) => ({ s, tone: i + 1 })));
  return shuffle(all, rand)
    .slice(0, count)
    .map(({ s, tone }) => ({
      audio: syllableText(s.syllable, tone),
      fallback: s.chars[tone - 1],
      prompt: 'Which tone did you hear?',
      options: [...s.marked],
      answer: tone - 1,
      reveal: `${s.chars[tone - 1]} ${s.marked[tone - 1]}`,
    }));
}

export type ToneWord = { simplified: string; pinyin_numeric: string };

/** "ni3 hao3" → syllables and tones; null for words that aren't plain syllables. */
function split(numbered: string): { bases: string[]; tones: number[] } | null {
  const parts = numbered.trim().split(/\s+/);
  const m = parts.map((p) => /^([a-zA-Zü:]+)([1-5])$/.exec(p));
  if (m.some((x) => !x)) return null;
  return { bases: m.map((x) => x![1].toLowerCase()), tones: m.map((x) => Number(x![2])) };
}

const mark = (bases: string[], tones: number[]) =>
  bases.map((b, i) => numberedSyllableToMarked(`${b}${tones[i]}`)).join(' ');

/** Hear a word → which tones? Options are the same syllables with other tones. */
export function wordToneQuestions(words: ToneWord[], count = 10, rand: Rand = Math.random): AudioQuestion[] {
  const usable = words.map((w) => ({ w, p: split(w.pinyin_numeric) })).filter((x) => x.p && x.p.bases.length >= 2);
  return shuffle(usable, rand)
    .slice(0, count)
    .map(({ w, p }) => {
      const correct = mark(p!.bases, p!.tones);
      const options = new Set([correct]);
      for (let tries = 0; options.size < 4 && tries < 100; tries++) {
        // Change one or two syllables' tones (never to neutral).
        const tones = [...p!.tones];
        const changes = rand() < 0.5 ? 1 : 2;
        for (let c = 0; c < changes; c++) tones[Math.floor(rand() * tones.length)] = 1 + Math.floor(rand() * 4);
        options.add(mark(p!.bases, tones));
      }
      const shuffled = shuffle([...options], rand);
      return {
        audio: w.simplified,
        prompt: 'Which tones did you hear?',
        options: shuffled,
        answer: shuffled.indexOf(correct),
        reveal: `${w.simplified} ${correct}`,
      };
    });
}

/** Hear a sentence → what does it mean? */
export function sentenceMeaningQuestions(
  sentences: { simplified: string; english: string }[],
  count = 10,
  rand: Rand = Math.random,
): AudioQuestion[] {
  const pool = shuffle(sentences, rand);
  return pool.slice(0, count).map((s) => {
    const others = shuffle(
      pool.filter((o) => o.english !== s.english),
      rand,
    ).slice(0, 3);
    const options = shuffle([s.english, ...others.map((o) => o.english)], rand);
    return { audio: s.simplified, prompt: 'What does it mean?', options, answer: options.indexOf(s.english), reveal: s.simplified };
  });
}

/** Hear a word → which characters? */
export function wordCharacterQuestions(
  words: { simplified: string; pinyin: string; meanings: string[] }[],
  count = 10,
  rand: Rand = Math.random,
): AudioQuestion[] {
  const pool = shuffle(words, rand);
  return pool.slice(0, count).map((w) => {
    const others = shuffle(
      pool.filter((o) => o.simplified !== w.simplified && o.pinyin !== w.pinyin),
      rand,
    ).slice(0, 3);
    const options = shuffle([w.simplified, ...others.map((o) => o.simplified)], rand);
    return {
      audio: w.simplified,
      prompt: 'Which word did you hear?',
      options,
      answer: options.indexOf(w.simplified),
      zhOptions: true,
      reveal: `${w.simplified} ${w.pinyin} · ${w.meanings[0] ?? ''}`,
    };
  });
}
