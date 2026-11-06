import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { GrammarExercise, GrammarOutlineEntry, GrammarPoint, ReadingText } from '../src/lib/grammar';
import type { Lesson, Step } from '../src/lib/lessons';
import { grammarExerciseIndex } from '../src/lib/srs';
import { createOnboardedUser, logIn, newClient } from './helpers';

const content = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', ...parts), 'utf8'));
const point = (id: string) => content<GrammarPoint>('grammar', `${id}.json`);

/** Answers a grammar exercise (rightly or wrongly) and presses Check. Returns the option picked. */
async function answer(page: Page, ex: GrammarExercise, right: boolean): Promise<number | null> {
  if (ex.type === 'order') {
    const tiles = right ? ex.answer : [...ex.answer].reverse();
    for (const t of tiles) await page.getByRole('button', { name: `Add ${t}`, exact: true }).first().click();
    await page.getByRole('button', { name: 'Check' }).click();
    return null;
  }
  const i = right ? ex.answer : (ex.answer + 1) % ex.options.length;
  await page.getByRole('radio', { name: ex.options[i], exact: true }).click();
  await page.getByRole('button', { name: 'Check' }).click();
  return i;
}

const why = (ex: GrammarExercise, picked: number | null) => (ex.type === 'order' ? ex.why : ex.why[picked!]);

test.describe('grammar (Phase 7)', () => {
  test('the library searches and filters; a point shows patterns, examples and mistakes; lessons link to it', async ({ page }) => {
    await page.goto('/grammar');
    await expect(page.getByRole('status')).toHaveText('72 grammar points');
    await page.getByRole('searchbox', { name: 'Search grammar' }).fill('比');
    await expect(page.getByRole('link', { name: /^比: A is more … than B/ })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('radio', { name: 'Comparisons' }).click();
    await expect(page.getByRole('status')).toHaveText('4 of 72 grammar points');
    await page.getByRole('radio', { name: 'HSK 1' }).click();
    await expect(page.getByText('No grammar points match')).toBeVisible();

    await page.goto('/grammar-point?id=g1-shi');
    await expect(page.getByRole('heading', { name: '是: A is B' })).toBeVisible();
    await expect(page.getByLabel('Sentence patterns')).toContainText('A + 是 + B');
    await expect(page.getByLabel('Wrong: 我是很忙。')).toBeVisible();
    await expect(page.getByLabel('Right: 我很忙。')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to review' })).toHaveCount(0); // guests
    await expect(page.getByRole('link', { name: /^Lesson: / })).toBeVisible();

    // The lesson's grammar note opens the library page over the lesson.
    const note = content<{ points: GrammarOutlineEntry[] }>('grammar', 'outline.json').points.find((p) => p.id === 'g1-shi')!.lesson_notes[0];
    const [lessonId, title] = note.split('|');
    const lesson = content<Lesson>('hsk1', `${lessonId}.json`);
    await page.goto(`/lesson?id=${lessonId}`);
    for (const step of lesson.steps) {
      if (step.type === 'grammar' && step.title === title) break;
      await playLessonStep(page, step);
    }
    await page.getByRole('link', { name: 'More about this in the grammar library →' }).click();
    await expect(page).toHaveURL(/\/grammar-note\?id=g1-shi/);
    await expect(page.getByRole('heading', { name: '是: A is B' })).toBeVisible();
  });

  test('practice explains every answer; scores and missed exercises are saved and can be practised again', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Grammar');
    await logIn(page, email);
    const p = point('g1-shi');
    await page.goto('/grammar-practice?id=g1-shi');

    for (const [i, ex] of p.exercises.entries()) {
      const right = i !== 0;
      const picked = await answer(page, ex, right);
      const alert = page.getByRole('alert');
      await expect(alert).toContainText(right ? 'Correct!' : 'Not quite');
      await expect(alert).toContainText(why(ex, picked));
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page.getByText("LET'S TRY THIS AGAIN")).toBeVisible();
    await answer(page, p.exercises[0], true);
    await page.getByRole('button', { name: 'Continue' }).click();

    const score = Math.round(((p.exercises.length - 1) / p.exercises.length) * 100);
    await expect(page.getByText(`${score}% right first time`)).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Progress saved. Missed exercises are in your mistake notebook.');
    const { data: progress } = await client.from('grammar_progress').select('grammar_id, best_score');
    expect(progress).toEqual([{ grammar_id: 'g1-shi', best_score: score }]);

    // The mistake notebook lists the point and practises just the missed exercise.
    await page.goto('/mistakes');
    await expect(page.getByRole('heading', { name: 'Grammar' })).toBeVisible();
    await page.getByRole('button', { name: 'Practise the 1 missed exercise' }).click();
    await answer(page, p.exercises[0], true);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('status')).toHaveText('Missed exercises practised.');

    await page.goto('/grammar');
    await expect(page.getByRole('link', { name: `是: A is B, HSK 1, practised ${score}%` })).toBeVisible();
  });

  test('grammar review cards are opt-in and graded by the exercise', async ({ page }) => {
    const { email, client } = await createOnboardedUser('GrammarReview');
    await logIn(page, email);
    await page.goto('/grammar-point?id=g1-shi');
    await page.getByRole('button', { name: 'Add to review' }).click();
    await expect(page.getByText(/In your review/)).toBeVisible();

    const { data: cards } = await client.from('review_cards').select('id, kind, grammar_id, reps');
    expect(cards).toHaveLength(1);
    expect(cards![0]).toMatchObject({ kind: 'grammar', grammar_id: 'g1-shi' });
    const p = point('g1-shi');

    await page.goto('/review-session?deck=grammar');
    await expect(page.getByText('NEW · GRAMMAR')).toBeVisible();
    // A new card comes back once or twice in the same session (learning steps), each time with
    // another exercise of the point.
    let reps = 0;
    while (!(await page.getByText('All answers saved.').isVisible())) {
      const ex = p.exercises[grammarExerciseIndex(cards![0].id, reps, p.exercises.length)];
      await answer(page, ex, true);
      await expect(page.getByRole('alert')).toContainText('Correct!');
      await page.getByRole('button', { name: /^Continue · Good, / }).click();
      reps++;
      await expect(page.getByText('All answers saved.').or(page.getByText(/· GRAMMAR$/))).toBeVisible();
      expect(reps).toBeLessThan(5);
    }
    const { data: log } = await client.from('review_log').select('rating');
    expect(log!.map((l) => l.rating)).toEqual(Array(reps).fill(3));

    await page.goto('/grammar-point?id=g1-shi');
    await page.getByRole('button', { name: 'Remove from review' }).click();
    await expect(page.getByRole('button', { name: 'Add to review' })).toBeVisible();
  });
});

test.describe('reading (Phase 7)', () => {
  test('a learner reads a text: translation, tap a word, read-along, questions saved', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Reader');
    await logIn(page, email);
    const text = content<ReadingText>('reading', 'r1-01.json');

    await page.goto('/reading');
    await expect(page.getByRole('link', { name: /, (story|dialogue)/ })).toHaveCount(10);
    await page.getByRole('link', { name: /^My family, story/ }).click();
    await expect(page).toHaveURL(/\/reading-text\?id=r1-01/);
    await expect(page.getByText(text.title, { exact: true })).toBeVisible();

    await expect(page.getByText(text.sentences[0].en)).toHaveCount(0);
    await page.getByRole('switch', { name: 'Show translation' }).click();
    await expect(page.getByText(text.sentences[0].en)).toBeVisible();

    await page.getByRole('link', { name: /^医生, / }).first().click();
    const panel = page.getByRole('region', { name: 'Word: 医生' });
    await expect(panel).toContainText('doctor');
    await panel.getByRole('button', { name: 'Save word' }).click();
    await expect(panel.getByRole('button', { name: 'Remove from saved words' })).toBeVisible();
    await panel.getByRole('button', { name: 'Close word' }).click();

    await page.getByRole('button', { name: '▶ Listen to the whole text' }).click();
    await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: '■ Stop' }).click();
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);

    // Three right, one wrong; each answer is explained.
    for (const [i, q] of text.questions.entries()) {
      const pick = i === 1 ? (q.answer + 1) % q.options.length : q.answer;
      await page.getByRole('radiogroup', { name: q.prompt }).getByRole('radio', { name: q.options[pick], exact: true }).click();
      await expect(page.getByRole('alert').nth(i)).toContainText(q.why[pick]);
    }
    await expect(page.getByRole('status')).toHaveText('75% right · Saved');
    const { data } = await client.from('reading_progress').select('text_id, best_score');
    expect(data).toEqual([{ text_id: 'r1-01', best_score: 75 }]);

    await page.goto('/reading');
    await expect(page.getByRole('link', { name: 'My family, story, read, 75%' })).toBeVisible();
  });

  test('content is public and read-only; progress is private and saved only through checked functions', async () => {
    const anon = newClient();
    const { count: points } = await anon.from('grammar_points').select('*', { count: 'exact', head: true });
    const { count: texts } = await anon.from('reading_texts').select('*', { count: 'exact', head: true });
    expect(points).toBe(72);
    expect(texts).toBe(20);
    expect((await anon.from('grammar_points').update({ title: 'x' }).eq('id', 'g1-shi')).error).not.toBeNull();
    expect((await anon.rpc('complete_reading', { p_text_id: 'r1-01', p_score: 100 })).error).not.toBeNull();

    const a = await createOnboardedUser('GrammarA');
    const b = await createOnboardedUser('GrammarB');
    expect((await a.client.from('grammar_progress').insert({ grammar_id: 'g1-shi', best_score: 100, last_score: 100 })).error).not.toBeNull();
    await a.client.from('reading_texts').delete().eq('id', 'r1-01');
    expect((await anon.from('reading_texts').select('id').eq('id', 'r1-01')).data).toHaveLength(1); // nothing deleted
    expect((await a.client.rpc('complete_grammar', { p_grammar_id: 'g1-shi', p_score: 50, p_missed: [99] })).error).not.toBeNull();
    expect((await a.client.rpc('add_grammar_card', { p_grammar_id: 'g9-nope' })).error).not.toBeNull();

    expect((await a.client.rpc('complete_grammar', { p_grammar_id: 'g1-shi', p_score: 50, p_missed: [1] })).error).toBeNull();
    expect((await a.client.rpc('complete_reading', { p_text_id: 'r1-01', p_score: 80 })).error).toBeNull();
    expect((await b.client.from('grammar_progress').select('*')).data).toEqual([]);
    expect((await b.client.from('reading_progress').select('*')).data).toEqual([]);
    expect((await b.client.rpc('grammar_mistakes')).data).toEqual([]);
    expect((await a.client.rpc('grammar_mistakes')).data).toMatchObject([{ grammar_id: 'g1-shi', exercises: [1] }]);
  });
});

/** Steps through a lesson step with the right answer (enough to reach a grammar note). */
async function playLessonStep(page: Page, step: Step) {
  if (step.type === 'word' || step.type === 'grammar') {
    await page.getByRole('button', { name: 'Continue' }).click();
    return;
  }
  if (step.type === 'choice' || step.type === 'fill') {
    await page.getByRole('radio', { name: step.options[step.answer], exact: true }).click();
  } else {
    for (const t of step.answer) await page.getByRole('button', { name: `Add ${t}`, exact: true }).first().click();
  }
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}
