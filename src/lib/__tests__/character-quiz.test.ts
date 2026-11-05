import { lookAlikeQuestions, pickWritingCharacters, recognitionQuestions, type QuizCharacter } from '../character-quiz';

const ch = (character: string, stroke_count: number, definition: string | null = `meaning of ${character}`): QuizCharacter => ({
  character,
  pinyin: ['x'],
  definition,
  stroke_count,
});

let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('character quizzes', () => {
  const list = [ch('一', 1), ch('二', 2), ch('三', 3), ch('十', 2), ch('人', 2), ch('大', 3), ch('好', 6), ch('谢', 12), ch('？', 1, null)];

  it('builds recognition questions with 4 distinct options including the answer', () => {
    const qs = recognitionQuestions(list, 5, rand);
    expect(qs).toHaveLength(5);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.target.character);
      expect(q.options).not.toContain('？'); // no definition: never used
    }
    expect(new Set(qs.map((q) => q.target.character)).size).toBe(5);
  });

  it('builds look-alike questions from groups present in the data', () => {
    const info = new Map(list.map((c) => [c.character, c]));
    const qs = lookAlikeQuestions([['人', '大'], ['一', '二', '三'], ['己', '已']], info, 10, rand);
    expect(qs).toHaveLength(2); // 己/已 are missing from the data
    for (const q of qs) expect(q.options).toContain(q.target.character);
  });

  it('writes learned characters when there are enough', () => {
    expect(pickWritingCharacters(['你', '好', '我', '是', '人'], ['一'], 3, rand)).toHaveLength(3);
    expect(pickWritingCharacters(['你'], ['一', '二'], 10, rand).sort()).toEqual(['一', '二']);
  });
});
