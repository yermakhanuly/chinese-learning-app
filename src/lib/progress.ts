/**
 * Progress maths (pure, unit-tested): levels from XP, the streak with its weekly freeze, badges,
 * daily / weekly challenges and the HSK readiness estimate. XP itself is recorded by the database
 * (supabase/migrations/20261112000000_progress.sql); XP_RULES mirrors it for the help text.
 */

export const XP_RULES: { what: string; xp: string }[] = [
  { what: 'Lesson (first time)', xp: '10, +5 for 80 % or more' },
  { what: 'Lesson (again)', xp: '5' },
  { what: 'Review card', xp: '2 new, 1 again' },
  { what: 'Grammar practice', xp: '8, +2 for 80 % or more' },
  { what: 'Reading', xp: '10 + up to 4 for the questions' },
  { what: 'Listening, tone or character quiz', xp: '1 per right answer' },
  { what: 'Pronunciation check', xp: '2' },
  { what: 'Mock HSK test', xp: '30' },
  { what: 'Message to the AI tutor (Premium)', xp: '2 (up to 60 a day)' },
  { what: 'AI quiz (Premium)', xp: '1 per right answer' },
];

// ---------------------------------------------------------------------------
// Levels: level L starts at 25 × (L − 1)² XP (25, 100, 225, 400 …).

export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
  const start = 25 * (level - 1) ** 2;
  const next = 25 * level ** 2;
  return { level, xpInLevel: xp - start, xpForLevel: next - start, fraction: (xp - start) / (next - start) };
}

// ---------------------------------------------------------------------------
// Dates as 'YYYY-MM-DD' (the learner's local calendar day)

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week the date is in. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

// ---------------------------------------------------------------------------
// Streak

export type DayXp = { day: string; xp: number };

export type Streak = {
  /** Days in a row the goal was met, counting today once it's met. */
  current: number;
  best: number;
  todayXp: number;
  todayMet: boolean;
  /** Missed days saved by a freeze (one per week, only a single missed day). */
  frozen: string[];
  /** This week's freeze hasn't been used yet. */
  freezeLeft: boolean;
  /** Yesterday was missed but the freeze can still save it: study today to keep the streak. */
  atRisk: boolean;
};

/**
 * Walks the calendar from the first active day to today. A day counts when its XP reaches the goal.
 * A missed day keeps the streak alive when this week's freeze is unused and the next day is met
 * (or is today, which can still be met). Two missed days in a row always end the streak.
 */
export function computeStreak(days: DayXp[], today: string, goal: number): Streak {
  const xpOn = new Map(days.map((d) => [d.day, d.xp]));
  const met = (d: string) => (xpOn.get(d) ?? 0) >= goal;
  const todayXp = xpOn.get(today) ?? 0;
  const first = days.map((d) => d.day).filter((d) => d <= today).sort()[0];
  const usedWeeks = new Set<string>();
  const frozen: string[] = [];
  let run = 0;
  let best = 0;
  let atRisk = false;
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (met(d)) {
        run++;
        best = Math.max(best, run);
        continue;
      }
      if (d === today) break; // today can still be met
      const next = addDays(d, 1);
      const week = weekStart(d);
      if (run > 0 && !usedWeeks.has(week) && (met(next) || next === today)) {
        usedWeeks.add(week);
        frozen.push(d);
        if (next === today && !met(today)) atRisk = true;
      } else {
        run = 0;
      }
    }
  }
  return {
    current: run,
    best,
    todayXp,
    todayMet: met(today),
    frozen,
    freezeLeft: !usedWeeks.has(weekStart(today)),
    atRisk,
  };
}

/** The last `weeks` weeks as columns of 7 days (Monday first), for the activity calendar. */
export function calendarWeeks(today: string, weeks = 12): string[][] {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

/** 0 (nothing) … 4 (goal reached twice over) for an activity-calendar cell. */
export function intensity(xp: number, goal: number): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0) return 0;
  if (xp < goal / 2) return 1;
  if (xp < goal) return 2;
  if (xp < goal * 2) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// Stats (progress_stats()) and badges

export type Stats = {
  total_xp: number;
  total_seconds: number;
  lessons: number;
  perfect_lessons: number;
  reviews: number;
  review_accuracy: number | null;
  words_learned: number;
  words_mastered: number;
  words_by_level: Record<string, number>;
  characters_written: number;
  grammar_practised: number;
  grammar_by_level: Record<string, { points: number; avg: number }>;
  readings: number;
  reading_avg: number | null;
  pronunciation_checks: number;
  skills: Record<string, { activities: number; correct: number; total: number }>;
  mock_best: Record<string, number>;
};

export type Badge = { id: string; icon: string; title: string; description: string; earned: boolean; progress: [number, number] };

type BadgeRule = { id: string; icon: string; title: string; description: string; value: (s: Stats, k: Streak) => number; target: number };

const BADGES: BadgeRule[] = [
  { id: 'first-lesson', icon: '🌱', title: 'First step', description: 'Finish your first lesson', value: (s) => s.lessons, target: 1 },
  { id: 'lessons-10', icon: '📘', title: 'Steady learner', description: 'Finish 10 lessons', value: (s) => s.lessons, target: 10 },
  { id: 'hsk1-course', icon: '🎓', title: 'HSK 1 course', description: 'Finish all 51 HSK 1 lessons and quizzes', value: (s) => s.lessons, target: 51 },
  { id: 'perfect', icon: '💯', title: 'Perfect', description: 'Get 100 % in a lesson', value: (s) => s.perfect_lessons, target: 1 },
  { id: 'streak-3', icon: '🔥', title: 'On fire', description: 'Reach a 3-day streak', value: (_, k) => k.best, target: 3 },
  { id: 'streak-7', icon: '📅', title: 'One week', description: 'Reach a 7-day streak', value: (_, k) => k.best, target: 7 },
  { id: 'streak-30', icon: '🏅', title: 'One month', description: 'Reach a 30-day streak', value: (_, k) => k.best, target: 30 },
  { id: 'streak-100', icon: '🏆', title: '100 days', description: 'Reach a 100-day streak', value: (_, k) => k.best, target: 100 },
  { id: 'words-50', icon: '🔤', title: '50 words', description: 'Learn 50 words', value: (s) => s.words_learned, target: 50 },
  { id: 'words-100', icon: '📚', title: '100 words', description: 'Learn 100 words', value: (s) => s.words_learned, target: 100 },
  { id: 'words-500', icon: '🧠', title: '500 words', description: 'Learn 500 words', value: (s) => s.words_learned, target: 500 },
  { id: 'mastered-50', icon: '💎', title: 'Long memory', description: 'Master 50 words (3+ weeks in memory)', value: (s) => s.words_mastered, target: 50 },
  { id: 'reviews-500', icon: '🔁', title: 'Reviewer', description: 'Answer 500 review cards', value: (s) => s.reviews, target: 500 },
  { id: 'characters-20', icon: '✍️', title: 'Calligrapher', description: 'Practise writing 20 characters in review', value: (s) => s.characters_written, target: 20 },
  { id: 'grammar-10', icon: '🧩', title: 'Grammar fan', description: 'Practise 10 grammar points', value: (s) => s.grammar_practised, target: 10 },
  { id: 'grammar-hsk1', icon: '🏗️', title: 'HSK 1 grammar', description: 'Practise all 37 HSK 1 grammar points', value: (s) => s.grammar_by_level['1']?.points ?? 0, target: 37 },
  { id: 'readings-10', icon: '📖', title: 'Bookworm', description: 'Read 10 texts', value: (s) => s.readings, target: 10 },
  { id: 'speaker', icon: '🎤', title: 'Speaker', description: 'Check your pronunciation 20 times', value: (s) => s.pronunciation_checks, target: 20 },
  { id: 'mock-pass', icon: '🥇', title: 'Exam ready', description: 'Pass a mock HSK test (120 / 200)', value: (s) => Math.max(0, ...Object.values(s.mock_best)), target: 120 },
  { id: 'xp-1000', icon: '⭐', title: '1,000 XP', description: 'Earn 1,000 XP', value: (s) => s.total_xp, target: 1000 },
];

export function badges(stats: Stats, streak: Streak): Badge[] {
  return BADGES.map((b) => {
    const v = b.value(stats, streak);
    return { id: b.id, icon: b.icon, title: b.title, description: b.description, earned: v >= b.target, progress: [Math.min(v, b.target), b.target] };
  });
}

// ---------------------------------------------------------------------------
// Challenges

export type KindCounts = Record<string, { activities: number; xp: number }>;

export type Challenge = { id: string; title: string; progress: number; target: number; done: boolean };

type ChallengeRule = { id: string; title: string; target: number; value: (c: KindCounts, extra: { daysActive: number; goal: number }) => number };

const count = (c: KindCounts, ...kinds: string[]) => kinds.reduce((n, k) => n + (c[k]?.activities ?? 0), 0);
const xpOf = (c: KindCounts) => Object.values(c).reduce((n, k) => n + k.xp, 0);

const DAILY: ChallengeRule[] = [
  { id: 'd-review-20', title: 'Review 20 cards', target: 20, value: (c) => count(c, 'review') },
  { id: 'd-lesson', title: 'Finish a lesson', target: 1, value: (c) => count(c, 'lesson') },
  { id: 'd-grammar', title: 'Practise a grammar point', target: 1, value: (c) => count(c, 'grammar') },
  { id: 'd-reading', title: 'Read a text', target: 1, value: (c) => count(c, 'reading') },
  { id: 'd-listen', title: 'Do a listening or tone quiz', target: 1, value: (c) => count(c, 'listening', 'tones') },
  { id: 'd-speak', title: 'Check your pronunciation 3 times', target: 3, value: (c) => count(c, 'pronunciation') },
  { id: 'd-characters', title: 'Do a character quiz', target: 1, value: (c) => count(c, 'characters') },
];

const WEEKLY: ChallengeRule[] = [
  { id: 'w-days-5', title: 'Study on 5 days', target: 5, value: (_, e) => e.daysActive },
  { id: 'w-xp-200', title: 'Earn 200 XP', target: 200, value: (c) => xpOf(c) },
  { id: 'w-grammar-3', title: 'Practise 3 grammar points', target: 3, value: (c) => count(c, 'grammar') },
  { id: 'w-reading-2', title: 'Read 2 texts', target: 2, value: (c) => count(c, 'reading') },
  { id: 'w-review-100', title: 'Review 100 cards', target: 100, value: (c) => count(c, 'review') },
  { id: 'w-lessons-3', title: 'Finish 3 lessons', target: 3, value: (c) => count(c, 'lesson') },
];

function seedOf(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** `n` rules picked from the pool by date: the same day (or week) always gets the same ones. */
function pick(pool: ChallengeRule[], key: string, n: number): ChallengeRule[] {
  const start = seedOf(key) % pool.length;
  return Array.from({ length: n }, (_, i) => pool[(start + i * 2) % pool.length]).filter((r, i, all) => all.indexOf(r) === i);
}

const toChallenge = (r: ChallengeRule, c: KindCounts, e: { daysActive: number; goal: number }): Challenge => {
  const progress = Math.min(r.value(c, e), r.target);
  return { id: r.id, title: r.title, progress, target: r.target, done: progress >= r.target };
};

/** Today's three challenges: always the daily goal, plus two from the pool. */
export function dailyChallenges(today: string, counts: KindCounts, goal: number): Challenge[] {
  const goalChallenge: Challenge = {
    id: 'd-goal',
    title: `Reach your goal of ${goal} XP`,
    progress: Math.min(xpOf(counts), goal),
    target: goal,
    done: xpOf(counts) >= goal,
  };
  return [goalChallenge, ...pick(DAILY, today, 2).map((r) => toChallenge(r, counts, { daysActive: 0, goal }))];
}

export function weeklyChallenges(today: string, counts: KindCounts, daysActive: number, goal: number): Challenge[] {
  return pick(WEEKLY, weekStart(today), 3).map((r) => toChallenge(r, counts, { daysActive, goal }));
}

// ---------------------------------------------------------------------------
// HSK readiness

export type Readiness = {
  level: number;
  percent: number;
  parts: { label: string; percent: number; weight: number }[];
};

/**
 * How ready the learner is for an HSK level, 0–100: vocabulary of the level (40 %), grammar points
 * practised × their average score (20 %), review accuracy (15 %) and the best mock test (25 %; until
 * one is taken, its weight is shared out over the other parts).
 */
export function readiness(level: number, stats: Stats, wordsAtLevel: number, grammarAtLevel: number): Readiness {
  const words = wordsAtLevel ? Math.min(1, (stats.words_by_level[String(level)] ?? 0) / wordsAtLevel) : 0;
  const g = stats.grammar_by_level[String(level)];
  const grammar = grammarAtLevel && g ? Math.min(1, g.points / grammarAtLevel) * (g.avg / 100) : 0;
  const accuracy = (stats.review_accuracy ?? 0) / 100;
  const mock = stats.mock_best[`hsk${level}`];
  const parts = [
    { label: 'Vocabulary', percent: Math.round(words * 100), weight: 40 },
    { label: 'Grammar', percent: Math.round(grammar * 100), weight: 20 },
    { label: 'Review accuracy', percent: Math.round(accuracy * 100), weight: 15 },
    ...(mock !== undefined ? [{ label: 'Mock test', percent: Math.round((mock / 200) * 100), weight: 25 }] : []),
  ];
  const totalWeight = parts.reduce((n, p) => n + p.weight, 0);
  const percent = Math.round(parts.reduce((n, p) => n + p.percent * p.weight, 0) / totalWeight);
  return { level, percent, parts };
}

/** "1 h 20 min", "45 min". */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}
