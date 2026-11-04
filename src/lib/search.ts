import { toneSignature, toPlainPinyin } from '@/lib/pinyin';

/** Letters, tone-marked vowels, ü/v, tone numbers, spaces and apostrophes: could be pinyin. */
const PINYIN_LIKE = /^[a-zA-ZüÜvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ1-5\s':]+$/;

export type SearchParams = { q: string; plain: string; tones: string };

/**
 * Prepares what the learner typed for `search_dictionary`: the raw text (for characters and
 * English) plus normalized pinyin when the text could be pinyin ("Nǐ hǎo", "ni3hao3", "nihao").
 */
export function searchParams(input: string): SearchParams | null {
  const q = input.trim().replace(/\s+/g, ' ').slice(0, 50);
  if (!q) return null;
  if (!PINYIN_LIKE.test(q)) return { q, plain: '', tones: '' };
  return { q, plain: toPlainPinyin(q.replace(/[1-5]/g, '')), tones: toneSignature(q) };
}

const HAN = /[㐀-鿿]/;

export function containsHan(text: string): boolean {
  return HAN.test(text);
}
