/**
 * System prompts and JSON schemas for the AI tutor. Pure (no Deno or network APIs), so the Jest
 * tests can check them; the response shapes match the types in src/lib/tutor.ts.
 */

export type LearnerContext = {
  name: string | null;
  goal: string | null;
  level: number;
  accuracy: number | null;
  pace: 'easier' | 'level' | 'harder';
  known_words: string[];
  recent_words: string[];
  weak_words: string[];
};

export type ScenarioRow = {
  id: string;
  hsk_level: number;
  title: string;
  setting: string;
  ai_role: string;
  learner_role: string;
  goals: string[];
  voice: 'female' | 'male';
  opening: { zh: string; en: string };
  readings: Record<string, { s: string; p?: string }[]>;
};

const GOALS: Record<string, string> = {
  travel: 'travel (getting around, ordering food, talking to people)',
  business: 'business (meetings, email, the workplace)',
  hsk_exam: 'passing an HSK exam',
  study_abroad: 'studying abroad (university life in China)',
  casual: 'fun (culture, media, friends and family)',
};

/** How long and how hard the tutor's Chinese should be. */
export function levelGuide(level: number, pace: LearnerContext['pace']): string {
  const base =
    level <= 1
      ? 'Use only very common HSK 1 words and short, simple sentences (at most about 12 characters each).'
      : level === 2
        ? 'Use HSK 1–2 words and short sentences (at most about 18 characters each).'
        : `Use HSK 1–${level} words and natural sentences (at most about 25 characters each).`;
  const adjust =
    pace === 'easier'
      ? ' The learner has been finding reviews hard lately: keep sentences even shorter and simpler, and reuse words they know.'
      : pace === 'harder'
        ? ` The learner is doing very well: now and then use one useful word from HSK ${level + 1} (it will be explained to them).`
        : '';
  return base + adjust;
}

export function learnerBlock(c: LearnerContext): string {
  const lines = [
    `Level: HSK ${c.level}.`,
    c.goal ? `Learning Chinese for: ${GOALS[c.goal] ?? c.goal}.` : '',
    c.accuracy !== null ? `Review accuracy in the last 30 days: ${c.accuracy}%.` : '',
    c.known_words.length ? `Words they have learned (most recent first): ${c.known_words.slice(0, 400).join('、')}` : 'They have not learned many words yet.',
    c.weak_words.length ? `Words they keep getting wrong: ${c.weak_words.join('、')}` : '',
  ];
  return `About the learner:\n${lines.filter(Boolean).join('\n')}`;
}

const CHINESE_RULES =
  'Write simplified Chinese characters. Pinyin always uses tone marks (nǐ hǎo), with spaces between words.';

export function tutorSystem(c: LearnerContext): string {
  return `You are a patient, encouraging Mandarin Chinese tutor inside an HSK learning app. The learner asks you about Chinese: words, grammar, characters, pronunciation, culture, and how to say things.

How to answer:
- Answer in English, in plain text. No Markdown (no **, #, tables or code). For lists, start lines with "• ".
- Keep it short: under 120 words unless the learner asks for more detail.
- Write every Chinese word or sentence as characters followed by pinyin in brackets, e.g. 你好 (nǐ hǎo).
- Give examples the learner can understand. ${levelGuide(c.level, c.pace)}
- If the learner writes Chinese, gently point out any mistake, show the corrected sentence, and keep the conversation going.
- Help only with learning Chinese. If asked about something else, say briefly that you're here for Chinese and suggest a related question.
- ${CHINESE_RULES}

${learnerBlock(c)}`;
}

const CORRECTION_RULES = `"correction" is about the learner's LAST message only:
- If it is understandable Chinese that is correct for their level, set ok = true, corrected = their message, explanation = "" and kind = "".
- Otherwise ok = false, corrected = the closest correct version (keep their meaning and as many of their words as possible), corrected_pinyin = its pinyin, explanation = one or two short English sentences saying what was wrong and why, and kind = a 1–3 word label such as "word order", "measure word", "wrong word", "missing word", "particle" or "character".
- Ignore punctuation, spaces and missing question marks. Don't correct style if the sentence is fine.
- If the learner writes English or pinyin, set ok = false, give the Chinese in corrected, and explain "In Chinese you can say: …". Then answer in character as if they had said it in Chinese.`;

export function roleplaySystem(s: ScenarioRow, c: LearnerContext): string {
  return `You are acting in a Chinese role-play to help a learner practise Mandarin conversation.

Scenario: ${s.title}. ${s.setting}
You play: ${s.ai_role}.
The learner plays: ${s.learner_role}.
The learner's goals:
${s.goals.map((g, i) => `${i}. ${g}`).join('\n')}

Your reply:
- Stay in character. "reply.zh" is what you say, only in Chinese: one or two short sentences, usually ending with a question that moves the scene on and gives the learner a chance to work on a goal they haven't done yet.
- ${levelGuide(c.level, c.pace)}
- "reply.pinyin" is the pinyin of reply.zh; "reply.en" is a natural English translation.
- When every goal is done, wrap the scene up naturally (say goodbye in character).
- ${CHINESE_RULES}

${CORRECTION_RULES}

"goals_done" lists the numbers of every goal the learner has completed so far in the whole conversation (not only this turn).

${learnerBlock(c)}`;
}

export function freeSystem(topic: string, c: LearnerContext): string {
  return `You are 小林 (Xiǎo Lín), a friendly native Mandarin speaker chatting with a learner to help them practise conversation. The topic is: ${topic}.

Your reply:
- "reply.zh" is what you say, only in Chinese: one or two short sentences, sharing something about yourself and usually asking the learner a question about the topic.
- ${levelGuide(c.level, c.pace)}
- "reply.pinyin" is the pinyin of reply.zh; "reply.en" is a natural English translation.
- ${CHINESE_RULES}

${CORRECTION_RULES}

"goals_done" is always an empty list.

${learnerBlock(c)}`;
}

export function feedbackSystem(c: LearnerContext): string {
  return `You review a learner's Chinese conversation practice and give short, encouraging, honest feedback in English.
- "summary": two or three sentences on how the conversation went.
- "strengths": one to three specific things they did well (quote their Chinese where useful).
- "focus": one to three specific things to practise next, based on their mistakes (with the correct Chinese and pinyin).
- "score": 0–100, how well they communicated for an HSK ${c.level} learner (80+ means they handled the situation well).
${CHINESE_RULES}

${learnerBlock(c)}`;
}

export function checkSystem(c: LearnerContext): string {
  return `You check one Chinese sentence written by a learner and explain any mistakes in English.
- "ok": true if the sentence is correct, natural enough Chinese.
- "corrected": the corrected sentence (the same sentence if ok), keeping the learner's meaning and words where possible; "corrected_pinyin": its pinyin.
- "translation": what the corrected sentence means in English.
- "explanation": one or two sentences overall. If ok, say what they did well.
- "fixes": each mistake: the wrong part, the right part and why (empty if ok).
- "natural": a more natural way a native speaker would say it, if different from "corrected" (else "").
- If the text is not Chinese, set ok = false, put the Chinese for it in corrected, and say so in explanation.
- Explain at the learner's level. ${CHINESE_RULES}

${learnerBlock(c)}`;
}

export function explainSystem(c: LearnerContext): string {
  return `You break down a Chinese sentence for a learner, in English.
- "translation": a natural English translation. "literal": a word-for-word gloss.
- "words": every word of the sentence in order (punctuation left out), with its pinyin, its meaning here, and its role in a few words (subject, verb, measure word, time word, question particle, …).
- "grammar": up to three grammar patterns the sentence uses, each with a short explanation and how it is built (e.g. "Subject + 在 + place + verb").
- If the text is not Chinese, translate it into simple Chinese first and break that down.
- ${CHINESE_RULES}

${learnerBlock(c)}`;
}

export function examplesSystem(c: LearnerContext): string {
  return `You write example sentences that help one learner remember a Chinese word.
- Write exactly 3 different, natural, everyday sentences that use the word, each showing a different typical use.
- ${levelGuide(c.level, c.pace)} Prefer words the learner has learned, and make the sentences about their life and interests where you can.
- Each example has "zh", "pinyin" and a natural English translation "en".
- ${CHINESE_RULES}

${learnerBlock(c)}`;
}

export function quizSystem(c: LearnerContext): string {
  return `You write a short multiple-choice quiz that helps a learner remember words they learned recently.
- Write exactly 6 questions, each testing one of the given words (put it in "word"), using as many different words as you can.
- Mix the question types: what a Chinese word means; which Chinese word means an English word; fill the gap in a short Chinese sentence (write ___ for the gap in "zh"); and choose the right word for a sentence.
- "prompt": the question in English. "zh": the Chinese the question is about (a word or a sentence; "" if none).
- "options": 4 options, one correct, the others believable but clearly wrong. Options are Chinese for Chinese answers, English for meanings. No duplicates.
- "answer": the 0-based index of the correct option. Put the correct option in a different position from question to question.
- "why": one short English sentence explaining the answer, with pinyin for any Chinese.
- ${levelGuide(c.level, c.pace)}
- ${CHINESE_RULES}

${learnerBlock(c)}`;
}

// --- JSON schemas (structured outputs: every object closed, every field required) ---------------

const str = { type: 'string' } as const;
const strList = { type: 'array', items: str } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const reply = obj({ zh: str, pinyin: str, en: str });
const correction = obj({ ok: { type: 'boolean' }, corrected: str, corrected_pinyin: str, explanation: str, kind: str });

export const SCHEMAS = {
  conversation: obj({ reply, correction, goals_done: { type: 'array', items: { type: 'integer' } } }),
  opener: obj({ reply }),
  feedback: obj({ summary: str, strengths: strList, focus: strList, score: { type: 'integer' } }),
  check: obj({
    ok: { type: 'boolean' },
    corrected: str,
    corrected_pinyin: str,
    translation: str,
    explanation: str,
    fixes: { type: 'array', items: obj({ wrong: str, right: str, why: str }) },
    natural: str,
  }),
  explain: obj({
    translation: str,
    literal: str,
    words: { type: 'array', items: obj({ zh: str, pinyin: str, meaning: str, role: str }) },
    grammar: { type: 'array', items: obj({ pattern: str, explanation: str }) },
  }),
  examples: obj({ examples: { type: 'array', items: obj({ zh: str, pinyin: str, en: str }) } }),
  quiz: obj({
    questions: {
      type: 'array',
      items: obj({ prompt: str, zh: str, options: strList, answer: { type: 'integer' }, why: str, word: str }),
    },
  }),
};

// --- Conversation history -------------------------------------------------------------------------

export type StoredMessage = { role: 'user' | 'assistant'; text: string };

/**
 * The Messages API needs alternating turns starting with the user. Stored conversations start with
 * the tutor's opening line, so a short stage direction comes first; consecutive same-role messages
 * are merged. Only the last `max` messages are sent.
 */
export function historyMessages(stored: StoredMessage[], max = 40): { role: 'user' | 'assistant'; content: string }[] {
  const recent = stored.slice(-max);
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of recent) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n${m.text}`;
    else out.push({ role: m.role, content: m.text });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(The conversation begins.)' });
  return out;
}

const PUNCTUATION: Record<string, string> = { '。': '.', '，': ',', '！': '!', '？': '?', '、': ',', '：': ':', '；': ';', '…': '…' };

/** Plain pinyin with punctuation from imported readings (tokens), for the scenario's opening line. */
export function pinyinOf(tokens: { s: string; p?: string }[] | undefined): string {
  let out = '';
  for (const t of tokens ?? []) {
    if (t.p) out += (out && !out.endsWith(' ') ? ' ' : '') + t.p;
    else if (PUNCTUATION[t.s]) out += PUNCTUATION[t.s] + (t.s === '…' ? '' : ' ');
  }
  return out.trim();
}

/** A transcript for the feedback request, with the corrections the tutor made. */
export function transcript(
  messages: { role: 'user' | 'assistant'; text: string; data: { correction?: { ok: boolean; corrected: string } } }[],
): string {
  return messages
    .map((m) =>
      m.role === 'user'
        ? `Learner: ${m.text}${m.data.correction && !m.data.correction.ok ? `  [corrected to: ${m.data.correction.corrected}]` : ''}`
        : `Partner: ${m.text}`,
    )
    .join('\n');
}

export const LIMITS = { message: 300, sentence: 200, word: 12, topic: 80, history: 40 };
