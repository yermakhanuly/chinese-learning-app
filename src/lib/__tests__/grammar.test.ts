import { buildLexicon } from '../sentences';
import { checkGrammarPoint, checkReading, exerciseToStep, explanation, readingScore, type GrammarPoint, type ReadingText } from '../grammar';
import { filterGrammar } from '../grammar-search';
import { grammarExerciseIndex } from '../srs';

const words = ['我', '是', '学生', '老师', '他', '不', '很', '忙', '吗', '你', '好', '有', '休息', '吧'];
const lex = buildLexicon(
  words.map((w) => ({ simplified: w, traditional: w, pinyin: 'x', level: 1 })),
  [{ simplified: '医生', traditional: '醫生', pinyin_numeric: 'yi1 sheng1' }],
);
const known = new Set(words);

const point = (): GrammarPoint => ({
  id: 'g1-shi',
  level: 1,
  title: '是: A is B',
  topic: 'basics',
  summary: 'Link two nouns.',
  structure: ['A + 是 + B'],
  explanation: 'Use 是 to link nouns.',
  examples: [
    { zh: '我是学生。', en: "I'm a student." },
    { zh: '他是老师。', en: "He's a teacher." },
    { zh: '我不是老师。', en: "I'm not a teacher." },
  ],
  mistakes: [{ wrong: '我是很忙。', right: '我很忙。', why: 'No 是 before adjectives.' }],
  related: [],
  exercises: [
    { type: 'fill', en: "I'm a student.", before: '我', after: '学生。', options: ['是', '很'], answer: 0, why: ['Right.', '很 is for adjectives.'] },
    { type: 'pick', prompt: 'Which is correct?', options: ['我很忙。', '我是忙。'], answer: 0, why: ['Right.', 'No 是.'] },
    { type: 'transform', instruction: 'Negative.', source: '我是学生。', options: ['我不是学生。', '我是不学生。'], answer: 0, why: ['Right.', '不 goes before 是.'] },
    { type: 'order', en: "He's a teacher.", answer: ['他', '是', '老师'], also: [], why: 'A + 是 + B.' },
    { type: 'fill', en: "Are you a student?", before: '你是学生', after: '？', options: ['吗', '吧'], answer: 0, why: ['Right.', '吧 is a guess.'] },
    { type: 'pick', prompt: 'Which is correct?', options: ['他是老师。', '他老师是。'], answer: 0, why: ['Right.', 'Order.'] },
  ],
});

describe('checkGrammarPoint', () => {
  const ids = new Set(['g1-shi']);
  it('accepts a complete point on its level', () => {
    expect(checkGrammarPoint(point(), known, lex, ids)).toEqual([]);
  });
  it('needs an explanation for every option', () => {
    const p = point();
    (p.exercises[0] as { why: string[] }).why = ['Right.'];
    expect(checkGrammarPoint(p, known, lex, ids).join(' ')).toMatch(/one "why" per option/);
  });
  it('flags words above the level in correct sentences', () => {
    const p = point();
    p.examples[0] = { zh: '我是医生。', en: "I'm a doctor." };
    expect(checkGrammarPoint(p, known, lex, ids).join(' ')).toMatch(/医生/);
  });
  it('lets a point teach a few extra words', () => {
    const p = point();
    p.examples[0] = { zh: '我是医生。', en: "I'm a doctor." };
    p.words = ['医生'];
    expect(checkGrammarPoint(p, known, lex, ids)).toEqual([]);
  });
  it('checks deliberately wrong options by character only', () => {
    const p = point();
    p.exercises[1] = { type: 'pick', prompt: 'Which?', options: ['我休息。', '我休休息息。'], answer: 0, why: ['Right.', 'Repeat the whole verb.'] };
    expect(checkGrammarPoint(p, known, lex, ids)).toEqual([]);
  });
  it('rejects related points that do not exist and too few exercise kinds', () => {
    const p = point();
    p.related = ['g9-nope'];
    p.exercises = p.exercises.filter((e) => e.type === 'pick' || e.type === 'fill');
    const problems = checkGrammarPoint(p, known, lex, ids).join(' ');
    expect(problems).toMatch(/g9-nope/);
    expect(problems).toMatch(/kinds/);
  });
});

describe('exercises as lesson steps', () => {
  it('maps every kind and explains the picked option', () => {
    const p = point();
    expect(p.exercises.map((e) => exerciseToStep(e).type)).toEqual(['fill', 'choice', 'choice', 'build', 'fill', 'choice']);
    expect(exerciseToStep(p.exercises[2])).toMatchObject({ zh: '我是学生。' });
    expect(explanation(p.exercises[0], 1)).toBe('很 is for adjectives.');
    expect(explanation(p.exercises[3], null)).toBe('A + 是 + B.');
  });
});

const reading = (): ReadingText => ({
  id: 'r1-01',
  level: 1,
  kind: 'dialogue',
  title: 'Hello',
  title_zh: '你好',
  summary: 'Greetings.',
  speakers: [
    { name: '小明', voice: 'male' },
    { name: '老师', voice: 'female' },
  ],
  names: [],
  new_words: [],
  sentences: Array.from({ length: 6 }, (_, i) => ({ zh: '你好！我是学生，你是老师吗？', en: 'Hi!', speaker: i % 2 })),
  questions: Array.from({ length: 3 }, () => ({ prompt: 'Who?', options: ['A', 'B', 'C'], answer: 0, why: ['Yes.', 'No.', 'No.'] })),
});

describe('checkReading', () => {
  it('accepts a graded dialogue; names may be split into characters', () => {
    expect(checkReading(reading(), known, lex)).toEqual([]);
  });
  it('needs two speakers with different voices for a dialogue', () => {
    const r = reading();
    r.speakers[1].voice = 'male';
    expect(checkReading(r, known, lex).join(' ')).toMatch(/different voices/);
  });
  it('keeps texts graded', () => {
    const r = reading();
    r.sentences[0] = { zh: '我是医生，你好吗？我很忙。', en: '…', speaker: 0 };
    expect(checkReading(r, known, lex).join(' ')).toMatch(/医生/);
  });
  it('scores answers', () => {
    expect(readingScore(reading().questions, [0, 1, 0])).toBe(67);
  });
});

describe('filterGrammar', () => {
  const list = [
    { id: 'a', hsk_level: 1, title: '了: completed actions', topic: 'aspect', summary: 'Done.', structure: [], examples: [] },
    { id: 'b', hsk_level: 2, title: '过: experience', topic: 'aspect', summary: 'Have done.', structure: [], examples: [{ zh: '我去过。', en: "I've been." }] },
    { id: 'c', hsk_level: 1, title: '吗 questions', topic: 'questions', summary: 'Ask yes/no.', structure: [], examples: [] },
  ];
  it('filters by level, topic and words, title matches first', () => {
    expect(filterGrammar(list, { query: '', level: 1, topic: null }).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterGrammar(list, { query: '', level: null, topic: 'aspect' }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(filterGrammar(list, { query: '去过', level: null, topic: null }).map((p) => p.id)).toEqual(['b']);
    expect(filterGrammar(list, { query: 'questions', level: null, topic: null }).map((p) => p.id)).toEqual(['c']);
  });
});

describe('grammarExerciseIndex', () => {
  it('shows a different exercise on each review', () => {
    const seen = new Set([0, 1, 2, 3].map((reps) => grammarExerciseIndex('card-1', reps, 4)));
    expect(seen.size).toBe(4);
  });
});
