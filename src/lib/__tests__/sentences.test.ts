import {
  buildLexicon,
  buildTradToSimp,
  difficulty,
  joinSyllables,
  pickExamples,
  segment,
  tokenize,
  type Candidate,
} from '../sentences';

const hsk = [
  { simplified: '我', traditional: '我', pinyin: 'wǒ', level: 1 },
  { simplified: '喜欢', traditional: '喜歡', pinyin: 'xǐ huan', level: 1 },
  { simplified: '学习', traditional: '學習', pinyin: 'xué xí', level: 1 },
  { simplified: '学', traditional: '學', pinyin: 'xué', level: 1 },
  { simplified: '中文', traditional: '中文', pinyin: 'Zhōng wén', level: 1 },
  { simplified: '去', traditional: '去', pinyin: 'qù', level: 1 },
  { simplified: '过', traditional: '過', pinyin: 'guò', level: 2 },
  { simplified: '北京', traditional: '北京', pinyin: 'Běi jīng', level: 1 },
  { simplified: '跑', traditional: '跑', pinyin: 'pǎo', level: 2 },
  { simplified: '得', traditional: '得', pinyin: 'dé', level: 2 },
  { simplified: '快', traditional: '快', pinyin: 'kuài', level: 1 },
];
const cedict = [
  { simplified: '汤', traditional: '湯', pinyin_numeric: 'Tang1' },
  { simplified: '汤', traditional: '湯', pinyin_numeric: 'tang1' },
  { simplified: '西安', traditional: '西安', pinyin_numeric: 'Xi1 an1' },
  { simplified: '。', traditional: '。', pinyin_numeric: '' },
];
const lex = buildLexicon(hsk, cedict);
const t2s = buildTradToSimp([...hsk, ...cedict]);

describe('segment', () => {
  it('prefers the longest dictionary word', () => {
    expect(segment('我喜欢学习中文。', lex)).toEqual(['我', '喜欢', '学习', '中文', '。']);
  });
  it('keeps digit runs together', () => {
    expect(segment('我2020去', lex)).toEqual(['我', '2020', '去']);
  });
});

describe('tokenize', () => {
  it('adds per-word pinyin and traditional forms', () => {
    expect(tokenize('我喜欢中文。', lex, t2s)).toEqual([
      { s: '我', t: '我', p: 'wǒ' },
      { s: '喜欢', t: '喜歡', p: 'xǐhuan' },
      { s: '中文', t: '中文', p: 'Zhōngwén' },
      { s: '。', t: '。' },
    ]);
  });
  it('reads traditional sentences and keeps their original characters', () => {
    const tokens = tokenize('我喜歡學習中文', lex, t2s)!;
    expect(tokens.map((t) => t.s)).toEqual(['我', '喜欢', '学习', '中文']);
    expect(tokens.map((t) => t.t)).toEqual(['我', '喜歡', '學習', '中文']);
  });
  it('uses context for common particles', () => {
    expect(tokenize('我去过北京', lex, t2s)!.find((t) => t.s === '过')!.p).toBe('guo');
    expect(tokenize('我跑得快', lex, t2s)!.find((t) => t.s === '得')!.p).toBe('de');
  });
  it('prefers lowercase dictionary readings over names', () => {
    expect(lex.entries.get('汤')!.pinyin).toBe('tāng');
  });
  it('rejects sentences with unknown characters or Latin letters', () => {
    expect(tokenize('我喜欢鬱', lex, t2s)).toBeNull();
    expect(tokenize('我喜欢Tom', lex, t2s)).toBeNull();
  });
});

describe('difficulty', () => {
  it('is the highest HSK level, with non-HSK words counted as 8', () => {
    expect(difficulty(tokenize('我去过北京。', lex, t2s)!, lex)).toBe(2);
    expect(difficulty(tokenize('我喜欢汤', lex, t2s)!, lex)).toBe(8);
  });
});

describe('joinSyllables', () => {
  it('joins syllables and adds apostrophes before a, o, e', () => {
    expect(joinSyllables('ài hào')).toBe('àihào');
    expect(joinSyllables('Xī ān')).toBe("Xī'ān");
  });
});

describe('pickExamples', () => {
  const c = (id: number, english: string, diff: number, length: number): Candidate => ({
    id,
    simplified: `s${id}`,
    english,
    difficulty: diff,
    length,
  });
  it('prefers sentences at the word level, then a sensible length, without duplicate translations', () => {
    const picked = pickExamples([c(1, 'Hard one', 6, 8), c(2, 'Easy', 1, 8), c(3, 'easy', 1, 8), c(4, 'Long', 1, 30), c(5, 'Ok', 2, 9)], 1);
    expect(picked.map((p) => p.id)).toEqual([2, 5, 4]);
  });
});
