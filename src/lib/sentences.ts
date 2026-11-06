/**
 * Example-sentence helpers shared by the data import (Node) and tests.
 * Splits a Chinese sentence into dictionary words, adds pinyin per word, rates how hard it is,
 * and picks the best examples for each HSK word. Relative imports only (Node runs this directly).
 */
import { numberedToMarked } from './pinyin.ts';

/** One word (or punctuation mark) of a sentence. `p` is missing for punctuation and numbers. */
export type Token = { s: string; t: string; p?: string };

export type LexEntry = {
  traditional: string;
  /** Tone-marked pinyin with spaces between syllables ("ài hào"). */
  pinyin: string;
  /** 2026 HSK level (7 = 7–9); null for words outside the HSK lists. */
  level: number | null;
};

export type Lexicon = { entries: Map<string, LexEntry>; maxLength: number };

/** Words longer than this are never matched; keeps segmentation fast. */
const MAX_WORD = 8;
/** Difficulty given to words outside the HSK lists (names, rare words). */
export const NON_HSK_LEVEL = 8;

export function isHan(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x20000 && code <= 0x2ffff)
  );
}

export function buildLexicon(
  hsk: Iterable<{ simplified: string; traditional: string; pinyin: string; level: number | null }>,
  cedict: Iterable<{ simplified: string; traditional: string; pinyin_numeric: string }>,
): Lexicon {
  const entries = new Map<string, LexEntry>();
  for (const w of hsk) entries.set(w.simplified, { traditional: w.traditional, pinyin: w.pinyin, level: w.level });
  // CC-CEDICT fills the gaps. Its first lowercase reading wins over surnames/place names.
  const proper = new Set<string>();
  for (const e of cedict) {
    const existing = entries.get(e.simplified);
    const isProper = /^[A-Z]/.test(e.pinyin_numeric);
    if (existing && !(proper.has(e.simplified) && !isProper)) continue;
    entries.set(e.simplified, { traditional: e.traditional, pinyin: numberedToMarked(e.pinyin_numeric), level: null });
    if (isProper) proper.add(e.simplified);
    else proper.delete(e.simplified);
  }
  let maxLength = 1;
  for (const key of entries.keys()) if ([...key].length > maxLength) maxLength = Math.min([...key].length, MAX_WORD);
  return { entries, maxLength };
}

/**
 * Traditional → simplified character map, from dictionary entries (most frequent mapping wins).
 * Characters that are themselves in everyday simplified use (么 in 什么, 份, 座, 宁…) are never
 * mapped: they appear in traditional forms of rare words (麼 → 么 → 幺), and converting them
 * would corrupt simplified text.
 */
export function buildTradToSimp(pairs: Iterable<{ traditional: string; simplified: string }>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  // How often each character is used in simplified forms.
  const kept = new Map<string, number>();
  for (const { traditional, simplified } of pairs) {
    const t = [...traditional];
    const s = [...simplified];
    for (const sc of s) kept.set(sc, (kept.get(sc) ?? 0) + 1);
    if (t.length !== s.length) continue;
    t.forEach((tc, i) => {
      if (tc === s[i]) return;
      const m = counts.get(tc) ?? new Map<string, number>();
      m.set(s[i], (m.get(s[i]) ?? 0) + 1);
      counts.set(tc, m);
    });
  }
  const map = new Map<string, string>();
  for (const [tc, m] of counts) {
    const [best, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if ((kept.get(tc) ?? 0) >= n) continue;
    map.set(tc, best);
  }
  return map;
}

export function toSimplified(text: string, t2s: Map<string, string>): string {
  return [...text].map((c) => t2s.get(c) ?? c).join('');
}

/** Forward maximum matching: longest dictionary word at each position; other characters stand alone. */
export function segment(simplified: string, lex: Lexicon): string[] {
  const chars = [...simplified];
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isHan(chars[i])) {
      // Keep runs of digits together ("2020"); everything else is one token per character.
      let j = i + 1;
      if (/\d/.test(chars[i])) while (j < chars.length && /\d/.test(chars[j])) j++;
      out.push(chars.slice(i, j).join(''));
      i = j;
      continue;
    }
    let len = Math.min(lex.maxLength, chars.length - i);
    for (; len > 1; len--) {
      if (lex.entries.has(chars.slice(i, i + len).join(''))) break;
    }
    out.push(chars.slice(i, i + len).join(''));
    i += len;
  }
  return out;
}

/** Joins a word's syllables the way textbooks write them: "xī ān" → "xī'ān", "ài hào" → "àihào". */
export function joinSyllables(pinyin: string): string {
  return pinyin
    .split(/\s+/)
    .filter(Boolean)
    .map((syl, i) => (i > 0 && /^[aeoāáǎàēéěèōóǒò]/i.test(syl) ? `'${syl}` : syl))
    .join('');
}

const PRONOUNS = new Set(['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '它们', '您', '咱们']);

/** Context fixes for the most common multi-reading particles. */
function contextReading(word: string, prev: string | undefined, next: string | undefined, fallback: string): string {
  const prevIsHan = !!prev && isHan([...prev][0]);
  switch (word) {
    case '地':
      // Adverbial "-ly" after a multi-character word or a reduplication (慢慢地), otherwise "ground".
      return prevIsHan && [...prev!].length >= 2 ? 'de' : 'dì';
    case '得':
      // Complement marker after a verb/adjective (跑得快); "to get" at the start.
      return prevIsHan && !PRONOUNS.has(prev!) && !!next ? 'de' : fallback;
    case '过':
      // Experience marker after a verb (去过), "to cross" after a pronoun or at the start.
      return prevIsHan && !PRONOUNS.has(prev!) ? 'guo' : 'guò';
    case '教':
      // On its own it's almost always the verb "to teach" (教室 / 教育 are separate words).
      return 'jiāo';
    case '到了':
      // "arrived" + 了, not dàoliǎo ("in the end")
      return 'dào le';
    case '穿着':
      // "wearing", not chuānzhuó ("clothing")
      return 'chuān zhe';
    default:
      return fallback;
  }
}

/**
 * Splits a sentence (simplified or traditional) into tokens with pinyin.
 * Returns null when a Chinese character has no known reading or the sentence contains Latin letters.
 */
export function tokenize(original: string, lex: Lexicon, t2s: Map<string, string>): Token[] | null {
  if (/[A-Za-z]/.test(original)) return null;
  const simplified = toSimplified(original, t2s);
  const isTraditional = simplified !== original;
  const origChars = [...original];
  const words = segment(simplified, lex);
  const tokens: Token[] = [];
  let pos = 0;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const len = [...w].length;
    const origSlice = origChars.slice(pos, pos + len).join('');
    pos += len;
    if (!isHan([...w][0])) {
      tokens.push({ s: w, t: w });
      continue;
    }
    const entry = lex.entries.get(w);
    if (!entry) return null;
    const reading = contextReading(w, words[k - 1], words[k + 1], entry.pinyin);
    tokens.push({ s: w, t: isTraditional ? origSlice : entry.traditional, p: joinSyllables(reading) });
  }
  return tokens;
}

/** Hardest word in the sentence: its HSK level, or NON_HSK_LEVEL for words outside the lists. */
export function difficulty(tokens: Token[], lex: Lexicon): number {
  let max = 1;
  for (const t of tokens) {
    if (!t.p) continue;
    const level = lex.entries.get(t.s)?.level ?? NON_HSK_LEVEL;
    if (level > max) max = level;
  }
  return max;
}

export function hanCount(text: string): number {
  return [...text].filter(isHan).length;
}

export type Candidate = { id: number; simplified: string; english: string; difficulty: number; length: number };

/**
 * Ranks example sentences for a word at `level`: sentences using only words at or below the
 * word's level first, then lengths close to a level-appropriate target. Distinct translations only.
 */
export function pickExamples(candidates: Candidate[], level: number, count = 3): Candidate[] {
  const target = Math.min(6 + level * 2, 20);
  const score = (c: Candidate) => Math.max(0, c.difficulty - level) * 10 + Math.abs(c.length - target) * 0.5;
  const sorted = [...candidates].sort((a, b) => score(a) - score(b) || a.id - b.id);
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of sorted) {
    const key = c.english.toLowerCase();
    if (seen.has(key) || seen.has(c.simplified)) continue;
    seen.add(key);
    seen.add(c.simplified);
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}
