import { parseCedictLine, parseHskEntry } from '../vocab-parsers';

describe('parseHskEntry', () => {
  const entry = {
    simplified: '爱好',
    radical: '爫',
    level: ['newest-2', 'new-1', 'old-3'],
    frequency: 4902,
    pos: ['n', 'v'],
    forms: [
      {
        traditional: '愛好',
        transcriptions: { pinyin: 'ài hào', numeric: 'ai4 hao4' },
        meanings: ['to like', 'hobby'],
        classifiers: ['个'],
      },
    ],
  };

  it('maps levels from all three syllabuses', () => {
    const row = parseHskEntry(entry);
    expect(row.hsk_level).toBe(2);
    expect(row.hsk_2021_level).toBe(1);
    expect(row.hsk2_level).toBe(3);
  });

  it('copies the first form to top-level fields', () => {
    const row = parseHskEntry(entry);
    expect(row).toMatchObject({
      simplified: '爱好',
      traditional: '愛好',
      pinyin: 'ài hào',
      pinyin_plain: 'aihao',
      meanings: ['to like', 'hobby'],
      classifiers: ['个'],
      frequency: 4902,
      radical: '爫',
    });
    expect(row.forms).toHaveLength(1);
  });

  it('uses null for syllabuses that do not include the word', () => {
    const row = parseHskEntry({ ...entry, level: ['old-6'] });
    expect(row.hsk_level).toBeNull();
    expect(row.hsk_2021_level).toBeNull();
    expect(row.hsk2_level).toBe(6);
  });

  it('rejects entries without forms', () => {
    expect(() => parseHskEntry({ ...entry, forms: [] })).toThrow();
  });
});

describe('parseCedictLine', () => {
  it('parses a normal entry', () => {
    expect(parseCedictLine('中國 中国 [Zhong1 guo2] /China/Middle Kingdom/')).toEqual({
      traditional: '中國',
      simplified: '中国',
      pinyin: 'Zhōng guó',
      pinyin_numeric: 'Zhong1 guo2',
      pinyin_plain: 'zhongguo',
      definitions: ['China', 'Middle Kingdom'],
    });
  });

  it('handles ü written as u:', () => {
    expect(parseCedictLine('女兒 女儿 [nu:3 er2] /daughter/')?.pinyin).toBe('nǚ ér');
  });

  it('skips comments, blanks and malformed lines', () => {
    expect(parseCedictLine('# CC-CEDICT')).toBeNull();
    expect(parseCedictLine('')).toBeNull();
    expect(parseCedictLine('garbage')).toBeNull();
  });
});
