/**
 * Spaced repetition: FSRS scheduling (ts-fsrs) plus the pure session logic of the review player.
 * Cards are stored in `review_cards` (snake_case); ts-fsrs works with camelCase cards and Dates.
 */
import { DefaultScheduler, Rating } from 'ts-fsrs';

export type Direction = 'read' | 'listen' | 'recall' | 'write';
export type CardKind = 'word' | 'sentence' | 'custom' | 'character';
export type Grade = 1 | 2 | 3 | 4;

export const GRADES: { grade: Grade; label: string }[] = [
  { grade: Rating.Again, label: 'Again' },
  { grade: Rating.Hard, label: 'Hard' },
  { grade: Rating.Good, label: 'Good' },
  { grade: Rating.Easy, label: 'Easy' },
];

export type WordContent = { simplified: string; traditional: string; pinyin: string; meanings: string[] };
export type SentenceContent = {
  id: number;
  simplified: string;
  traditional: string;
  english: string;
  tokens: { s: string; t: string; p?: string }[];
};
export type CustomContent = { front: string; back: string; zh: string | null };
export type CharacterContent = {
  character: string;
  pinyin: string[];
  definition: string | null;
  strokes: string[];
  medians: number[][][];
};

/** A row of `review_queue()`. */
export type ReviewCardRow = {
  id: string;
  kind: CardKind;
  direction: Direction;
  word: string | null;
  sentence_id: number | null;
  custom_id: string | null;
  state: number;
  schedule_status: string;
  stability: number;
  stability_fast: number;
  difficulty: number;
  due_at: string;
  last_review_at: string | null;
  reps: number;
  lapses: number;
  scheduled_days: number;
  learning_step: number;
  content: WordContent | SentenceContent | CustomContent | CharacterContent;
};

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<'FSRS-7'>>>;
export type FsrsCard = ReturnType<Scheduler['newCard']>;

let scheduler: Promise<Scheduler> | null = null;
/**
 * One shared FSRS-7 scheduler: 90% target retention, learning steps 1 min → 10 min, relearning 10 min.
 * `allowModelOverride: false` keeps those steps, so a forgotten card comes back in the same session
 * (with the override, FSRS-7 may postpone it to the next day).
 */
export function getScheduler(): Promise<Scheduler> {
  scheduler ??= DefaultScheduler({ version: 'FSRS-7', desiredRetention: 0.9, enableFuzz: true, allowModelOverride: false });
  return scheduler;
}

/** Database row → ts-fsrs card. */
export function toFsrsCard(row: ReviewCardRow): FsrsCard {
  return {
    cardId: row.id,
    state: row.state,
    scheduleStatus: row.schedule_status,
    stability: row.stability,
    stabilityFast: row.stability_fast,
    difficulty: row.difficulty,
    dueAt: new Date(row.due_at),
    lastReviewAt: row.last_review_at ? new Date(row.last_review_at) : null,
    reps: row.reps,
    lapses: row.lapses,
    scheduledDays: row.scheduled_days,
    learningStep: row.learning_step,
  } as FsrsCard;
}

/** ts-fsrs card → the row fields it changes (for keeping the local session in sync). */
export function fromFsrsCard(card: FsrsCard): Partial<ReviewCardRow> {
  return {
    state: card.state,
    schedule_status: card.scheduleStatus,
    stability: card.stability,
    stability_fast: card.stabilityFast ?? 0,
    difficulty: card.difficulty,
    due_at: new Date(card.dueAt).toISOString(),
    last_review_at: card.lastReviewAt ? new Date(card.lastReviewAt).toISOString() : null,
    reps: card.reps,
    lapses: card.lapses,
    scheduled_days: card.scheduledDays,
    learning_step: card.learningStep,
  };
}

/** The new card for each grade, as `record_review()` expects it. */
export function previewGrades(s: Scheduler, row: ReviewCardRow, now: Date): Record<Grade, FsrsCard> {
  const out = {} as Record<Grade, FsrsCard>;
  for (const { grade } of GRADES) out[grade] = s.review({ card: toFsrsCard(row), grade, now }).card as FsrsCard;
  return out;
}

/** "1m", "10m", "14h", "4d", "3mo", "1.2y": how long until the card comes back. */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)}y`;
}

/** Cards due again within this long come back in the same session (FSRS learning steps). */
export const SAME_SESSION_MS = 30 * 60 * 1000;

export type Session = {
  queue: ReviewCardRow[];
  done: number;
  /** First answers per grade, for the summary. */
  counts: Record<Grade, number>;
  /** Card ids already answered once (repeats don't count again). */
  seen: string[];
};

export function startSession(cards: ReviewCardRow[]): Session {
  return { queue: cards, done: 0, counts: { 1: 0, 2: 0, 3: 0, 4: 0 }, seen: [] };
}

/**
 * Applies an answer to the current card. If the card is due again soon (Again, or a learning
 * step), it goes back into the queue behind at least `gap` other cards, ordered by due time.
 */
export function answerCard(session: Session, grade: Grade, updated: Partial<ReviewCardRow>, now: Date, gap = 3): Session {
  const [current, ...rest] = session.queue;
  if (!current) return session;
  const firstTime = !session.seen.includes(current.id);
  const next: Session = {
    queue: rest,
    done: session.done + 1,
    counts: firstTime ? { ...session.counts, [grade]: session.counts[grade] + 1 } : session.counts,
    seen: firstTime ? [...session.seen, current.id] : session.seen,
  };
  const card = { ...current, ...updated };
  const dueIn = new Date(card.due_at).getTime() - now.getTime();
  if (dueIn > SAME_SESSION_MS) return next;
  const due = new Date(card.due_at);
  let at = rest.findIndex((c, i) => i >= gap && new Date(c.due_at) > due);
  if (at < 0) at = rest.length;
  return { ...next, queue: [...rest.slice(0, at), card, ...rest.slice(at)] };
}

/** The learner's local midnight, so "new today" resets at their midnight, not UTC's. */
export function localDayStart(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type Deck = 'all' | 'saved' | 'sentences' | 'custom' | 'writing' | 'weak' | `level:${number}` | `unit:${string}`;

export function isDeck(value: string | undefined): value is Deck {
  return (
    value === 'all' ||
    value === 'saved' ||
    value === 'sentences' ||
    value === 'custom' ||
    value === 'writing' ||
    value === 'weak' ||
    /^level:[1-7]$/.test(value ?? '') ||
    /^unit:hsk\d-u\d{2}$/.test(value ?? '')
  );
}
