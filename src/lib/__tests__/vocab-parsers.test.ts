import { parseCedictLine, parseHskEntry, primaryForm, type HskSourceEntry } from '../vocab-parsers';

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

describe('primaryForm', () => {
  const form = (pinyin: string, meanings: string[]) => ({
    traditional: '',
    transcriptions: { pinyin, numeric: '' },
    meanings,
    classifiers: [],
  });
  const entry = (simplified: string, forms: ReturnType<typeof form>[]): HskSourceEntry => ({
    simplified,
    level: ['newest-1'],
    forms,
  });

  it('skips surname readings', () => {
    const e = entry('都', [form('Dū', ['surname Du']), form('dōu', ['all']), form('dū', ['capital city'])]);
    expect(primaryForm(e).transcriptions.pinyin).toBe('dōu');
  });

  it('skips variant and bound-form readings', () => {
    expect(primaryForm(entry('个', [form('gě', ['used in 自个儿']), form('gè', ['classifier'])])).transcriptions.pinyin).toBe('gè');
    expect(primaryForm(entry('要', [form('yāo', ['(bound form) to demand']), form('yào', ['to want'])])).transcriptions.pinyin).toBe('yào');
  });

  it('keeps proper nouns when every reading is capitalized', () => {
    expect(primaryForm(entry('中国', [form('Zhōng guó', ['China'])])).transcriptions.pinyin).toBe('Zhōng guó');
  });

  it('prefers the reading with the most meanings', () => {
    const e = entry('说', [form('shuì', ['to persuade']), form('shuō', ['to speak', 'to explain']), form('shuō', ['variant of 说'])]);
    expect(primaryForm(e).transcriptions.pinyin).toBe('shuō');
  });

  it('uses the hand-checked reading for particles', () => {
    const e = entry('了', [form('le', ['particle']), form('liǎo', ['to finish', 'to understand'])]);
    expect(primaryForm(e).transcriptions.pinyin).toBe('le');
  });

  it('applies hand-checked overrides', () => {
    const e = entry('行', [form('háng', ['row']), form('xíng', ['to walk'])]);
    expect(primaryForm(e).transcriptions.pinyin).toBe('xíng');
    expect(parseHskEntry(e).meanings).toEqual(['to walk']);
  });
});
