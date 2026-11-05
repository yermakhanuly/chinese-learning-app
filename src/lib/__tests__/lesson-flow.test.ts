import { advance, correctAnswerText, grade, progressFraction, score, seededShuffle, startFlow } from '../lesson-flow';
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
