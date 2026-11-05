import { advance, correctAnswerText, grade, missedWords, progressFraction, score, seededShuffle, startFlow, testedWords } from '../lesson-flow';
import type { Step } from '../lessons';

const word: Step = { type: 'word', word: '你' };
const choice: Step = { type: 'choice', prompt: '?', zh: '你', listen: false, options: ['you', 'I'], answer: 0 };
const build: Step = { type: 'build', direction: 'en-zh', source: 'you are good', answer: ['你', '好'], also: [], distractors: ['我'] };
const steps = [word, choice, build];

describe('seededShuffle', () => {
  it('is stable for a seed and keeps every item', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6], 'x');
    expect(seededShuffle([1, 2, 3, 4, 5, 6], 'x')).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('grade / correctAnswerText', () => {
  it('grades choices by index and tiles by text', () => {
    expect(grade(choice, 0)).toBe(true);
    expect(grade(choice, 1)).toBe(false);
    expect(grade(build, ['你', '好'])).toBe(true);
    expect(grade(build, ['好', '你'])).toBe(false);
    expect(correctAnswerText(build)).toBe('你好');
  });
});

describe('lesson flow', () => {
  it('finishes in order when everything is right', () => {
    let s = startFlow(steps);
    s = advance(s, steps, true);
    s = advance(s, steps, true);
    s = advance(s, steps, true);
    expect(s.queue).toEqual([]);
    expect(score(s, steps)).toBe(100);
    expect(progressFraction(s, steps)).toBe(1);
  });

  it('asks a missed exercise once more at the end and scores first tries only', () => {
    let s = startFlow(steps);
    s = advance(s, steps, true); // word
    s = advance(s, steps, false); // choice wrong → re-queued
    expect(s.queue).toEqual([2, 1]);
    s = advance(s, steps, true); // build
    s = advance(s, steps, false); // choice wrong again → dropped, lesson can end
    expect(s.queue).toEqual([]);
    expect(score(s, steps)).toBe(50);
    expect(progressFraction(s, steps)).toBe(1);
  });
});

describe('testedWords / missedWords', () => {
  const tok = (...words: string[]) => words.map((s) => ({ s, t: s }));
  const readings = {
    你: tok('你'),
    我是学生: tok('我', '是', '学生'),
    你好: tok('你好'),
    老师: tok('老师'),
  };
  const focus = new Set(['学生', '老师', '你']);

  it('picks the word an exercise is about', () => {
    expect(testedWords(choice, readings, focus)).toEqual(['你']);
    const meaning: Step = { type: 'choice', prompt: 'Which is "teacher"?', zh: '', listen: false, options: ['学生', '老师'], answer: 1 };
    expect(testedWords(meaning, readings, focus)).toEqual(['老师']);
    const sentence: Step = { type: 'choice', prompt: '?', zh: '我是学生', listen: true, options: ['a', 'b'], answer: 0 };
    expect(testedWords(sentence, readings, focus)).toEqual(['学生']);
    const fill: Step = { type: 'fill', en: 'I am a student', before: '我是', after: '', options: ['老师', '学生'], answer: 1 };
    expect(testedWords(fill, readings, focus)).toEqual(['学生']);
    const tiles: Step = { type: 'build', direction: 'en-zh', source: 'I am a student', answer: ['我', '是', '学生'], also: [], distractors: [] };
    expect(testedWords(tiles, readings, focus)).toEqual(['学生']);
    expect(testedWords(word, readings, focus)).toEqual([]);
  });

  it('collects the words of missed exercises once', () => {
    let s = startFlow(steps);
    s = advance(s, steps, true); // word
    s = advance(s, steps, false); // choice wrong
    s = advance(s, steps, true);
    s = advance(s, steps, false); // choice wrong again
    expect(missedWords(s, steps, readings, focus)).toEqual(['你']);
  });
});
