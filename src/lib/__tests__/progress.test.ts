import {
  addDays,
  badges,
  calendarWeeks,
  computeStreak,
  dailyChallenges,
  formatDuration,
  intensity,
  levelFor,
  readiness,
  weekStart,
  weeklyChallenges,
  type Stats,
} from '../progress';

const days = (list: [string, number][]) => list.map(([day, xp]) => ({ day, xp }));

describe('levels', () => {
  it('starts at level 1 and needs more XP for each level', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, xpInLevel: 0, xpForLevel: 25 });
    expect(levelFor(25).level).toBe(2);
    expect(levelFor(99).level).toBe(2);
    expect(levelFor(100)).toMatchObject({ level: 3, xpInLevel: 0, xpForLevel: 125 });
  });
});

describe('dates', () => {
  it('finds Monday and adds days across months', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday → Monday before
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(calendarWeeks('2026-11-07', 2)).toEqual([
      ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
      ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
    ]);
  });
});

describe('streak', () => {
  it('counts consecutive goal days; today counts once met and never breaks it before', () => {
    const d = days([['2026-11-04', 20], ['2026-11-05', 25], ['2026-11-06', 30]]);
    expect(computeStreak(d, '2026-11-06', 20)).toMatchObject({ current: 3, best: 3, todayMet: true });
    expect(computeStreak(d, '2026-11-07', 20)).toMatchObject({ current: 3, todayMet: false, todayXp: 0 });
  });

  it('days below the goal do not count', () => {
    const d = days([['2026-11-05', 20], ['2026-11-06', 5]]);
    expect(computeStreak(d, '2026-11-06', 20)).toMatchObject({ current: 1, todayMet: false });
  });

  it('a weekly freeze saves one missed day, but only one per week', () => {
    // Mon 2 met, Tue 3 missed (frozen), Wed 4 met, Thu 5 missed (no freeze left), Fri 6 met
    const d = days([['2026-11-02', 20], ['2026-11-04', 20], ['2026-11-06', 20]]);
    const s = computeStreak(d, '2026-11-06', 20);
    expect(s.frozen).toEqual(['2026-11-03']);
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
    expect(s.freezeLeft).toBe(false);
  });

  it('two missed days in a row end the streak', () => {
    const d = days([['2026-11-02', 20], ['2026-11-05', 20]]);
    expect(computeStreak(d, '2026-11-05', 20)).toMatchObject({ current: 1, frozen: [] });
  });

  it('a missed yesterday is at risk until today is met', () => {
    const d = days([['2026-11-03', 20], ['2026-11-04', 20]]);
    const s = computeStreak(d, '2026-11-06', 20);
    expect(s).toMatchObject({ current: 2, atRisk: true, frozen: ['2026-11-05'] });
    const saved = computeStreak([...d, { day: '2026-11-06', xp: 20 }], '2026-11-06', 20);
    expect(saved).toMatchObject({ current: 3, atRisk: false });
  });
});

describe('calendar intensity', () => {
  it('scales with the goal', () => {
    expect([0, 5, 15, 25, 45].map((x) => intensity(x, 20))).toEqual([0, 1, 2, 3, 4]);
  });
});

const stats = (over: Partial<Stats> = {}): Stats => ({
  total_xp: 0,
  total_seconds: 0,
  lessons: 0,
  perfect_lessons: 0,
  reviews: 0,
  review_accuracy: null,
  words_learned: 0,
  words_mastered: 0,
  words_by_level: {},
  characters_written: 0,
  grammar_practised: 0,
  grammar_by_level: {},
  readings: 0,
  reading_avg: null,
  pronunciation_checks: 0,
  skills: {},
  mock_best: {},
  ...over,
});
const noStreak = computeStreak([], '2026-11-07', 20);

describe('badges', () => {
  it('are earned from stats and streaks, with progress', () => {
    const list = badges(stats({ lessons: 1, words_learned: 60 }), { ...noStreak, best: 7 });
    const byId = new Map(list.map((b) => [b.id, b]));
    expect(byId.get('first-lesson')!.earned).toBe(true);
    expect(byId.get('streak-7')!.earned).toBe(true);
    expect(byId.get('streak-30')!.progress).toEqual([7, 30]);
    expect(byId.get('words-100')).toMatchObject({ earned: false, progress: [60, 100] });
    expect(new Set(list.map((b) => b.id)).size).toBe(list.length);
  });
});

describe('challenges', () => {
  it('are stable for a day, start with the daily goal, and track progress', () => {
    const a = dailyChallenges('2026-11-07', { review: { activities: 25, xp: 25 } }, 20);
    const b = dailyChallenges('2026-11-07', {}, 20);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a[0]).toMatchObject({ id: 'd-goal', progress: 20, target: 20, done: true });
    expect(a).toHaveLength(3);
    const w = weeklyChallenges('2026-11-07', {}, 5, 20);
    expect(w).toHaveLength(3);
    expect(weeklyChallenges('2026-11-08', {}, 5, 20).map((c) => c.id)).toEqual(w.map((c) => c.id)); // same week
  });
});

describe('readiness', () => {
  it('weights vocabulary, grammar, accuracy and the mock test', () => {
    const s = stats({ words_by_level: { '1': 150 }, grammar_by_level: { '1': { points: 37, avg: 80 } }, review_accuracy: 90 });
    const r = readiness(1, s, 300, 37);
    // (50×40 + 80×20 + 90×15) / 75
    expect(r.percent).toBe(Math.round((50 * 40 + 80 * 20 + 90 * 15) / 75));
    const withMock = readiness(1, { ...s, mock_best: { hsk1: 180 } }, 300, 37);
    expect(withMock.parts.map((p) => p.label)).toContain('Mock test');
    expect(withMock.percent).toBe(Math.round((50 * 40 + 80 * 20 + 90 * 15 + 90 * 25) / 100));
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect([59, 600, 3600, 4800].map(formatDuration)).toEqual(['1 min', '10 min', '1 h', '1 h 20 min']);
  });
});
