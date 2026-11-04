import { expect, test } from '@playwright/test';

test.describe('app shell (Phase 0)', () => {
  test('home shows HSK vocabulary counts from the database', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('words ready to learn')).toBeVisible();
    await expect(page.getByLabel(/^HSK 1: \d+ words$/)).toBeVisible();
    await expect(page.getByLabel(/^HSK 7–9: \d+ words$/)).toBeVisible();
  });

  test('every tab navigates and is marked selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    for (const [name, path, heading] of [
      ['Learn', '/learn', 'Learn'],
      ['Review', '/review', 'Review'],
      ['Dictionary', '/dictionary', 'Dictionary'],
      ['Profile', '/profile', 'Profile'],
    ] as const) {
      await page.getByRole('tab', { name }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('theme choice applies immediately and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/profile');
    // Heading text color from the theme tokens: light #16161A, dark #F4F3F0.
    const LIGHT_TEXT = 'rgb(22, 22, 26)';
    const DARK_TEXT = 'rgb(244, 243, 240)';
    const textColor = () =>
      page.getByRole('heading', { name: 'Profile', exact: true }).evaluate((el) => getComputedStyle(el).color);

    await expect.poll(textColor).toBe(LIGHT_TEXT);
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(textColor).toBe(DARK_TEXT);

    await page.reload();
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(textColor).toBe(DARK_TEXT);

    await page.getByRole('radio', { name: 'System' }).click();
    await expect.poll(textColor).toBe(LIGHT_TEXT);
  });

  test('is installable: manifest and icons are served', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
    const manifest = await (await request.get('/manifest.json')).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200);
    }
  });
});
