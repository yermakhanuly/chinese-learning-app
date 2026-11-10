/**
 * A stand-in for the Claude Messages API, for checking the `tutor` Edge Function locally without
 * spending credit: it answers each request with canned JSON for the requested schema and logs the
 * requests to scripts/.tutor-requests.jsonl (git-ignored). See README → Testing the AI tutor locally.
 *
 *   node scripts/fake-anthropic.ts      # listens on :8787
 */
import fs from 'node:fs';
import http from 'node:http';

const LOG = new URL('./.tutor-requests.jsonl', import.meta.url);
const answers = {
  conversation: {
    reply: { zh: '好的！你想喝什么？', pinyin: 'hǎo de! nǐ xiǎng hē shénme?', en: 'OK! What would you like to drink?' },
    correction: {
      ok: false,
      corrected: '我要一个米饭。',
      corrected_pinyin: 'wǒ yào yí ge mǐfàn.',
      explanation: 'Put 要 before what you want.',
      kind: 'word order',
    },
    goals_done: [0, 7],
  },
  opener: {
    reply: { zh: '你好！你喜欢做什么？', pinyin: 'nǐ hǎo! nǐ xǐhuan zuò shénme?', en: 'Hi! What do you like doing?' },
  },
  feedback: {
    summary: 'You ordered food well.',
    strengths: ['Clear greetings'],
    focus: ['Word order with 要'],
    score: 140,
  },
  check: {
    ok: false,
    corrected: '我很喜欢吃米饭。',
    corrected_pinyin: 'wǒ hěn xǐhuan chī mǐfàn.',
    translation: 'I really like eating rice.',
    explanation: '很 goes before 喜欢.',
    fixes: [{ wrong: '喜欢很', right: '很喜欢', why: 'Adverbs go before the verb.' }],
    natural: '',
  },
  explain: {
    translation: 'I am at home.',
    literal: 'I at home',
    words: [{ zh: '我', pinyin: 'wǒ', meaning: 'I', role: 'subject' }],
    grammar: [{ pattern: 'Subject + 在 + place', explanation: 'Says where someone is.' }],
  },
  examples: { examples: [{ zh: '我喝水。', pinyin: 'wǒ hē shuǐ.', en: 'I drink water.' }] },
  quiz: {
    questions: [
      {
        prompt: 'What does this mean?',
        zh: '水',
        options: ['water', 'tea', 'rice', 'milk'],
        answer: 0,
        why: '水 (shuǐ) is water.',
        word: '水',
      },
      {
        prompt: 'Which is "tea"?',
        zh: '',
        options: ['水', '茶', '饭', '茶'],
        answer: 1,
        why: 'duplicate options: dropped',
        word: '茶',
      },
      {
        prompt: 'Fill the gap',
        zh: '我___茶。',
        options: ['喝', '吃', '看', '听'],
        answer: 0,
        why: '喝 (hē) is drink.',
        word: '喝',
      },
      {
        prompt: 'Which is "rice"?',
        zh: '',
        options: ['米饭', '面条', '水果', '茶'],
        answer: 0,
        why: '米饭 (mǐfàn).',
        word: '米饭',
      },
    ],
  },
};
function kind(schema: { properties?: Record<string, unknown> } | undefined): keyof typeof answers | undefined {
  const k = Object.keys(schema?.properties ?? {})
    .sort()
    .join(',');
  const kinds: Record<string, keyof typeof answers> = {
    'correction,goals_done,reply': 'conversation',
    reply: 'opener',
    'focus,score,strengths,summary': 'feedback',
    'corrected,corrected_pinyin,explanation,fixes,natural,ok,translation': 'check',
    'grammar,literal,translation,words': 'explain',
    examples: 'examples',
    questions: 'quiz',
  };
  return kinds[k];
}
http
  .createServer((req, res) => {
    let body = '';
    req
      .on('data', (c) => (body += c))
      .on('end', () => {
        const r = JSON.parse(body || '{}');
        fs.appendFileSync(
          LOG,
          JSON.stringify({
            path: req.url,
            beta: req.headers['anthropic-beta'],
            version: req.headers['anthropic-version'],
            body: r,
          }) + '\n',
        );
        const k = kind(r.output_config?.format?.schema);
        const text = k ? JSON.stringify(answers[k]) : 'The word 是 (shì) links two nouns: 我是学生 (wǒ shì xuésheng).';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_fake',
            type: 'message',
            role: 'assistant',
            model: r.model,
            content: [{ type: 'text', text }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 1200,
              output_tokens: 80,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          }),
        );
      });
  })
  .listen(8787, '0.0.0.0', () => console.log('fake anthropic on 8787'));
