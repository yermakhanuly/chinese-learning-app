import { buildLexicon } from '../sentences';
import { checkMock, isRight, scoreMock, type MockTest } from '../mock-test';

const words = ['我', '是', '学生', '你', '吗', '不', '好', '很', '他', '老师', '对'];
const lex = buildLexicon(words.map((w) => ({ simplified: w, traditional: w, pinyin: 'x', level: 1 })), []);

const listen = (answer: boolean) => ({ type: 'listen-judge' as const, audio: '我是学生。', statement: '★ 他是学生。', answer, why: 'Because.' });
const read = (answer: number) => ({ type: 'read-choice' as const, text: '你___学生吗？', options: ['是', '很', '不'], answer, why: 'Because.' });

const test = (): MockTest => ({
  id: 'hsk1',
  level: 1,
  title: 'Mock HSK 1',
  minutes: 20,
  sections: [
    { id: 'listening', title: 'L', instructions: '', questions: Array.from({ length: 10 }, (_, i) => listen(i % 2 === 0)) },
    { id: 'reading', title: 'R', instructions: '', questions: Array.from({ length: 10 }, () => read(0)) },
  ],
});

describe('mock tests', () => {
  it('accepts a well-formed test', () => {
    expect(checkMock(test(), new Set(words), lex)).toEqual([]);
  });
  it('rejects wrong sections, off-level words and one-sided true/false answers', () => {
    const t = test();
    t.sections[0].questions = t.sections[0].questions.map(() => listen(true));
    t.sections[1].questions[0] = { ...read(0), text: '你是医生吗？' };
    t.sections.reverse();
    const problems = checkMock(t, new Set(words), lex).join(' ');
    expect(problems).toMatch(/listening, then reading/);
    expect(problems).toMatch(/all the same/);
    expect(problems).toMatch(/医生|医|生/);
  });
  it('scores each section out of 100 and passes at 120', () => {
    const t = test();
    const listening = t.sections[0].questions.map((q) => (q as { answer: boolean }).answer);
    const allRight = scoreMock(t, [listening, t.sections[1].questions.map(() => 0)]);
    expect(allRight).toMatchObject({ total: 200, passed: true });
    const half = scoreMock(t, [listening.map((a, i) => (i < 5 ? a : !a)), t.sections[1].questions.map((_, i) => (i < 7 ? 0 : 1))]);
    expect(half.sections.map((s) => s.score)).toEqual([50, 70]);
    expect(half).toMatchObject({ total: 120, passed: true });
    expect(scoreMock(t, [[], []]).total).toBe(0);
    expect(isRight(listen(false), false)).toBe(true);
    expect(isRight(listen(false), null)).toBe(false);
  });
});
