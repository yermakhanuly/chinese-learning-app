/**
 * Character data helpers, shared by the import script (Node) and the app. Relative `.ts` imports only.
 */
import { isHan } from './sentences.ts';

/** Ideographic description characters (⿰ ⿱ …) that structure a decomposition. */
const IDS = /[⿰-⿿]/u;

/**
 * The parts of a character from its decomposition, in order, without structure symbols or
 * unknown parts ("？"). ⿰女子 → [女, 子].
 */
export function partsOf(decomposition: string | null | undefined, character?: string): string[] {
  if (!decomposition) return [];
  const parts = [...decomposition].filter((c) => !IDS.test(c) && c !== '？' && c !== character);
  return [...new Set(parts)];
}

export type Etymology = {
  type: 'ideographic' | 'pictographic' | 'pictophonetic';
  hint?: string | null;
  phonetic?: string | null;
  semantic?: string | null;
};

/** A one-sentence explanation of where the character comes from. */
export function etymologyText(e: Etymology | null | undefined): string | null {
  if (!e) return null;
  switch (e.type) {
    case 'pictographic':
      return e.hint ? `A picture: ${e.hint}.` : 'A picture of what it means.';
    case 'ideographic':
      return e.hint ? `An idea: ${e.hint}.` : null;
    case 'pictophonetic': {
      const meaning = e.semantic ? `${e.semantic}${e.hint ? ` (${e.hint})` : ''} gives the meaning` : null;
      const sound = e.phonetic ? `${e.phonetic} gives the sound` : null;
      const text = [meaning, sound].filter(Boolean).join(', ');
      return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : null;
    }
    default:
      return null;
  }
}

export type CharacterUse = { level: number | null; traditionalOnly: boolean };

/**
 * Every Han character used by the HSK words, with the lowest HSK level of a word using it.
 * Characters that only appear in traditional forms are marked (traditional-script learners write them).
 */
export function charactersOfWords(
  words: { simplified: string; traditional: string; hsk_level: number | null; forms?: { traditional: string }[] }[],
): Map<string, CharacterUse> {
  const out = new Map<string, CharacterUse>();
  const lower = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
  for (const w of words) {
    for (const c of w.simplified) {
      if (!isHan(c)) continue;
      const prev = out.get(c);
      out.set(c, { level: lower(prev?.level ?? null, w.hsk_level), traditionalOnly: false });
    }
  }
  for (const w of words) {
    const trad = [w.traditional, ...(w.forms ?? []).map((f) => f.traditional)].join('');
    for (const c of trad) {
      if (!isHan(c)) continue;
      const prev = out.get(c);
      if (prev && !prev.traditionalOnly) continue;
      out.set(c, { level: lower(prev?.level ?? null, w.hsk_level), traditionalOnly: true });
    }
  }
  return out;
}

/** Distinct Han characters of a word, in order. */
export function hanCharacters(text: string): string[] {
  return [...new Set([...text].filter(isHan))];
}
