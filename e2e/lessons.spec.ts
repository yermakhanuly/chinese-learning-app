import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { Lesson, Step } from '../src/lib/lessons';
import { createOnboardedUser, logIn, newClient } from './helpers';

const lessonFile = (id: string): Lesson =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'hsk1', `${id}.json`), 'utf8'));

/** Answers the current step (rightly or wrongly), then presses Check/Continue as needed. */
async function playStep(page: Page, step: Step, right: boolean) {
  const primary = page.getByRole('button', { name: /^(Check|Continue)$/ });
  if (step.type === 'word' || step.type === 'grammar') {
    await primary.click();
    return;
  }
  if (step.type === 'choice' || step.type === 'fill') {
    const index = right ? step.answer : (step.answer + 1) % step.options.length;
    await page.getByRole('radio', { name: step.options[index], exact: true }).click();
  } else {
    const tiles = right ? step.answer : [...step.answer].reverse();
    for (const t of tiles) await page.getByRole('button', { name: `Add ${t}`, exact: true }).first().click();
  }
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('alert')).toContainText(right ? 'Correct!' : 'Not quite');
  await page.getByRole('button', { name: 'Continue' }).click();
}

const isExercise = (s: Step) => s.type === 'choice' || s.type === 'fill' || s.type === 'build';

test.describe('lessons (Phase 3)', () => {
  test('a guest can open the roadmap and play the first lesson start to finish', async ({ page }) => {
    const lesson = lessonFile('hsk1-u01-l1');
    await page.goto('/learn');
    await expect(page.getByText('START HERE')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Lesson: .*, next$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Start lesson' }).click();
    await expect(page).toHaveURL(/\/lesson\?id=hsk1-u01-l1/);

    for (const step of lesson.steps) await playStep(page, step, true);
    await expect(page.getByRole('heading', { name: 'Lesson complete!' })).toBeVisible();
    await expect(page.getByText('100% right first time')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Log in to save your progress.');
  });

  test('mistakes come back at the end, lower the score, and progress is saved for learners', async ({ page }) => {
    const { email } = await createOnboardedUser('Learner');
    await logIn(page, email);
    const lesson = lessonFile('hsk1-u01-l1');
    const firstExercise = lesson.steps.findIndex(isExercise);
    await page.goto('/lesson?id=hsk1-u01-l1');

    for (const [i, step] of lesson.steps.entries()) await playStep(page, step, i !== firstExercise);
    // The missed exercise is asked again.
    await expect(page.getByText("LET'S TRY THIS AGAIN")).toBeVisible();
    await playStep(page, lesson.steps[firstExercise], true);

    const exercises = lesson.steps.filter(isExercise).length;
    const expected = Math.round(((exercises - 1) / exercises) * 100);
    await expect(page.getByText(`${expected}% right first time`)).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Progress saved.');

    await page.getByRole('button', { name: 'Back to lessons' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`^Lesson: ${lesson.title}, done, best ${expected}%$`) })).toBeVisible();
    await expect(page.getByText(/^CONTINUE · 1 of \d+ done$/)).toBeVisible();
  });

  test('the placement test sets where the path starts', async ({ page }) => {
    const { email, client, userId } = await createOnboardedUser('Placed');
    await logIn(page, email);
    const { data: hsk1 } = await client.from('words').select('simplified, meanings').eq('hsk_level', 1);
    const meaningOf = new Map(hsk1!.map((w) => [w.simplified, w.meanings.slice(0, 2).join('; ')]));
    const unit1 = new Set(['hsk1-u01-l1', 'hsk1-u01-l2', 'hsk1-u01-l3', 'hsk1-u01-l4', 'hsk1-u01-l5'].flatMap((id) => lessonFile(id).words));

    await page.goto('/learn');
    await page.getByRole('button', { name: 'Take the placement test' }).click();
    // Know unit 1, nothing after it.
    const progress = page.getByText(/^Unit \d+ of \d+$/);
    const result = page.getByRole('heading', { name: /^Start/ });
    for (let q = 0; q < 20; q++) {
      await expect(progress.or(result)).toBeVisible();
      if (await result.isVisible()) break;
      const unit = Number((await progress.textContent())!.match(/\d+/)![0]);
      if (unit === 1) {
        const shown = await page.locator('[lang="zh"]').first().textContent();
        expect(unit1.has(shown!)).toBe(true);
        await page.getByRole('radio', { name: meaningOf.get(shown!)!, exact: true }).click();
      } else {
        await page.getByRole('button', { name: "I don't know" }).click();
      }
    }
    await expect(page.getByRole('heading', { name: 'Start at Unit 2' })).toBeVisible();
    await page.getByRole('button', { name: /^Start: / }).click();
    await expect(page).toHaveURL(/\/lesson\?id=hsk1-u02-l1/);

    const { data: profile } = await client.from('profiles').select('start_lesson_id, placed_at').eq('id', userId).single();
    expect(profile).toMatchObject({ start_lesson_id: 'hsk1-u02-l1' });
    expect(profile!.placed_at).not.toBeNull();

    await page.goto('/learn');
    await expect(page.getByRole('link', { name: /^Lesson: .*, next$/ })).toHaveAccessibleName(/^Lesson: .*, next$/);
    await expect(page.getByText('Unit 2:', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /skipped by placement$/ }).first()).toBeVisible();
  });

  test('progress is private and only recorded through complete_lesson', async () => {
    const a = await createOnboardedUser('ProgA');
    const b = await createOnboardedUser('ProgB');
    expect((await a.client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 70 })).error).toBeNull();
    expect((await a.client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 50 })).error).toBeNull();
    const { data } = await a.client.from('lesson_progress').select('best_score, last_score, attempts').single();
    expect(data).toEqual({ best_score: 70, last_score: 50, attempts: 2 });

    expect((await b.client.from('lesson_progress').select('*').eq('user_id', a.userId)).data).toEqual([]);
    // No direct writes, no bad scores, no guests.
    expect((await b.client.from('lesson_progress').insert({ lesson_id: 'hsk1-u01-l1', best_score: 100, last_score: 100 })).error).not.toBeNull();
    expect((await b.client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 101 })).error).not.toBeNull();
    expect((await newClient().rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 100 })).error).not.toBeNull();
  });
});
