/**
 * Topics of the grammar library (filters on /grammar). Imported by Node scripts: no `@/` imports.
 */
export const GRAMMAR_TOPICS = [
  { slug: 'basics', name: 'Sentence basics', hanzi: '句子' },
  { slug: 'questions', name: 'Questions', hanzi: '问题' },
  { slug: 'negation', name: 'Negation 不 / 没', hanzi: '否定' },
  { slug: 'aspect', name: '了 / 过 / 着', hanzi: '动态' },
  { slug: 'measure-words', name: 'Numbers & measure words', hanzi: '量词' },
  { slug: 'time-place', name: 'Time & place', hanzi: '时间' },
  { slug: 'verbs', name: 'Modal & special verbs', hanzi: '动词' },
  { slug: 'adverbs', name: 'Adverbs', hanzi: '副词' },
  { slug: 'comparison', name: 'Comparisons', hanzi: '比较' },
  { slug: 'complements', name: 'Complements', hanzi: '补语' },
  { slug: 'particles', name: 'Particles 的 / 吧 / 呢', hanzi: '助词' },
  { slug: 'connectors', name: 'Linking ideas', hanzi: '连词' },
] as const;

export type GrammarTopic = (typeof GRAMMAR_TOPICS)[number]['slug'];

export const GRAMMAR_TOPIC_SLUGS: readonly string[] = GRAMMAR_TOPICS.map((t) => t.slug);
