/**
 * Tags every 2026-syllabus HSK word with 1–2 topics using Claude, and writes
 * data/word-topics.json ({ "爱好": ["hobbies"], … }), which `npm run data:import` loads.
 * The JSON is committed, so this only runs again when the word list or topics change.
 *
 *   npm run data:topics          # needs ANTHROPIC_API_KEY (env, or scripts/.env)
 *
 * Uses the Message Batches API (half price, results within ~1 hour). Resumable: the batch id is
 * saved to data/raw/topics-batch.json, and words already in the output file are skipped, so
 * re-running after an interruption or partial failure only redoes what's missing.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { TOPICS } from '../src/constants/topics.ts';
import { parseHskEntry, type HskSourceEntry, type WordRow } from '../src/lib/vocab-parsers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HSK_FILE = join(ROOT, 'data', 'raw', 'complete-hsk.json');
const STATE_FILE = join(ROOT, 'data', 'raw', 'topics-batch.json');
const OUT_FILE = join(ROOT, 'data', 'word-topics.json');

const MODEL = 'claude-opus-5-5';
const WORDS_PER_REQUEST = 100;
const SLUGS = TOPICS.map((t) => t.slug) as string[];

const SYSTEM = `You sort Chinese vocabulary for a Mandarin learning app into topics, so learners can browse words by theme.

Topics (slug: what belongs there):
${TOPICS.map((t) => `- ${t.slug}: ${t.hint}`).join('\n')}

For each word, give 1 or 2 topic slugs, most fitting first. Use a second topic only when the word clearly belongs to both. Judge by the word's common meaning, the way a learner meets it. Every word gets at least one topic: function words go in "grammar", and abstract words that fit nowhere else go in "ideas". Return every word you are given, spelled exactly as given.`;

const SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          topics: { type: 'array', items: { type: 'string', enum: SLUGS } },
        },
        required: ['word', 'topics'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
} as const;

function loadWords(): WordRow[] {
  const raw: HskSourceEntry[] = JSON.parse(readFileSync(HSK_FILE, 'utf8'));
  const words = [...new Map(raw.map(parseHskEntry).map((w) => [w.simplified, w])).values()];
  return words.filter((w) => w.hsk_level != null);
}

function loadOutput(): Record<string, string[]> {
  return existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : {};
}

function saveOutput(out: Record<string, string[]>) {
  // Sorted keys keep the committed file's diffs small.
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, 'zh')));
  writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 1) + '\n');
}

function requestFor(id: string, chunk: WordRow[]): Anthropic.Messages.Batches.BatchCreateParams.Request {
  const lines = chunk.map((w) => `${w.simplified}\t${w.pinyin}\t${w.meanings.slice(0, 3).join('; ')}`).join('\n');
  return {
    custom_id: id,
    params: {
      model: MODEL,
      max_tokens: 16000,
      // Simple classification: low effort keeps thinking (and cost) small.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Words (characters, pinyin, meaning):\n${lines}` }],
    },
  };
}

async function main() {
  const client = new Anthropic();
  const words = loadWords();
  const out = loadOutput();

  let state: { batchId: string; chunks: Record<string, string[]> } | null = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : null;

  if (!state) {
    const todo = words.filter((w) => !out[w.simplified]);
    if (!todo.length) {
      console.log(`All ${words.length} words already have topics (${OUT_FILE}).`);
      return;
    }
    const chunks: Record<string, string[]> = {};
    const requests = [];
    for (let i = 0; i < todo.length; i += WORDS_PER_REQUEST) {
      const chunk = todo.slice(i, i + WORDS_PER_REQUEST);
      const id = `words-${i}`;
      chunks[id] = chunk.map((w) => w.simplified);
      requests.push(requestFor(id, chunk));
    }
    const batch = await client.messages.batches.create({ requests });
    state = { batchId: batch.id, chunks };
    writeFileSync(STATE_FILE, JSON.stringify(state));
    console.log(`Submitted batch ${batch.id}: ${todo.length} words in ${requests.length} requests.`);
  } else {
    console.log(`Resuming batch ${state.batchId}.`);
  }

  for (;;) {
    const batch = await client.messages.batches.retrieve(state.batchId);
    if (batch.processing_status === 'ended') break;
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status}: ${c.succeeded} done, ${c.processing} processing…`);
    await new Promise((r) => setTimeout(r, 60_000));
  }

  let tagged = 0;
  let failedRequests = 0;
  const usage = { input: 0, output: 0 };
  for await (const result of await client.messages.batches.results(state.batchId)) {
    const asked = new Set(state.chunks[result.custom_id] ?? []);
    if (result.result.type !== 'succeeded') {
      failedRequests++;
      console.warn(`  ${result.custom_id}: ${result.result.type} (will be retried on the next run)`);
      continue;
    }
    const message = result.result.message;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    if (message.stop_reason !== 'end_turn') {
      failedRequests++;
      console.warn(`  ${result.custom_id}: stopped with ${message.stop_reason} (will be retried)`);
      continue;
    }
    const text = message.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') continue;
    const parsed = JSON.parse(text.text) as { words: { word: string; topics: string[] }[] };
    for (const { word, topics } of parsed.words) {
      // Only accept words we asked about, valid slugs, at most two.
      if (!asked.has(word)) continue;
      const valid = [...new Set(topics.filter((t) => SLUGS.includes(t)))].slice(0, 2);
      if (!valid.length) continue;
      out[word] = valid;
      tagged++;
    }
  }

  saveOutput(out);
  unlinkSync(STATE_FILE); // finished; the next run starts a new batch for anything missing
  const missing = words.filter((w) => !out[w.simplified]).length;
  // Batch pricing for Claude Opus 5.5: half of $4 / $20 per million input / output tokens.
  const cost = (usage.input * 2 + usage.output * 10) / 1_000_000;
  console.log(`✔ tagged ${tagged} words (${failedRequests} failed requests); ${missing} still without a topic.`);
  console.log(`  tokens: ${usage.input} in, ${usage.output} out (≈ $${cost.toFixed(2)})`);
  if (missing) console.log('  Run `npm run data:topics` again to retry the missing words.');
  else console.log('  Next: `npm run data:import` to load topics into the database.');
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('No valid Anthropic API key. Set ANTHROPIC_API_KEY or put it in scripts/.env.');
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
