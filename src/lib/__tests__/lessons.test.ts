import { checkCourse, checkLesson, isCorrectBuild, unknownWords, type Lesson, type Step } from '../lessons';
import { buildLexicon } from '../sentences';

const hsk = ['我', '你', '是', '不', '学生', '老师', '好', '你好', '吗', '他', '们', '的'].map((w) => ({
  simplified: w,
  traditional: w,
  pinyin: 'x',
  level: 1,
}));
const lex = buildLexicon(hsk, [
  { simplified: '不是', traditional: '不是', pinyin_numeric: 'bu2 shi4' },
  { simplified: '他们', traditional: '他們', pinyin_numeric: 'ta1 men5' },
  { simplified: '医生', traditional: '醫生', pinyin_numeric: 'yi1 sheng1' },
]);

const exercises: Step[] = Array.from({ length: 5 }, () => ({
  type: 'choice',
  prompt: 'What does this mean?',
  zh: '你好',
  listen: false,
  options: ['hello', 'goodbye'],
  answer: 0,
}));

const lesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  title: 'Hello',
  kind: 'lesson',
  words: ['你好'],
  steps: [{ type: 'word', word: '你好' }, ...exercises],
  ...overrides,
});

describe('unknownWords', () => {
  const known = new Set(['我', '是', '不', '学生', '他', '们', '的']);
  it('accepts taught words and words made only of taught characters', () => {
    expect(unknownWords('我不是学生。', known, lex)).toEqual([]);
    expect(unknownWords('他们的', known, lex)).toEqual([]);
  });
  it('reports words not taught yet', () => {
    expect(unknownWords('我是医生', known, lex)).toEqual(['医生']);
  });
});

describe('checkLesson', () => {
  it('passes a valid lesson', () => {
    expect(checkLesson(lesson(), new Set(), lex)).toEqual([]);
  });
  it('requires a word step for every new word and enough exercises', () => {
    const problems = checkLesson(lesson({ steps: exercises.slice(0, 2) }), new Set(), lex);
    expect(problems).toContain('new word 你好 has no word step');
    expect(problems).toContain('only 2 exercises (need at least 5)');
  });
  it('catches untaught vocabulary and broken answers', () => {
    const bad: Step = { type: 'choice', prompt: '?', zh: '我是医生', listen: false, options: ['a', 'a'], answer: 3 };
    const problems = checkLesson(lesson({ steps: [{ type: 'word', word: '你好' }, ...exercises, bad] }), new Set(['我', '是']), lex);
    expect(problems.some((p) => p.includes('医生'))).toBe(true);
    expect(problems.some((p) => p.includes('duplicate options'))).toBe(true);
    expect(problems.some((p) => p.includes('out of range'))).toBe(true);
  });
  it('checks tile exercises', () => {
    const build: Step = {
      type: 'build',
      direction: 'en-zh',
      source: 'I am a student',
      answer: ['我', '是', '学生'],
      also: [['我', '学生']],
      distractors: ['是'],
    };
    const problems = checkLesson(lesson({ steps: [...lesson().steps, build] }), new Set(['我', '是', '学生']), lex);
    expect(problems.some((p) => p.includes('distractor'))).toBe(true);
    expect(problems.some((p) => p.includes('alternative order'))).toBe(true);
  });
});

describe('checkCourse', () => {
  it('requires every target word to be taught exactly once', () => {
    const course = { level: 1, units: [{ id: 'u1', title: '', title_zh: '', theme: 'people', description: '', lessons: [lesson(), lesson({ id: 'l2' })] }] };
    const problems = checkCourse(course, ['你好', '我'], lex);
    expect(problems).toContain('你好 is taught twice (l1 and l2)');
    expect(problems).toContain('never taught: 我');
  });
});

describe('isCorrectBuild', () => {
  type Build = Extract<Step, { type: 'build' }>;
  const zh: Build = { type: 'build', direction: 'en-zh', source: '', answer: ['我', '是', '学生'], also: [], distractors: [] };
  const en: Build = {
    type: 'build',
    direction: 'zh-en',
    source: '',
    answer: ['I', 'am', 'a', 'student'],
    also: [['I’m', 'a', 'student']],
    distractors: [],
  };
  it('compares tile text in order', () => {
    expect(isCorrectBuild(zh, ['我', '是', '学生'])).toBe(true);
    expect(isCorrectBuild(zh, ['学生', '是', '我'])).toBe(false);
  });
  it('accepts alternatives and ignores case', () => {
    expect(isCorrectBuild(en, ['i’m', 'a', 'student'])).toBe(true);
  });
});
