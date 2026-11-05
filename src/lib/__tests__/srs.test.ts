import {
  answerCard,
  formatInterval,
  fromFsrsCard,
  getScheduler,
  isDeck,
  localDayStart,
  previewGrades,
  startSession,
  type ReviewCardRow,
} from '../srs';

const NOW = new Date('2026-11-05T10:00:00Z');

function row(id: string, overrides: Partial<ReviewCardRow> = {}): ReviewCardRow {
  return {
    id,
    kind: 'word',
    direction: 'read',
    word: id,
    sentence_id: null,
    custom_id: null,
    state: 0,
    schedule_status: 'new',
    stability: 0,
    stability_fast: 0,
    difficulty: 0,
    due_at: NOW.toISOString(),
    last_review_at: null,
    reps: 0,
    lapses: 0,
    scheduled_days: 0,
    learning_step: 0,
    content: { simplified: id, traditional: id, pinyin: '', meanings: [] },
    ...overrides,
  };
}

const days = (from: Date, to: Date | string) => (new Date(to).getTime() - from.getTime()) / 86_400_000;

describe('FSRS scheduling', () => {
  it('orders the next review by grade: Again < Hard < Good < Easy', async () => {
    const s = await getScheduler();
    const next = previewGrades(s, row('你'), NOW);
    const due = [1, 2, 3, 4].map((g) => new Date(next[g as 1 | 2 | 3 | 4].dueAt).getTime());
    expect(due).toEqual([...due].sort((a, b) => a - b));
    expect(days(NOW, next[1].dueAt)).toBeLessThan(0.01); // Again: minutes
    expect(days(NOW, next[3].dueAt)).toBeLessThan(1); // Good on a new card: the 10-minute learning step
    expect(days(NOW, next[4].dueAt)).toBeGreaterThanOrEqual(1); // Easy: days
  });

  it('grows the interval with each Good answer and shrinks it after Again', async () => {
    const s = await getScheduler();
    let card = row('好');
    let now = NOW;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next = previewGrades(s, card, now)[3];
      card = { ...card, ...fromFsrsCard(next) };
      intervals.push(days(now, card.due_at));
      now = new Date(card.due_at);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);

    const forgot = { ...card, ...fromFsrsCard(previewGrades(s, card, now)[1]) };
    expect(days(now, forgot.due_at)).toBeLessThan(1);
    expect(forgot.lapses).toBe(card.lapses + 1);
  });
});

describe('review session', () => {
  const soon = (min: number) => new Date(NOW.getTime() + min * 60000).toISOString();

  it('puts "Again" cards back a few cards later and counts first answers only', () => {
    let s = startSession(['a', 'b', 'c', 'd', 'e'].map((id) => row(id)));
    s = answerCard(s, 1, { due_at: soon(1), state: 1 }, NOW);
    expect(s.queue.map((c) => c.id)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(s.counts[1]).toBe(1);
    // Answer b, c, d, e with Good (due in days): a is left.
    for (let i = 0; i < 4; i++) s = answerCard(s, 3, { due_at: soon(60 * 24 * 3), state: 2 }, NOW);
    expect(s.queue.map((c) => c.id)).toEqual(['a']);
    s = answerCard(s, 3, { due_at: soon(60 * 24 * 2), state: 2 }, NOW);
    expect(s.queue).toEqual([]);
    expect(s.done).toBe(6);
    expect(s.counts).toEqual({ 1: 1, 2: 0, 3: 4, 4: 0 });
  });

  it('keeps a lone learning card in the session', () => {
    const s = answerCard(startSession([row('a')]), 1, { due_at: soon(1) }, NOW);
    expect(s.queue.map((c) => c.id)).toEqual(['a']);
  });
});

describe('helpers', () => {
  it('formats intervals', () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    expect(formatInterval(NOW, at(30_000))).toBe('1m');
    expect(formatInterval(NOW, at(10 * 60_000))).toBe('10m');
    expect(formatInterval(NOW, at(14 * 3_600_000))).toBe('14h');
    expect(formatInterval(NOW, at(4 * 86_400_000))).toBe('4d');
    expect(formatInterval(NOW, at(95 * 86_400_000))).toBe('3mo');
    expect(formatInterval(NOW, at(500 * 86_400_000))).toBe('1.4y');
  });

  it('uses local midnight for the day start', () => {
    const start = new Date(localDayStart(new Date(2026, 10, 5, 15, 30)));
    expect([start.getHours(), start.getMinutes(), start.getDate()]).toEqual([0, 0, 5]);
  });

  it('accepts only known decks', () => {
    expect(['all', 'saved', 'sentences', 'custom', 'weak', 'level:1', 'unit:hsk1-u03'].every(isDeck)).toBe(true);
    expect(['', 'level:x', 'unit:drop table', undefined].some(isDeck)).toBe(false);
  });
});
