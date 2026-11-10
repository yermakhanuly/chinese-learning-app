/**
 * Mock HSK tests: format, checker and scoring. Shared by the import script (Node) and the app:
 * relative `.ts` imports only. Content lives in content/mock/hsk<N>.json (simplified Chinese; the
 * app adds pinyin). Scored like the real HSK 1–2: each section out of 100, total 200, pass 120.
 */
import { BASE_WORDS } from './grammar.ts';
import { unknownWords } from './lessons.ts';
import { isHan, type Lexicon } from './sentences.ts';

export type MockQuestion =
  /** Hear a sentence; is the written statement (★) true? */
  | { type: 'listen-judge'; audio: string; statement: string; answer: boolean; why: string }
  /** Hear a short dialogue (lines alternate voices), answer the question. */
  | { type: 'listen-choice'; audio: string[]; question: string; options: string[]; answer: number; why: string }
  /** Read a sentence (a gap is ___ ) or a question, pick the fitting option. */
  | { type: 'read-choice'; text: string; options: string[]; answer: number; why: string }
  /** Read a short text; is the statement (★) true? */
  | { type: 'read-judge'; text: string; statement: string; answer: boolean; why: string };

export type MockSection = { id: 'listening' | 'reading'; title: string; instructions: string; questions: MockQuestion[] };

export type MockTest = { id: string; level: 1 | 2; title: string; minutes: number; sections: MockSection[] };

export const PASS_MARK = 120;
export const MAX_PLAYS = 2;

export function isListening(q: MockQuestion) {
  return q.type === 'listen-judge' || q.type === 'listen-choice';
}

/** Every Chinese text in a test (for pinyin and audio). */
export function mockTexts(test: MockTest): string[] {
  const texts = test.sections.flatMap((s) =>
    s.questions.flatMap((q) => {
      switch (q.type) {
        case 'listen-judge':
          return [q.audio, q.statement];
        case 'listen-choice':
          return [...q.audio, q.question, ...q.options];
        case 'read-choice':
          return [q.text, ...q.options];
        case 'read-judge':
          return [q.text, q.statement];
      }
    }),
  );
  return [...new Set(texts.filter((t) => [...t].some(isHan)))];
}

/** Problems in a mock test (empty = OK). `known`: HSK words up to its level. */
export function checkMock(test: MockTest, known: Set<string>, lex: Lexicon): string[] {
  const problems: string[] = [];
  if (test.id !== `hsk${test.level}`) problems.push(`id should be hsk${test.level}`);
  const ids = test.sections.map((s) => s.id).join(',');
  if (ids !== 'listening,reading') problems.push('sections must be listening, then reading');
  for (const s of test.sections) {
    if (s.questions.length < 10 || s.questions.length > 25) problems.push(`${s.id}: ${s.questions.length} questions (need 10–25)`);
    s.questions.forEach((q, i) => {
      const at = `${s.id} ${i + 1}`;
      if (isListening(q) !== (s.id === 'listening')) problems.push(`${at}: ${q.type} is in the wrong section`);
      if (!q.why.trim()) problems.push(`${at}: no explanation`);
      if (q.type === 'listen-choice' || q.type === 'read-choice') {
        if (q.options.length !== 3) problems.push(`${at}: needs 3 options`);
        if (new Set(q.options).size !== q.options.length) problems.push(`${at}: duplicate options`);
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${at}: answer out of range`);
      }
      if (q.type === 'listen-choice' && (q.audio.length < 1 || q.audio.length > 4)) problems.push(`${at}: 1–4 audio lines`);
      if (q.type === 'read-choice' && q.text.includes('___') && q.options.some((o) => o.length > 6)) problems.push(`${at}: gap options should be words`);
    });
    const judges = s.questions.filter((q) => q.type === 'listen-judge' || q.type === 'read-judge') as { answer: boolean }[];
    if (judges.length && (judges.every((q) => q.answer) || judges.every((q) => !q.answer))) problems.push(`${s.id}: true/false answers are all the same`);
  }
  const allowed = new Set([...known, ...BASE_WORDS]);
  for (const text of mockTexts(test)) {
    const plain = text.replace(/___/g, '');
    if (/[A-Za-z]/.test(plain)) problems.push(`"${text}" has Latin letters`);
    const unknown = unknownWords(plain, allowed, lex);
    if (unknown.length) problems.push(`"${text}" uses words above HSK ${test.level}: ${unknown.join(', ')}`);
  }
  return problems;
}

export type MockAnswer = number | boolean | null;

export function isRight(q: MockQuestion, a: MockAnswer): boolean {
  return a !== null && a === q.answer;
}

/** Section scores out of 100 and the total out of 200. */
export function scoreMock(test: MockTest, answers: MockAnswer[][]) {
  const sections = test.sections.map((s, si) => {
    const right = s.questions.filter((q, qi) => isRight(q, answers[si]?.[qi] ?? null)).length;
    return { id: s.id, right, count: s.questions.length, score: Math.round((right / s.questions.length) * 100) };
  });
  const total = sections.reduce((n, s) => n + s.score, 0);
  return { sections, total, passed: total >= PASS_MARK };
}
