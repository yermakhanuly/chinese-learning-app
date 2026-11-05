/** Builds character quiz questions (pure; `rand` is injectable for tests). */
export type QuizCharacter = { character: string; pinyin: string[]; definition: string | null; stroke_count: number };
export type ChoiceQuestion = { target: QuizCharacter; options: string[] };

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const usable = (c: QuizCharacter) => !!c.definition && c.pinyin.length > 0;

/**
 * "Which character is this?": `count` targets from the list, each with 3 distractors of a similar
 * stroke count (so the answer can't be guessed from how busy it looks).
 */
export function recognitionQuestions(list: QuizCharacter[], count = 10, rand: () => number = Math.random): ChoiceQuestion[] {
  const pool = list.filter(usable);
  return shuffle(pool, rand)
    .slice(0, count)
    .map((target) => {
      const others = shuffle(
        pool.filter((c) => c.character !== target.character),
        rand,
      ).sort((a, b) => Math.abs(a.stroke_count - target.stroke_count) - Math.abs(b.stroke_count - target.stroke_count));
      const distractors = shuffle(others.slice(0, 8), rand).slice(0, 3);
      return { target, options: shuffle([target, ...distractors], rand).map((c) => c.character) };
    });
}

/** Look-alike drill: the target's group members are the choices. */
export function lookAlikeQuestions(
  groups: string[][],
  info: Map<string, QuizCharacter>,
  count = 10,
  rand: () => number = Math.random,
): ChoiceQuestion[] {
  const valid = groups
    .map((g) => g.filter((c) => info.has(c)))
    .filter((g) => g.length >= 2);
  const questions: ChoiceQuestion[] = [];
  for (const group of shuffle(valid, rand)) {
    const candidates = group.map((c) => info.get(c)!).filter(usable);
    if (!candidates.length) continue;
    const target = candidates[Math.floor(rand() * candidates.length)];
    questions.push({ target, options: shuffle(group, rand) });
    if (questions.length >= count) break;
  }
  return questions;
}

/** Up to `count` characters to write: the learner's own if there are enough, else the level's. */
export function pickWritingCharacters(learned: string[], level: string[], count = 10, rand: () => number = Math.random) {
  const source = learned.length >= 4 ? learned : level;
  return shuffle(source, rand).slice(0, count);
}
