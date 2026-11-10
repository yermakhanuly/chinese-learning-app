/**
 * Checks the grammar library, graded readings, mock tests and role-play scenarios without a
 * database or API calls.
 *
 *   npm run content:check            # every file
 *   npm run content:check -- g1-shi  # only files whose id starts with this
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMock, type MockTest } from '../src/lib/mock-test.ts';
import { checkGrammarPoint, checkReading, type GrammarOutlineEntry, type GrammarPoint, type ReadingText } from '../src/lib/grammar.ts';
import { buildLexicon } from '../src/lib/sentences.ts';
import { checkScenarios, type Scenario } from '../src/lib/tutor.ts';
import { parseCedictLine, parseHskEntry, type HskSourceEntry } from '../src/lib/vocab-parsers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw: HskSourceEntry[] = JSON.parse(readFileSync(join(ROOT, 'data', 'raw', 'complete-hsk.json'), 'utf8'));
const words = [...new Map(raw.map(parseHskEntry).map((w) => [w.simplified, w])).values()];
const cedict = readFileSync(join(ROOT, 'data', 'raw', 'cedict.txt'), 'utf8').split('\n').map(parseCedictLine).filter((e) => e !== null);
const lex = buildLexicon(words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })), cedict);
const upTo = (level: number) => new Set(words.filter((w) => w.hsk_level !== null && w.hsk_level <= level).map((w) => w.simplified));

const prefix = process.argv[2] ?? '';
let bad = 0;
let missing = 0;
let ok = 0;

const outline: GrammarOutlineEntry[] = JSON.parse(readFileSync(join(ROOT, 'content', 'grammar', 'outline.json'), 'utf8')).points;
const ids = new Set(outline.map((p) => p.id));
for (const entry of outline.filter((p) => p.id.startsWith(prefix))) {
  const file = join(ROOT, 'content', 'grammar', `${entry.id}.json`);
  if (!existsSync(file)) {
    missing++;
    continue;
  }
  const point: GrammarPoint = JSON.parse(readFileSync(file, 'utf8'));
  const problems = checkGrammarPoint(point, upTo(point.level), lex, ids);
  if (point.title !== entry.title || point.level !== entry.level) problems.push('title/level differ from the outline');
  if (problems.length) {
    bad++;
    console.log(`✖ ${entry.id}\n  - ${problems.join('\n  - ')}`);
  } else ok++;
}

const readingOutline = join(ROOT, 'content', 'reading', 'outline.json');
if (existsSync(readingOutline)) {
  const texts: { id: string }[] = JSON.parse(readFileSync(readingOutline, 'utf8')).texts;
  for (const t of texts.filter((x) => x.id.startsWith(prefix))) {
    const file = join(ROOT, 'content', 'reading', `${t.id}.json`);
    if (!existsSync(file)) {
      missing++;
      continue;
    }
    const text: ReadingText = JSON.parse(readFileSync(file, 'utf8'));
    const problems = checkReading(text, upTo(text.level), lex);
    if (problems.length) {
      bad++;
      console.log(`✖ ${t.id}\n  - ${problems.join('\n  - ')}`);
    } else ok++;
  }
}
for (const level of [1, 2]) {
  const file = join(ROOT, 'content', 'mock', `hsk${level}.json`);
  if (!`hsk${level}`.startsWith(prefix) && prefix) continue;
  if (!existsSync(file)) {
    missing++;
    continue;
  }
  const test: MockTest = JSON.parse(readFileSync(file, 'utf8'));
  const problems = checkMock(test, upTo(level), lex);
  if (problems.length) {
    bad++;
    console.log(`✖ mock hsk${level}\n  - ${problems.join('\n  - ')}`);
  } else ok++;
}
const scenarioFile = join(ROOT, 'content', 'tutor', 'scenarios.json');
if (existsSync(scenarioFile) && (!prefix || 'scenarios'.startsWith(prefix))) {
  const scenarios: Scenario[] = JSON.parse(readFileSync(scenarioFile, 'utf8')).scenarios;
  const problems = checkScenarios(scenarios, upTo, lex);
  if (problems.length) {
    bad++;
    console.log(`✖ scenarios\n  - ${problems.join('\n  - ')}`);
  } else ok++;
}
console.log(`${ok} OK, ${bad} with problems, ${missing} not written yet`);
process.exit(bad ? 1 : 0);
