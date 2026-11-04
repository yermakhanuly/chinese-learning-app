import { expect, test, type Page } from '@playwright/test';

import { createOnboardedUser, logIn, newClient } from './helpers';

/** Clicks Save/Remove and waits until the server has stored it (a page load would cancel it). */
async function toggleSave(page: Page, name: 'Save word' | 'Remove from saved words') {
  const stored = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/saved_words') && r.request().method() !== 'GET',
  );
  await page.getByRole('button', { name }).click();
  expect((await stored).ok()).toBe(true);
}

async function search(page: Page, text: string) {
  await page.goto('/dictionary');
  await page.getByRole('searchbox', { name: 'Search the dictionary' }).fill(text);
}

/** Result rows are links labelled "characters, pinyin: meaning". */
const result = (page: Page, chars: string) => page.getByRole('link', { name: new RegExp(`^${chars}, `) });

test.describe('dictionary (Phase 2)', () => {
  test('finds words by English, pinyin with or without tones, and traditional characters', async ({ page }) => {
    await search(page, 'love');
    await expect(result(page, '爱').first()).toBeVisible();
    await expect(page).toHaveURL(/q=love/);

    for (const query of ['xuexi', 'xué xí', 'xue2xi2', '學習']) {
      await page.getByRole('searchbox').fill(query);
      await expect(page.getByRole('list').getByRole('link').first()).toHaveAccessibleName(/^学习, xué xí/);
    }

    await page.getByRole('searchbox').fill('qwrtzz');
    await expect(page.getByRole('heading', { name: 'No results for “qwrtzz”' })).toBeVisible();
  });

  test('a word page shows pinyin, level, meanings and example sentences; words in sentences link on', async ({
    page,
  }) => {
    await page.goto('/word?w=学习');
    await expect(page.getByText('xué xí').first()).toBeVisible();
    await expect(page.getByText('HSK 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Meaning' })).toBeVisible();
    await expect(page.getByText('Traditional: 學習')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play 学习' })).toBeVisible();

    const examples = page.getByRole('link', { name: /^Tatoeba #\d+$/ });
    await expect(examples.first()).toBeVisible();
    expect(await examples.count()).toBeGreaterThanOrEqual(1);

    // Tap another word inside the first example sentence.
    const wordLink = page.getByRole('link', { name: /^[一-鿿]+, \S+$/ }).first();
    const name = (await wordLink.getAttribute('aria-label'))!.split(',')[0];
    await wordLink.click();
    await expect(page).toHaveURL(new RegExp(`/word\\?w=${encodeURIComponent(name)}$`));
  });

  test('words outside the HSK lists come from CC-CEDICT', async ({ page }) => {
    await page.goto('/word?w=你好');
    await expect(page.getByText('Not HSK')).toBeVisible();
    await expect(page.getByText('hello', { exact: false }).first()).toBeVisible();
  });

  test('browse by HSK level, filter, and load more while scrolling', async ({ page }) => {
    await page.goto('/dictionary');
    await page.getByRole('link', { name: /^HSK 2, 197 words$/ }).click();
    await expect(page).toHaveURL(/\/words\?level=2/);
    await expect(page.getByRole('radio', { name: 'HSK 2' })).toHaveAttribute('aria-checked', 'true');
    const rows = page.getByRole('link', { name: /^[一-鿿]+, / });
    await expect(rows.first()).toBeVisible();
    await expect.poll(() => rows.count()).toBe(50);

    await rows.nth(49).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => rows.count()).toBeGreaterThan(50);

    await page.getByRole('radio', { name: 'HSK 1' }).click();
    await expect(page).toHaveURL(/level=1/);

    // Opening a filtered list directly (shared link / reload) marks the right filter.
    await page.goto('/words?level=3');
    await expect(page.getByRole('radio', { name: 'HSK 3' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'All levels' })).toHaveAttribute('aria-checked', 'false');
  });

  test('a search link opens with the query filled in and results shown', async ({ page }) => {
    await page.goto('/dictionary?q=bank');
    await expect(page.getByRole('searchbox')).toHaveValue('bank');
    await expect(result(page, '银行').first()).toBeVisible();
  });

  test('pinyin can be hidden and the Hanzi size changed; both stick after a reload', async ({ page }) => {
    await page.goto('/word?w=学习');
    await expect(page.getByText('xué xí').first()).toBeVisible();
    await page.getByRole('switch', { name: 'Show pinyin' }).click();
    await expect(page.getByText('xué xí')).toHaveCount(0);

    await page.goto('/profile');
    await page.getByRole('radio', { name: 'XL' }).click();
    await page.goto('/word?w=学习');
    await expect(page.getByRole('button', { name: 'Play 学习' })).toBeVisible();
    await expect(page.getByText('xué xí')).toHaveCount(0);
    // The large characters at the top of the page (the header title is also 学习, but small).
    const sizes = await page
      .getByText('学习', { exact: true })
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(Math.max(...sizes)).toBe(96); // 64 × 1.5
  });

  test('home search opens the dictionary with results', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search the dictionary' }).fill('bank');
    await page.getByRole('searchbox', { name: 'Search the dictionary' }).press('Enter');
    await expect(page).toHaveURL(/\/dictionary\?q=bank/);
    await expect(result(page, '银行').first()).toBeVisible();
  });
});

test.describe('saved words (Phase 2)', () => {
  test('guests are asked to log in; learners save and unsave words', async ({ page }) => {
    await page.goto('/word?w=银行');
    await page.getByRole('button', { name: 'Save word' }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    const { email } = await createOnboardedUser('Saver');
    await logIn(page, email);
    await page.goto('/word?w=银行');
    await toggleSave(page, 'Save word');
    await expect(page.getByRole('button', { name: 'Remove from saved words' })).toHaveAttribute('aria-pressed', 'true');
    // A non-HSK dictionary entry can be saved too.
    await page.goto('/word?w=你好');
    await toggleSave(page, 'Save word');
    await expect(page.getByRole('button', { name: 'Remove from saved words' })).toBeVisible();

    await page.goto('/saved');
    await expect(page.getByText('2 words')).toBeVisible();
    await expect(result(page, '你好')).toBeVisible();
    await expect(result(page, '银行')).toBeVisible();

    // Survives a reload (stored in the account), and can be removed.
    await page.reload();
    await expect(page.getByText('2 words')).toBeVisible();
    await result(page, '银行').click();
    await toggleSave(page, 'Remove from saved words');
    await expect(page.getByRole('button', { name: 'Save word' })).toBeVisible();
    await page.goto('/saved');
    await expect(page.getByText('1 word', { exact: true })).toBeVisible();
  });

  test('a learner cannot see or change another learner’s saved words', async () => {
    const a = await createOnboardedUser('SavedA');
    const b = await createOnboardedUser('SavedB');
    expect((await a.client.from('saved_words').insert({ word: '爱' })).error).toBeNull();
    const { data } = await b.client.from('saved_words').select('*').eq('user_id', a.userId);
    expect(data).toEqual([]);
    // Can't save into someone else's list, or delete from it.
    expect((await b.client.from('saved_words').insert({ user_id: a.userId, word: '好' })).error).not.toBeNull();
    await b.client.from('saved_words').delete().eq('user_id', a.userId);
    expect((await a.client.from('saved_words').select('word')).data).toEqual([{ word: '爱' }]);
    // Guests can't read the table at all.
    expect((await newClient().from('saved_words').select('*')).data ?? []).toEqual([]);
  });
});
