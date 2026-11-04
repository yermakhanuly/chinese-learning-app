/**
 * Pinyin helpers shared by the app and the data import scripts.
 * Keep this file free of imports so Node can run it directly.
 */

const TONE_MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

const VOWELS = 'aeiouü';

/** Picks which vowel carries the tone mark, following standard pinyin rules. */
function toneVowelIndex(syllable: string): number {
  const lower = syllable.toLowerCase();
  const a = lower.indexOf('a');
  if (a !== -1) return a;
  const e = lower.indexOf('e');
  if (e !== -1) return e;
  const ou = lower.indexOf('ou');
  if (ou !== -1) return ou;
  for (let i = lower.length - 1; i >= 0; i--) {
    if (VOWELS.includes(lower[i])) return i;
  }
  return -1;
}

/** Converts one numbered syllable ("lu:4", "Zhong1", "ma5") to tone-mark form ("lǜ", "Zhōng", "ma"). */
export function numberedSyllableToMarked(token: string): string {
  const match = /^([a-zA-ZüÜ:]+)([1-5])$/.exec(token);
  if (!match) return token.replace(/u:/g, 'ü').replace(/U:/g, 'Ü');
  const tone = Number(match[2]);
  const base = match[1].replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü');
  if (tone === 5) return base;
  const idx = toneVowelIndex(base);
  if (idx === -1) return base;
  const vowel = base[idx];
  const marked = TONE_MARKS[vowel.toLowerCase()][tone - 1];
  return base.slice(0, idx) + (vowel === vowel.toUpperCase() ? marked.toUpperCase() : marked) + base.slice(idx + 1);
}

/** Converts a space-separated numbered pinyin string ("ni3 hao3") to tone marks ("nǐ hǎo"). */
export function numberedToMarked(pinyin: string): string {
  return pinyin
    .trim()
    .split(/\s+/)
    .map(numberedSyllableToMarked)
    .join(' ');
}

/**
 * Lowercase, tone-less, space-less pinyin used for search ("Nǚ'ér" / "nu:3 er2" → "nver").
 * ü is written as "v", the way most Chinese keyboards type it.
 */
export function toPlainPinyin(pinyin: string): string {
  return pinyin
    .toLowerCase()
    .replace(/u:/g, 'v')
    .normalize('NFD')
    .replace(/u\u0308/g, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Tone numbers (1–5, 5 = neutral) of each syllable in a numbered pinyin string. */
export function tonesOf(numbered: string): number[] {
  return numbered
    .trim()
    .split(/\s+/)
    .map((s) => /([1-5])$/.exec(s))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
}
