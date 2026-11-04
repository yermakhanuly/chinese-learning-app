import {
  numberedSyllableToMarked,
  numberedToMarked,
  toneOfMarkedSyllable,
  toneSignature,
  toPlainPinyin,
  tonesOf,
} from '../pinyin';

describe('numberedSyllableToMarked', () => {
  it.each([
    ['ni3', 'nǐ'],
    ['hao3', 'hǎo'],
    ['xie4', 'xiè'],
    ['dou1', 'dōu'],
    ['gui4', 'guì'],
    ['liu2', 'liú'],
    ['lu:4', 'lǜ'],
    ['nv3', 'nǚ'],
    ['ma5', 'ma'],
    ['Zhong1', 'Zhōng'],
    ['A1', 'Ā'],
    ['r5', 'r'],
    ['11', '11'],
  ])('%s → %s', (input, expected) => {
    expect(numberedSyllableToMarked(input)).toBe(expected);
  });
});

describe('numberedToMarked', () => {
  it('converts whole phrases', () => {
    expect(numberedToMarked('ni3 hao3')).toBe('nǐ hǎo');
    expect(numberedToMarked('  Zhong1 guo2 ')).toBe('Zhōng guó');
  });
});

describe('toPlainPinyin', () => {
  it.each([
    ['nǐ hǎo', 'nihao'],
    ['ni3 hao3', 'nihao'],
    ['Nǚ ér', 'nver'],
    ['nu:3 er2', 'nver'],
    ['lǜ', 'lv'],
    ["Xī'ān", 'xian'],
  ])('%s → %s', (input, expected) => {
    expect(toPlainPinyin(input)).toBe(expected);
  });
});

describe('tonesOf', () => {
  it('reads tone numbers, with 5 for neutral', () => {
    expect(tonesOf('ni3 hao3 ma5')).toEqual([3, 3, 5]);
  });
});

describe('toneOfMarkedSyllable / toneSignature', () => {
  it('reads tones from marks', () => {
    expect(toneOfMarkedSyllable('hǎo')).toBe(3);
    expect(toneOfMarkedSyllable('lǜ')).toBe(4);
    expect(toneOfMarkedSyllable('Zhōng')).toBe(1);
    expect(toneOfMarkedSyllable('ma')).toBe(5);
  });
  it('builds a signature from marks or numbers, skipping neutral tones', () => {
    expect(toneSignature('nǐ hǎo')).toBe('33');
    expect(toneSignature('ni3hao3')).toBe('33');
    expect(toneSignature('ma5 ma1')).toBe('1');
    expect(toneSignature('ni hao')).toBe('');
  });
});
