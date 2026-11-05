import { expect, test, type Page } from '@playwright/test';

import { createOnboardedUser, logIn, newClient } from './helpers';

const dayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Flips and grades cards until the session ends. Returns how many answers were given. */
async function reviewAll(page: Page, grade: (i: number) => 'Again' | 'Hard' | 'Good' | 'Easy') {
  const done = page.getByRole('heading', { name: /^(Review done!|Nothing to review)$/ });
  for (let i = 0; i < 60; i++) {
    const show = page.getByRole('button', { name: 'Show answer' });
    await expect(show.or(done)).toBeVisible();
    if (await done.isVisible()) return i;
    await show.click();
    await page.getByRole('button', { name: new RegExp(`^${grade(i)}, next review in `) }).click();
  }
  throw new Error('review session did not end');
}

test.describe('review (Phase 4)', () => {
  test('guests are asked to log in', async ({ page }) => {
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'Log in to review' })).toBeVisible();
  });

  test('words from a finished lesson come back for review and are scheduled', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Reviewer');
    // Finish lesson 1 through the API (the lesson UI is covered by lessons.spec.ts).
    expect((await client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 100 })).error).toBeNull();
    const { data: lesson } = await client.from('lessons').select('words').eq('id', 'hsk1-u01-l1').single();
    const words = lesson!.words.length;

    await logIn(page, email);
    await expect(page.getByText(new RegExp(`^${words} cards to review today`))).toBeVisible();
    await page.goto('/review');
    // One new card per word today (its other directions follow on later days).
    await expect(page.getByRole('heading', { name: `${words} cards to review` })).toBeVisible();
    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page).toHaveURL(/\/review-session\?deck=all/);

    // First card: Again (comes back in this session); the rest Good. New cards repeat once (learning step).
    const answers = await reviewAll(page, (i) => (i === 0 ? 'Again' : 'Good'));
    expect(answers).toBeGreaterThan(words);
    await expect(page.getByText(new RegExp(`^${words} cards · remembered ${words - 1} · again 1$`))).toBeVisible();

    await expect(page.getByRole('status')).toHaveText('All answers saved.');
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: 'All caught up! 🎉' })).toBeVisible();

    // Every answer is logged, every card was scheduled into the future, and the miss is in the notebook.
    const { count } = await client.from('review_log').select('*', { count: 'exact', head: true });
    expect(count).toBe(answers);
    const { data: seen } = await client.from('review_cards').select('due_at, reps').gt('reps', 0);
    expect(seen).toHaveLength(words);
    for (const c of seen!) expect(new Date(c.due_at).getTime()).toBeGreaterThan(Date.now());
    const { data: notebook } = await client.rpc('mistake_notebook');
    expect(notebook).toHaveLength(1);
  });

  test('repeatedly missed words are flagged as weak and can be practised', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Weak');
    for (let i = 0; i < 3; i++) {
      const r = await client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 50, p_missed: ['你'] });
      expect(r.error).toBeNull();
    }
    const { data: summary } = await client.rpc('review_summary', { p_day_start: dayStart() }).single();
    expect(summary).toMatchObject({ weak: 1 });

    await logIn(page, email);
    await page.goto('/mistakes');
    await expect(page.getByRole('heading', { name: 'Weak words' })).toBeVisible();
    await expect(page.getByRole('link', { name: /missed 3 times, weak word$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Practise weak words' }).click();
    await expect(page).toHaveURL(/deck=weak/);
    // All three directions of 你 are practised, due or not.
    expect(await reviewAll(page, () => 'Easy')).toBe(3);
  });

  test('custom cards and example sentences can be added and reviewed', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Maker');
    await logIn(page, email);

    await page.goto('/my-cards');
    await page.getByLabel('Front', { exact: true }).fill('加油');
    await page.getByLabel('Back', { exact: true }).fill('Come on! You can do it!');
    await expect(page.getByText('The front (加油) will be read aloud.')).toBeVisible();
    await page.getByRole('button', { name: 'Add card' }).click();
    await expect(page.getByRole('status')).toHaveText('Card added to your review.');
    await expect(page.getByRole('heading', { name: '1 card' })).toBeVisible();

    await page.goto('/word?w=学生');
    await page.getByRole('button', { name: 'Add sentence to review' }).first().click();
    await expect(page.getByText('✓ In your review').first()).toBeVisible();
    const { data: sentenceCards } = await client.from('review_cards').select('direction').eq('kind', 'sentence');
    expect(sentenceCards!.map((c) => c.direction).sort()).toEqual(['listen', 'read']);

    await page.goto('/review-session?deck=custom');
    await expect(page.getByText('加油')).toBeVisible();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(page.getByText('Come on! You can do it!')).toBeVisible();
    await page.getByRole('button', { name: /^Easy, next review in \d+(d|mo)$/ }).click();
    await expect(page.getByRole('heading', { name: 'Review done!' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('All answers saved.');

    // Deleting the card removes it from review.
    await page.goto('/my-cards');
    await page.getByRole('button', { name: 'Delete 加油' }).click();
    await page.getByRole('button', { name: 'Delete card' }).click();
    await expect(page.getByRole('heading', { name: '1 card' })).toBeHidden();
    const { count } = await client.from('review_cards').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBe(0);
  });

  test('saving a word adds it; the new-card limit applies; review data is private', async () => {
    const a = await createOnboardedUser('RevA');
    const b = await createOnboardedUser('RevB');

    expect((await a.client.from('saved_words').insert({ user_id: a.userId, word: '电脑' })).error).toBeNull();
    const { data: cards } = await a.client.from('review_cards').select('word, direction, source').order('direction');
    expect(cards).toEqual([
      { word: '电脑', direction: 'listen', source: 'saved' },
      { word: '电脑', direction: 'read', source: 'saved' },
      { word: '电脑', direction: 'recall', source: 'saved' },
    ]);

    // Limit: 5 new cards a day.
    expect((await a.client.from('profiles').update({ new_cards_per_day: 5 }).eq('id', a.userId)).error).toBeNull();
    for (const id of ['hsk1-u01-l1', 'hsk1-u01-l2']) {
      expect((await a.client.rpc('complete_lesson', { p_lesson_id: id, p_score: 100 })).error).toBeNull();
    }
    const { data: queue } = await a.client.rpc('review_queue', { p_day_start: dayStart(), p_deck: 'all' });
    expect(queue).toHaveLength(5);

    // B can't see, add, schedule or forge A's review data.
    const card = queue![0] as { id: string };
    expect((await b.client.from('review_cards').select('id').eq('id', card.id)).data).toEqual([]);
    const forged = await b.client.rpc('record_review', { p_card_id: card.id, p_rating: 3, p_card: {} });
    expect(forged.error).not.toBeNull();
    expect((await b.client.from('review_cards').insert({ user_id: b.userId, kind: 'word', direction: 'read', word: '我', source: 'saved' })).error).not.toBeNull();
    expect((await b.client.from('mistakes').insert({ user_id: b.userId, word: '我', source: 'review' })).error).not.toBeNull();
    expect((await b.client.from('review_cards').update({ due_at: new Date().toISOString() }).eq('user_id', b.userId)).error).not.toBeNull();
    expect((await newClient().rpc('review_queue', { p_day_start: dayStart() })).error).not.toBeNull();
    // Ratings outside 1–4 are refused.
    expect((await a.client.rpc('record_review', { p_card_id: card.id, p_rating: 7, p_card: {} })).error).not.toBeNull();
  });
});
