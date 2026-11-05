import { expect, test, type Page } from '@playwright/test';

import { LOOK_ALIKES } from '../src/constants/look-alikes';
import { createOnboardedUser, logIn, newClient } from './helpers';

type Medians = number[][][];

async function mediansOf(character: string): Promise<Medians> {
  const { data, error } = await newClient().from('characters').select('medians').eq('character', character).single();
  if (error) throw error;
  return data.medians as Medians;
}

/** Draws one stroke on the writing pad along a median (character coordinates, y up). */
async function drawStroke(page: Page, median: number[][], { reverse = false } = {}) {
  const pad = page.getByTestId('writing-surface');
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  const pts = reverse ? [...median].reverse() : median;
  const at = ([x, y]: number[]) => ({ x: box.x + (x / 1024) * box.width, y: box.y + ((900 - y) / 1024) * box.height });
  const start = at(pts[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    const { x, y } = at(p);
    await page.mouse.move(x, y, { steps: 6 });
  }
  await page.mouse.up();
}

const status = (page: Page) => page.getByRole('status').filter({ hasText: /stroke|Done|Hint|Try again/ });

test.describe('characters (Phase 5)', () => {
  test('a character page shows stroke order, parts and origin; word pages link to it', async ({ page }) => {
    await page.goto('/word?w=你好');
    await page.getByRole('link', { name: 'Character 好' }).click();
    await expect(page).toHaveURL(/\/character\?c=/);
    await expect(page.getByRole('img', { name: 'Stroke order of 好: 6 strokes' })).toBeVisible();
    await expect(page.getByText('An idea: A woman 女 with a son 子.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Character 子' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^好看, hǎo kàn/ })).toBeVisible(); // words using it
    // The animation finishes on its own; Next stroke steps through.
    await expect(page.getByText('Stroke 6 of 6')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Next stroke' }).click();
    await expect(page.getByText('Stroke 1 of 6')).toBeVisible();
  });

  test('handwriting: strokes are checked for order and direction, with a hint after 3 misses', async ({ page }) => {
    const medians = await mediansOf('十');
    await page.goto('/character?c=十');
    await expect(page.getByRole('img', { name: /^Writing pad for 十/ })).toBeVisible();

    await drawStroke(page, medians[1]); // the vertical stroke first: wrong order
    await expect(status(page)).toHaveText('Not stroke 1. Try again.');
    await drawStroke(page, medians[0], { reverse: true }); // right to left: wrong direction
    await expect(status(page)).toHaveText('Right stroke, wrong direction. Try again.');
    await drawStroke(page, medians[1]);
    await expect(status(page)).toHaveText('Here is stroke 1. Try again.');

    await drawStroke(page, medians[0]);
    await expect(status(page)).toHaveText('Good. Draw stroke 2 of 2.');
    await drawStroke(page, medians[1]);
    await expect(status(page)).toHaveText('Done! 3 misses.');
    await expect(page.getByText('Finished with 3 misses and a hint.')).toBeVisible();

    // Next mode: write without the outline, perfectly this time.
    await page.getByRole('button', { name: 'Next: write it' }).click();
    await expect(page.getByRole('radio', { name: 'Write' })).toHaveAttribute('aria-checked', 'true');
    for (const m of medians) await drawStroke(page, m);
    await expect(page.getByText('Perfect! No mistakes.')).toBeVisible();
  });

  test('writing joins review only when added, and is graded by the pad', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Writer');
    const medians = await mediansOf('十');
    await logIn(page, email);
    await page.goto('/character?c=十');
    await page.getByRole('button', { name: 'Add writing to review' }).click();
    await expect(page.getByText('✓ Writing 十 is in your review.')).toBeVisible();

    await page.goto('/review-session?deck=writing');
    await expect(page.getByText(/^NEW · WRITE IT$/)).toBeVisible();
    for (const m of medians) await drawStroke(page, m);
    await expect(page.getByText('十 · No mistakes: Good.')).toBeVisible();
    // A new card's first Good is the 10-minute learning step, so it comes back once more.
    await page.getByRole('button', { name: /^Continue · Good, next in 10m$/ }).click();
    await expect(page.getByText(/^AGAIN · WRITE IT$/)).toBeVisible();
    await page.getByRole('button', { name: "I don't remember" }).click();
    await expect(page.getByRole('img', { name: 'Stroke order of 十: 2 strokes' })).toBeVisible();
    await page.getByRole('button', { name: /^Continue · Again, next in \d+m$/ }).click();
    // Relearning: written correctly until it graduates.
    const done = page.getByRole('heading', { name: 'Review done!' });
    for (let i = 0; i < 4 && !(await done.isVisible()); i++) {
      await expect(page.getByText(/^AGAIN · WRITE IT$/)).toBeVisible();
      for (const m of medians) await drawStroke(page, m);
      await page.getByRole('button', { name: /^Continue · Good, / }).click();
      await expect(page.getByText(/^AGAIN · WRITE IT$/).or(done)).toBeVisible();
    }
    await expect(done).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('All answers saved.');

    // "Again" put 十 in the mistake notebook; removing the card works.
    const { data: notebook } = await client.rpc('mistake_notebook');
    expect(notebook!.map((n: { word: string }) => n.word)).toEqual(['十']);
    expect((await client.rpc('remove_writing_card', { p_character: '十' })).error).toBeNull();
    const { count } = await client.from('review_cards').select('*', { count: 'exact', head: true }).eq('kind', 'character');
    expect(count).toBe(0);
  });

  test('characters hub and quizzes', async ({ page }) => {
    await page.goto('/learn');
    await page.getByRole('button', { name: 'Open characters' }).click();
    await expect(page.getByRole('heading', { name: /^HSK 1: \d+ new characters$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Character 一, yī/ })).toBeVisible();

    await page.getByRole('button', { name: 'Recognition quiz · HSK 1' }).click();
    for (let i = 0; i < 10; i++) {
      await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
      await page.getByRole('radio').first().click();
      await expect(page.getByRole('alert')).toHaveText(/^(Correct!|It's .)$/);
      await page.getByRole('button', { name: i < 9 ? 'Next' : 'See result' }).click();
    }
    await expect(page.getByRole('status')).toHaveText(/^\d+ of 10 right$/);

    await page.goto('/character-quiz?mode=lookalike');
    await expect(page.getByText('Question 1 of 10')).toBeVisible();
    expect(await page.getByRole('radio').count()).toBeGreaterThanOrEqual(2);

    await page.goto('/character-quiz?mode=write&level=1');
    await expect(page.getByText('Character 1 of 10')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Writing pad for the character/ })).toBeVisible();
  });

  test('character data: look-alikes exist, data is read-only, writing cards are private', async () => {
    const anon = newClient();
    const all = [...new Set(LOOK_ALIKES.flat())];
    const { data } = await anon.from('characters').select('character').in('character', all);
    expect(new Set(data!.map((r) => r.character))).toEqual(new Set(all));

    expect((await anon.from('characters').update({ definition: 'x' }).eq('character', '一')).error).not.toBeNull();
    const a = await createOnboardedUser('CharA');
    expect((await a.client.from('characters').insert({ character: '㐀', strokes: [], medians: [], stroke_count: 0 })).error).not.toBeNull();
    expect((await a.client.rpc('add_writing_card', { p_character: 'A' })).error).not.toBeNull();
    expect((await anon.rpc('add_writing_card', { p_character: '十' })).error).not.toBeNull();
  });
});
