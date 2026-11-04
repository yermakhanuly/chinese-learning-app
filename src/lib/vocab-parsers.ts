/**
 * Parsers for the raw vocabulary sources:
 * - complete-hsk-vocabulary (MIT): https://github.com/drkameleon/complete-hsk-vocabulary
 * - CC-CEDICT (CC BY-SA 4.0): https://www.mdbg.net/chinese/dictionary?page=cc-cedict
 *
 * Only relative `.ts` imports here so Node can run the import script without a build step.
 */
import { numberedToMarked, toPlainPinyin } from './pinyin.ts';

export type HskSourceForm = {
  traditional: string;
  transcriptions: { pinyin: string; numeric: string };
  meanings: string[];
  classifiers: string[];
};

export type HskSourceEntry = {
  simplified: string;
  radical?: string;
  level: string[];
  frequency?: number;
  pos?: string[];
  forms: HskSourceForm[];
};

export type WordRow = {
  simplified: string;
  traditional: string;
  pinyin: string;
  pinyin_numeric: string;
  pinyin_plain: string;
  meanings: string[];
  /** 2026 HSK 3.0 syllabus level; 7 means levels 7–9. */
  hsk_level: number | null;
  /** 2021 HSK 3.0 standard level; 7 means levels 7–9. */
  hsk_2021_level: number | null;
  /** Old HSK 2.0 level (1–6). */
  hsk2_level: number | null;
  frequency: number | null;
  pos: string[];
  radical: string | null;
  classifiers: string[];
  forms: { traditional: string; pinyin: string; pinyin_numeric: string; meanings: string[]; classifiers: string[] }[];
};

export type DictionaryRow = {
  traditional: string;
  simplified: string;
  pinyin: string;
  pinyin_numeric: string;
  pinyin_plain: string;
  definitions: string[];
};

/** Lowest level for a tag family ("newest", "new" or "old"); null if the word isn't in that list. */
function levelFor(tags: string[], family: 'newest' | 'new' | 'old'): number | null {
  const levels = tags
    .map((t) => /^(newest|new|old)-(\d)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null && m[1] === family)
    .map((m) => Number(m[2]));
  return levels.length ? Math.min(...levels) : null;
}

export function parseHskEntry(entry: HskSourceEntry): WordRow {
  if (!entry.simplified || !entry.forms?.length) {
    throw new Error(`Invalid HSK entry: ${JSON.stringify(entry).slice(0, 120)}`);
  }
  const first = entry.forms[0];
  return {
    simplified: entry.simplified,
    traditional: first.traditional || entry.simplified,
    pinyin: first.transcriptions.pinyin,
    pinyin_numeric: first.transcriptions.numeric,
    pinyin_plain: toPlainPinyin(first.transcriptions.numeric),
    meanings: first.meanings ?? [],
    hsk_level: levelFor(entry.level, 'newest'),
    hsk_2021_level: levelFor(entry.level, 'new'),
    hsk2_level: levelFor(entry.level, 'old'),
    frequency: typeof entry.frequency === 'number' ? entry.frequency : null,
    pos: entry.pos ?? [],
    radical: entry.radical || null,
    classifiers: first.classifiers ?? [],
    forms: entry.forms.map((f) => ({
      traditional: f.traditional || entry.simplified,
      pinyin: f.transcriptions.pinyin,
      pinyin_numeric: f.transcriptions.numeric,
      meanings: f.meanings ?? [],
      classifiers: f.classifiers ?? [],
    })),
  };
}

const CEDICT_LINE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;

/** Parses one CC-CEDICT line; returns null for comments, blanks and malformed lines. */
export function parseCedictLine(line: string): DictionaryRow | null {
  if (!line || line.startsWith('#')) return null;
  const m = CEDICT_LINE.exec(line);
  if (!m) return null;
  const numeric = m[3].trim();
  return {
    traditional: m[1],
    simplified: m[2],
    pinyin: numberedToMarked(numeric),
    pinyin_numeric: numeric,
    pinyin_plain: toPlainPinyin(numeric),
    definitions: m[4].split('/').filter(Boolean),
  };
}
