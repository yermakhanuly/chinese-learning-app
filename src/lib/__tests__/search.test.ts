import { containsHan, searchParams } from '../search';

describe('searchParams', () => {
  it('ignores empty input', () => {
    expect(searchParams('   ')).toBeNull();
  });
  it('normalizes pinyin with marks, numbers or none', () => {
    expect(searchParams('Nǐ hǎo')).toEqual({ q: 'Nǐ hǎo', plain: 'nihao', tones: '33' });
    expect(searchParams('ni3hao3')).toEqual({ q: 'ni3hao3', plain: 'nihao', tones: '33' });
    expect(searchParams(' nü  er ')).toEqual({ q: 'nü er', plain: 'nver', tones: '' });
  });
  it('leaves characters and non-pinyin text alone', () => {
    expect(searchParams('爱好')).toEqual({ q: '爱好', plain: '', tones: '' });
    expect(searchParams('to be')).toEqual({ q: 'to be', plain: 'tobe', tones: '' });
    expect(searchParams('c++')).toEqual({ q: 'c++', plain: '', tones: '' });
  });
  it('detects Chinese characters', () => {
    expect(containsHan('abc')).toBe(false);
    expect(containsHan('a爱')).toBe(true);
  });
});
