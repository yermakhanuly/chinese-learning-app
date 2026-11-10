/**
 * AI tutor (Phase 9): shared types, the role-play scenario format + checker, and the
 * "what to study next" rules. Imported by Node scripts: relative `.ts` imports only.
 *
 * The AI itself runs in the `tutor` Edge Function (supabase/functions/tutor); the response shapes
 * below match the JSON schemas there (a unit test keeps them in step).
 */
import { BASE_WORDS } from './grammar.ts';
import { unknownWords } from './lessons.ts';
import type { Lexicon } from './sentences.ts';

// --- Scenarios ---------------------------------------------------------------------------------

export type Phrase = { zh: string; en: string };

export type Scenario = {
  id: string;
  level: number;
  title: string;
  emoji: string;
  setting: string;
  ai_role: string;
  learner_role: string;
  /** The voice the tutor's lines are read in. */
  voice: 'female' | 'male';
  goals: string[];
  opening: Phrase;
  phrases: Phrase[];
  /** Names used in the Chinese texts (allowed whatever their level). */
  names: string[];
  /** Up to 4 words above the level that the scenario needs (shown as useful words). */
  words: string[];
};

export function scenarioTexts(s: Scenario): string[] {
  return [s.opening.zh, ...s.phrases.map((p) => p.zh)];
}

const LATIN = /[A-Za-z]/;

export function checkScenario(s: Scenario, known: Set<string>, lex: Lexicon): string[] {
  const problems: string[] = [];
  if (!/^[a-z]+(-[a-z]+)*$/.test(s.id)) problems.push(`id ${s.id} should be lowercase words joined by -`);
  if (s.level !== 1 && s.level !== 2) problems.push('level must be 1 or 2');
  for (const key of ['title', 'emoji', 'setting', 'ai_role', 'learner_role'] as const) {
    if (!s[key]?.trim()) problems.push(`${key} is required`);
  }
  if (s.voice !== 'female' && s.voice !== 'male') problems.push('voice must be female or male');
  if (s.goals.length !== 3 || s.goals.some((g) => !g.trim())) problems.push('needs exactly 3 goals');
  if (s.phrases.length < 4 || s.phrases.length > 6) problems.push(`${s.phrases.length} phrases (need 4–6)`);
  if (s.words.length > 4) problems.push(`${s.words.length} extra words (at most 4)`);
  const allowed = new Set([...known, ...BASE_WORDS, ...s.names, ...s.names.flatMap((n) => [...n]), ...s.words]);
  for (const p of [s.opening, ...s.phrases]) {
    if (!p.zh.trim() || !p.en.trim()) problems.push('every phrase needs zh and en');
    if (LATIN.test(p.zh)) problems.push(`"${p.zh}" has Latin letters`);
    const unknown = unknownWords(p.zh.replace(/……/g, ''), allowed, lex);
    if (unknown.length) problems.push(`"${p.zh}" uses words above HSK ${s.level}: ${unknown.join(', ')}`);
  }
  return problems;
}

export function checkScenarios(list: Scenario[], knownFor: (level: number) => Set<string>, lex: Lexicon): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of list) {
    if (ids.has(s.id)) problems.push(`duplicate id ${s.id}`);
    ids.add(s.id);
    problems.push(...checkScenario(s, knownFor(s.level), lex).map((p) => `${s.id}: ${p}`));
  }
  return problems;
}

/** Longest message / sentence the tutor accepts (the Edge Function's LIMITS). */
export const LIMIT_MESSAGE = 300;
export const LIMIT_SENTENCE = 200;

const PUNCTUATION: Record<string, string> = { '。': '.', '，': ',', '！': '!', '？': '?', '、': ',', '：': ':', '；': ';', '…': '…' };

/** Plain pinyin with punctuation from imported readings (the same as the Edge Function's pinyinOf). */
export function readingPinyin(tokens: { s: string; p?: string }[] | undefined): string {
  let out = '';
  for (const t of tokens ?? []) {
    if (t.p) out += (out && !out.endsWith(' ') ? ' ' : '') + t.p;
    else if (PUNCTUATION[t.s]) out += PUNCTUATION[t.s] + (t.s === '…' ? '' : ' ');
  }
  return out.trim();
}

// --- What the tutor sends back (the Edge Function's JSON schemas) -------------------------------

export type TutorMode = 'tutor' | 'roleplay' | 'free';

/** A correction of one learner message. `ok` true = nothing to fix. */
export type Correction = {
  ok: boolean;
  /** The learner's sentence, fixed (same as theirs when ok). */
  corrected: string;
  corrected_pinyin: string;
  /** One or two English sentences on what was wrong and why. */
  explanation: string;
  /** Short label: word order, measure word, wrong word, particle, tone/character, … */
  kind: string;
};

/** A role-play / conversation reply from the tutor. */
export type ConversationReply = {
  reply: { zh: string; pinyin: string; en: string };
  correction: Correction;
  /** Goal indexes (0-based) the learner has now completed in a role-play. */
  goals_done: number[];
};

export type ConversationFeedback = {
  summary: string;
  strengths: string[];
  focus: string[];
  /** 0–100: how well the learner communicated at their level. */
  score: number;
};

export type SentenceCheck = {
  ok: boolean;
  corrected: string;
  corrected_pinyin: string;
  translation: string;
  explanation: string;
  /** Each fix: what was wrong → what it should be, and why. */
  fixes: { wrong: string; right: string; why: string }[];
  /** A more natural way to say it, if any (else empty). */
  natural: string;
};

export type SentenceBreakdown = {
  translation: string;
  literal: string;
  words: { zh: string; pinyin: string; meaning: string; role: string }[];
  grammar: { pattern: string; explanation: string }[];
};

export type ExampleSentence = { zh: string; pinyin: string; en: string };

export type AiQuizQuestion = {
  prompt: string;
  /** Chinese text the question is about (may be empty). */
  zh: string;
  options: string[];
  answer: number;
  why: string;
  word: string;
};

export type TutorMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  data: {
    pinyin?: string;
    en?: string;
    correction?: Correction;
    voice?: boolean;
    goals_done?: number[];
  };
  created_at: string;
};

export type Conversation = {
  id: string;
  mode: TutorMode;
  scenario_id: string | null;
  topic: string | null;
  title: string;
  level: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  feedback: ConversationFeedback | null;
};

/** Role-play goals completed so far (the union of every reply's goals_done). */
export function goalsDone(messages: TutorMessage[], goals: number): Set<number> {
  const done = new Set<number>();
  for (const m of messages) for (const g of m.data.goals_done ?? []) if (g >= 0 && g < goals) done.add(g);
  return done;
}

/** The learner's messages that the tutor corrected. */
export function corrections(messages: TutorMessage[]): (TutorMessage & { data: { correction: Correction } })[] {
  return messages.filter(
    (m): m is TutorMessage & { data: { correction: Correction } } => m.role === 'user' && m.data.correction?.ok === false,
  );
}

/** Quiz score in the shape complete_quiz takes. */
export function quizScore(questions: AiQuizQuestion[], answers: (number | null)[]) {
  return { correct: questions.filter((q, i) => answers[i] === q.answer).length, total: questions.length };
}

// --- What to study next (rules, no AI) -----------------------------------------------------------

export type StudyState = {
  level: number;
  dueReviews: number;
  weakWords: number;
  grammarMistakes: number;
  nextLesson: { id: string; title: string } | null;
  /** At the learner's level. */
  grammarPractised: number;
  grammarTotal: number;
  readingsDone: number;
  readingsTotal: number;
  wordsLearned: number;
  wordsTotal: number;
  mockBest: number | null;
  conversationsThisWeek: number;
  premium: boolean;
};

export type Recommendation = {
  id: string;
  emoji: string;
  title: string;
  why: string;
  href: { pathname: string; params?: Record<string, string> };
  priority: number;
};

/** Up to `max` suggestions, the most useful first. */
export function recommendations(s: StudyState, max = 3): Recommendation[] {
  const out: Recommendation[] = [];
  const pct = (a: number, b: number) => (b ? a / b : 1);
  if (s.dueReviews > 0) {
    out.push({
      id: 'review',
      emoji: '🔁',
      title: `Review ${s.dueReviews} ${s.dueReviews === 1 ? 'card' : 'cards'}`,
      why: 'Reviewing on time is the fastest way to remember words for good.',
      href: { pathname: '/review-session', params: { deck: 'all' } },
      priority: s.dueReviews >= 20 ? 100 : 80,
    });
  }
  if (s.weakWords >= 3) {
    out.push({
      id: 'weak',
      emoji: '🎯',
      title: `Practise your ${s.weakWords} weak words`,
      why: "You've missed these several times this month.",
      href: { pathname: '/mistakes' },
      priority: 72,
    });
  }
  if (s.nextLesson) {
    out.push({
      id: 'lesson',
      emoji: '📘',
      title: `Next lesson: ${s.nextLesson.title}`,
      why: 'Keep moving along your course.',
      href: { pathname: '/lesson', params: { id: s.nextLesson.id } },
      priority: 75,
    });
  }
  if (s.grammarMistakes >= 2) {
    out.push({
      id: 'grammar-mistakes',
      emoji: '🧩',
      title: 'Go over your grammar mistakes',
      why: `${s.grammarMistakes} grammar exercises went wrong recently.`,
      href: { pathname: '/mistakes' },
      priority: 62,
    });
  }
  if (pct(s.grammarPractised, s.grammarTotal) < 0.5) {
    out.push({
      id: 'grammar',
      emoji: '🧩',
      title: `Learn a new HSK ${s.level} grammar point`,
      why: `You've practised ${s.grammarPractised} of ${s.grammarTotal}.`,
      href: { pathname: '/grammar' },
      priority: 50,
    });
  }
  if (s.wordsLearned >= 50 && pct(s.readingsDone, s.readingsTotal) < 0.5) {
    out.push({
      id: 'reading',
      emoji: '📖',
      title: 'Read a short story',
      why: 'You know enough words to read at your level.',
      href: { pathname: '/reading' },
      priority: 45,
    });
  }
  if (s.mockBest === null && pct(s.wordsLearned, s.wordsTotal) >= 0.8) {
    out.push({
      id: 'mock',
      emoji: '📝',
      title: `Try the mock HSK ${s.level} test`,
      why: `You know ${Math.round(pct(s.wordsLearned, s.wordsTotal) * 100)}% of the HSK ${s.level} words.`,
      href: { pathname: '/mock-test', params: { level: String(s.level) } },
      priority: 58,
    });
  }
  if (s.conversationsThisWeek === 0) {
    out.push({
      id: 'conversation',
      emoji: '💬',
      title: s.premium ? 'Have a conversation with your tutor' : 'Practise conversation with the AI tutor',
      why: s.premium ? "You haven't spoken with the tutor this week." : 'Role-plays with corrections (Premium).',
      href: { pathname: s.premium ? '/tutor' : '/premium' },
      priority: s.premium ? 55 : 20,
    });
  }
  return out.sort((a, b) => b.priority - a.priority).slice(0, max);
}
