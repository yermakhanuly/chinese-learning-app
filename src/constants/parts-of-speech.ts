/**
 * Part-of-speech tags in the HSK data (ICTCLAS style) → labels for learners.
 * Tags that say little to a learner (morphemes, name types) are left out.
 */
const LABELS: Record<string, string[]> = {
  n: ['noun'],
  v: ['verb'],
  vn: ['verb', 'noun'],
  a: ['adjective'],
  an: ['adjective', 'noun'],
  ad: ['adjective', 'adverb'],
  b: ['adjective'],
  z: ['adjective'],
  d: ['adverb'],
  q: ['measure word'],
  qv: ['measure word'],
  qt: ['measure word'],
  mq: ['number + measure word'],
  m: ['number'],
  t: ['time word'],
  f: ['position word'],
  s: ['place word'],
  r: ['pronoun'],
  p: ['preposition'],
  c: ['conjunction'],
  cc: ['conjunction'],
  u: ['particle'],
  y: ['particle'],
  e: ['interjection'],
  o: ['onomatopoeia'],
  l: ['set phrase'],
  i: ['idiom'],
  k: ['suffix'],
  h: ['prefix'],
};

export function partsOfSpeech(tags: string[]): string[] {
  return [...new Set(tags.flatMap((t) => LABELS[t] ?? []))];
}
