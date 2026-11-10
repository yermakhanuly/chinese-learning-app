import {
  SCHEMAS,
  freeSystem,
  historyMessages,
  learnerBlock,
  levelGuide,
  pinyinOf,
  roleplaySystem,
  transcript,
  tutorSystem,
  type LearnerContext,
  type ScenarioRow,
} from '../../../supabase/functions/tutor/prompts';
import { buildLexicon } from '../sentences';
import {
  checkScenario,
  checkScenarios,
  corrections,
  goalsDone,
  quizScore,
  readingPinyin,
  recommendations,
  type AiQuizQuestion,
  type ConversationFeedback,
  type ConversationReply,
  type ExampleSentence,
  type Scenario,
  type SentenceBreakdown,
  type SentenceCheck,
  type StudyState,
  type TutorMessage,
} from '../tutor';

const words = ['你', '好', '想', '吃', '什么', '我', '要', '一', '个', '米饭', '多少', '钱', '谢谢'];
const lex = buildLexicon(words.map((w) => ({ simplified: w, traditional: w, pinyin: 'x', level: 1 })), [
  { simplified: '买单', traditional: '買單', pinyin_numeric: 'mai3 dan1' },
  { simplified: '咖啡', traditional: '咖啡', pinyin_numeric: 'ka1 fei1' },
]);
const known = new Set(words);

const scenario = (): Scenario => ({
  id: 'restaurant',
  level: 1,
  title: 'Ordering at a restaurant',
  emoji: '🍜',
  setting: 'A small restaurant.',
  ai_role: 'a waiter',
  learner_role: 'a customer',
  voice: 'male',
  goals: ['Order a dish', 'Ask the price', 'Ask for the bill'],
  opening: { zh: '你好！你想吃什么？', en: 'Hello! What would you like?' },
  phrases: [
    { zh: '我要一个……', en: "I'd like a …" },
    { zh: '多少钱？', en: 'How much?' },
    { zh: '买单！', en: 'The bill!' },
    { zh: '谢谢！', en: 'Thanks!' },
  ],
  names: [],
  words: ['买单'],
});

describe('checkScenario', () => {
  it('accepts a scenario on its level (with its extra words)', () => {
    expect(checkScenario(scenario(), known, lex)).toEqual([]);
  });
  it('reports words above the level, Latin letters and missing parts', () => {
    const s = scenario();
    s.phrases[0].zh = '我要咖啡。';
    s.phrases[1].zh = '多少钱 ok？';
    s.goals = ['Order'];
    s.voice = 'robot' as Scenario['voice'];
    const problems = checkScenario(s, known, lex);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('咖啡'),
        expect.stringContaining('Latin'),
        'needs exactly 3 goals',
        'voice must be female or male',
      ]),
    );
  });
  it('reports duplicate ids', () => {
    expect(checkScenarios([scenario(), scenario()], () => known, lex)).toContain('duplicate id restaurant');
  });
});

const msg = (id: number, role: 'user' | 'assistant', text: string, data: TutorMessage['data'] = {}): TutorMessage => ({
  id,
  role,
  text,
  data,
  created_at: '2026-11-10T10:00:00Z',
});

describe('conversation helpers', () => {
  const messages = [
    msg(1, 'assistant', '你好！你想吃什么？'),
    msg(2, 'user', '我一个米饭要', { correction: { ok: false, corrected: '我要一个米饭。', corrected_pinyin: '', explanation: 'Order.', kind: 'word order' } }),
    msg(3, 'assistant', '好的。', { goals_done: [0] }),
    msg(4, 'user', '多少钱？', { correction: { ok: true, corrected: '多少钱？', corrected_pinyin: '', explanation: '', kind: '' } }),
    msg(5, 'assistant', '十块。', { goals_done: [0, 1, 7] }),
  ];
  it('collects completed goals within range', () => {
    expect([...goalsDone(messages, 3)].sort()).toEqual([0, 1]);
  });
  it('lists only the corrected learner messages', () => {
    expect(corrections(messages).map((m) => m.id)).toEqual([2]);
  });
  it('scores a quiz', () => {
    const q = (answer: number): AiQuizQuestion => ({ prompt: '?', zh: '', options: ['a', 'b'], answer, why: '', word: 'x' });
    expect(quizScore([q(0), q(1), q(0)], [0, 0, null])).toEqual({ correct: 1, total: 3 });
  });
  it('turns readings into pinyin with punctuation (same as the Edge Function)', () => {
    const tokens = [
      { s: '你好', p: 'nǐhǎo' },
      { s: '！' },
      { s: '你', p: 'nǐ' },
      { s: '想', p: 'xiǎng' },
      { s: '？' },
    ];
    expect(readingPinyin(tokens)).toBe('nǐhǎo! nǐ xiǎng?');
    expect(pinyinOf(tokens)).toBe(readingPinyin(tokens));
  });
});

describe('recommendations', () => {
  const base: StudyState = {
    level: 1,
    dueReviews: 0,
    weakWords: 0,
    grammarMistakes: 0,
    nextLesson: null,
    grammarPractised: 30,
    grammarTotal: 37,
    readingsDone: 8,
    readingsTotal: 10,
    wordsLearned: 100,
    wordsTotal: 500,
    mockBest: 150,
    conversationsThisWeek: 2,
    premium: true,
  };
  it('puts a big review pile first, then weak words and the next lesson', () => {
    const recs = recommendations({ ...base, dueReviews: 40, weakWords: 5, nextLesson: { id: 'l1', title: 'Greetings' } });
    expect(recs.map((r) => r.id)).toEqual(['review', 'lesson', 'weak']);
    expect(recs[0].href).toEqual({ pathname: '/review-session', params: { deck: 'all' } });
  });
  it('suggests grammar, reading and the mock test when they are behind', () => {
    const recs = recommendations({ ...base, grammarPractised: 3, readingsDone: 0, mockBest: null, wordsLearned: 420 }, 5);
    expect(recs.map((r) => r.id)).toEqual(['mock', 'grammar', 'reading']);
  });
  it('invites premium learners to talk and points others to Premium', () => {
    expect(recommendations({ ...base, conversationsThisWeek: 0 })[0]).toMatchObject({ id: 'conversation', href: { pathname: '/tutor' } });
    expect(recommendations({ ...base, conversationsThisWeek: 0, premium: false })[0]).toMatchObject({ href: { pathname: '/premium' } });
  });
  it('returns nothing when all is on track', () => {
    expect(recommendations(base)).toEqual([]);
  });
});

// --- The Edge Function's prompts and schemas ---------------------------------------------------

const ctx: LearnerContext = {
  name: 'Yernar',
  goal: 'travel',
  level: 1,
  accuracy: 92,
  pace: 'harder',
  known_words: ['你好', '谢谢'],
  recent_words: ['米饭'],
  weak_words: ['钱'],
};

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean; items?: JsonSchema };

/** Every object closed with every field required (what structured outputs needs). */
function closed(schema: JsonSchema, path = '$'): string[] {
  const out: string[] = [];
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) out.push(`${path}: additionalProperties`);
    if (JSON.stringify([...(schema.required ?? [])].sort()) !== JSON.stringify(Object.keys(schema.properties ?? {}).sort())) {
      out.push(`${path}: required`);
    }
    for (const [k, v] of Object.entries(schema.properties ?? {})) out.push(...closed(v, `${path}.${k}`));
  }
  if (schema.items) out.push(...closed(schema.items, `${path}[]`));
  return out;
}

/** The schema's field names, recursively, to compare with a sample of the app's type. */
function shape(schema: JsonSchema): unknown {
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, shape(v)]).sort());
  if (schema.type === 'array') return [shape(schema.items ?? {})];
  return schema.type;
}
function shapeOf(v: unknown): unknown {
  if (Array.isArray(v)) return [shapeOf(v[0])];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x)]).sort());
  return typeof v === 'number' ? 'integer' : typeof v;
}

describe('tutor prompts', () => {
  it('keeps every schema closed', () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) expect([name, closed(schema as JsonSchema)]).toEqual([name, []]);
  });

  it('matches the response types the app reads', () => {
    const reply: ConversationReply = {
      reply: { zh: '', pinyin: '', en: '' },
      correction: { ok: true, corrected: '', corrected_pinyin: '', explanation: '', kind: '' },
      goals_done: [0],
    };
    const feedback: ConversationFeedback = { summary: '', strengths: [''], focus: [''], score: 1 };
    const check: SentenceCheck = { ok: true, corrected: '', corrected_pinyin: '', translation: '', explanation: '', fixes: [{ wrong: '', right: '', why: '' }], natural: '' };
    const explain: SentenceBreakdown = { translation: '', literal: '', words: [{ zh: '', pinyin: '', meaning: '', role: '' }], grammar: [{ pattern: '', explanation: '' }] };
    const example: ExampleSentence = { zh: '', pinyin: '', en: '' };
    const question: AiQuizQuestion = { prompt: '', zh: '', options: [''], answer: 0, why: '', word: '' };
    expect(shape(SCHEMAS.conversation as JsonSchema)).toEqual(shapeOf(reply));
    expect(shape(SCHEMAS.feedback as JsonSchema)).toEqual(shapeOf(feedback));
    expect(shape(SCHEMAS.check as JsonSchema)).toEqual(shapeOf(check));
    expect(shape(SCHEMAS.explain as JsonSchema)).toEqual(shapeOf(explain));
    expect(shape(SCHEMAS.examples as JsonSchema)).toEqual(shapeOf({ examples: [example] }));
    expect(shape(SCHEMAS.quiz as JsonSchema)).toEqual(shapeOf({ questions: [question] }));
  });

  it('adapts the level guide to the pace', () => {
    expect(levelGuide(1, 'level')).toContain('HSK 1 words');
    expect(levelGuide(2, 'easier')).toContain('even shorter');
    expect(levelGuide(1, 'harder')).toContain('HSK 2');
  });

  it('tells the tutor what the learner knows', () => {
    const block = learnerBlock(ctx);
    expect(block).toContain('HSK 1');
    expect(block).toContain('你好、谢谢');
    expect(block).toContain('keep getting wrong: 钱');
    expect(block).toContain('travel');
    expect(tutorSystem(ctx)).toContain('No Markdown');
  });

  it('builds the role-play prompt from the scenario', () => {
    const s: ScenarioRow = { ...scenario(), hsk_level: 1, readings: {} };
    const p = roleplaySystem(s, ctx);
    expect(p).toContain('You play: a waiter.');
    expect(p).toContain('2. Ask for the bill');
    expect(p).toContain('"correction" is about the learner\'s LAST message only');
    expect(freeSystem('Food', ctx)).toContain('The topic is: Food.');
  });

  it('sends alternating turns that start with the learner', () => {
    const h = historyMessages([
      { role: 'assistant', text: '你好！' },
      { role: 'user', text: '你好' },
      { role: 'user', text: '我要米饭' },
      { role: 'assistant', text: '好的。' },
    ]);
    expect(h).toEqual([
      { role: 'user', content: '(The conversation begins.)' },
      { role: 'assistant', content: '你好！' },
      { role: 'user', content: '你好\n我要米饭' },
      { role: 'assistant', content: '好的。' },
    ]);
    const long = Array.from({ length: 60 }, (_, i) => ({ role: (i % 2 ? 'user' : 'assistant') as 'user' | 'assistant', text: String(i) }));
    expect(historyMessages(long, 40)).toHaveLength(41);
  });

  it('writes a transcript with the corrections', () => {
    expect(
      transcript([
        { role: 'assistant', text: '你好！', data: {} },
        { role: 'user', text: '我米饭要', data: { correction: { ok: false, corrected: '我要米饭。' } } },
      ]),
    ).toBe('Partner: 你好！\nLearner: 我米饭要  [corrected to: 我要米饭。]');
  });
});
