import { GRAMMAR_TOPICS } from '@/constants/grammar-topics';

type Searchable = {
  hsk_level: number;
  title: string;
  topic: string;
  summary: string;
  structure: string[];
  examples: { zh: string; en: string }[];
};

const topicName = new Map<string, string>(GRAMMAR_TOPICS.map((t) => [t.slug, t.name]));

/**
 * Grammar points matching a search, level and topic. Every word of the query must appear in the
 * title, summary, patterns, topic or examples; matches in the title come first.
 */
export function filterGrammar<T extends Searchable>(
  points: T[],
  { query, level, topic }: { query: string; level: number | null; topic: string | null },
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = points.filter((p) => (level === null || p.hsk_level === level) && (topic === null || p.topic === topic));
  if (!terms.length) return filtered;
  const scored = filtered
    .map((p) => {
      const title = p.title.toLowerCase();
      const body = [p.summary, ...p.structure, topicName.get(p.topic) ?? '', ...p.examples.flatMap((e) => [e.zh, e.en])]
        .join(' ')
        .toLowerCase();
      if (!terms.every((t) => title.includes(t) || body.includes(t))) return null;
      return { p, score: terms.filter((t) => title.includes(t)).length };
    })
    .filter((x) => x !== null);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.p);
}
