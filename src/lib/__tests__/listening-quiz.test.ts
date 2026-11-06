import {
  sentenceMeaningQuestions,
  syllableToneQuestions,
  wordCharacterQuestions,
  wordToneQuestions,
} from '../listening-quiz';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('listening quizzes', () => {
  it('asks the tone of syllables with all four tones as options', () => {
    const qs = syllableToneQuestions(10, rand);
    expect(qs).toHaveLength(10);
    for (const q of qs) {
      expect(q.audio).toMatch(/^tone:[a-z]+[1-4]$/);
      expect(q.options).toHaveLength(4);
      expect(Number(q.audio.slice(-1))).toBe(q.answer + 1);
    }
  });

  it('asks word tones with distinct options, one of them right', () => {
    const qs = wordToneQuestions(
      [
        { simplified: '你好', pinyin_numeric: 'ni3 hao3' },
        { simplified: '谢谢', pinyin_numeric: 'xie4 xie5' },
        { simplified: '好', pinyin_numeric: 'hao3' }, // one syllable: skipped
      ],
      10,
      rand,
    );
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.reveal).toContain(q.options[q.answer]);
    }
    expect(qs.find((q) => q.audio === '你好')!.options).toContain('nǐ hǎo');
  });

  it('builds meaning and character questions', () => {
    const sentences = ['A', 'B', 'C', 'D', 'E'].map((e, i) => ({ simplified: `句${i}`, english: e }));
    for (const q of sentenceMeaningQuestions(sentences, 3, rand)) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.answer]).toBe(sentences.find((s) => s.simplified === q.audio)!.english);
    }
    const words = ['你', '我', '他', '她', '好'].map((w, i) => ({ simplified: w, pinyin: `p${i}`, meanings: ['m'] }));
    for (const q of wordCharacterQuestions(words, 5, rand)) expect(q.options[q.answer]).toBe(q.audio);
  });
});
