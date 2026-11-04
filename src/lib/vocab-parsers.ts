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

/**
 * Readings the heuristics below get wrong (mostly grammar particles, whose single meaning is
 * outnumbered by rarer readings). The learner-facing reading for these words.
 */
const PREFERRED_READING: Record<string, string> = {
  了: 'le',
  吗: 'ma',
  没: 'méi',
  长: 'cháng',
  地: 'de',
  得: 'de',
  着: 'zhe',
  行: 'xíng',
  觉: 'jué',
  掺: 'chān',
  强: 'qiáng',
  汤: 'tāng',
  令: 'lìng',
  占: 'zhàn',
  散: 'sàn',
  露: 'lù',
  佛: 'fó',
  转: 'zhuǎn',
  转动: 'zhuǎn dòng',
  扎: 'zhā',
  挑: 'tiāo',
  卷: 'juǎn',
  涨: 'zhǎng',
  盛: 'shèng',
  老公: 'lǎo gōng',
  量: 'liáng',
  中: 'zhōng',
  雨: 'yǔ',
  卡: 'kǎ',
  空: 'kōng',
  价: 'jià',
  淋: 'lín',
  起来: 'qǐ lai',
  省事: 'shěng shì',
  削: 'xiāo',
  咋: 'zǎ',
  背着: 'bēi zhe',
  啊: 'a',
  哄: 'hǒng',
  切: 'qiē',
  缝: 'féng',
  钉: 'dīng',
};

/** Meanings that mark a rare, archaic or name-only reading. */
const MINOR_MEANING = /^(surname|old variant|variant of|unofficial variant|euphemistic|archaic|used in|see |\((bound form|chess|dialect|literary|old|Tw)\))/i;

/**
 * The reading to show first. The source sorts readings by tone, not by how common they are
 * (说 lists shuì "to persuade" before shuō "to speak"), so: skip surnames and variants, then take
 * the reading with the most meanings (counted across forms that share it); a hand-checked list
 * covers the exceptions.
 */
export function primaryForm(entry: HskSourceEntry): HskSourceForm {
  const forms = entry.forms;
  const preferred = PREFERRED_READING[entry.simplified];
  if (preferred) {
    const match =
      forms.find((f) => f.transcriptions.pinyin === preferred) ??
      forms.find((f) => f.transcriptions.pinyin.toLowerCase() === preferred);
    if (match) return match;
  }
  const allProper = forms.every((f) => /^[A-Z]/.test(f.transcriptions.pinyin));
  const senses = new Map<string, number>();
  for (const f of forms) {
    const key = f.transcriptions.pinyin;
    const real = (f.meanings ?? []).filter((m) => !MINOR_MEANING.test(m)).length;
    senses.set(key, (senses.get(key) ?? 0) + real);
  }
  // Lower is better: penalties first, then more senses; ties keep the source order.
  const score = (f: HskSourceForm) => {
    const meanings = f.meanings ?? [];
    let penalty = 0;
    if (!allProper && /^[A-Z]/.test(f.transcriptions.pinyin)) penalty += 10;
    if (meanings.length === 0) penalty += 8;
    else if (meanings.every((m) => MINOR_MEANING.test(m))) penalty += 5;
    return penalty * 100 - Math.min(senses.get(f.transcriptions.pinyin) ?? 0, 50);
  };
  let best = forms[0];
  for (const f of forms) if (score(f) < score(best)) best = f;
  return best;
}

export function parseHskEntry(entry: HskSourceEntry): WordRow {
  if (!entry.simplified || !entry.forms?.length) {
    throw new Error(`Invalid HSK entry: ${JSON.stringify(entry).slice(0, 120)}`);
  }
  const first = primaryForm(entry);
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
