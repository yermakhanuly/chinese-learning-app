import { expect, test } from '@playwright/test';

import { PASSWORD, createOnboardedUser, latestCode, logIn, newClient, uniqueEmail } from './helpers';

test.describe('accounts & onboarding (Phase 1)', () => {
  test('sign up, finish onboarding, then the profile is saved', async ({ page }) => {
    const email = uniqueEmail('signup');
    await page.goto('/');
    await page.getByRole('button', { name: 'Create account' }).first().click();
    await expect(page).toHaveURL(/\/sign-up$/);

    // Validation runs before anything is sent.
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText('Tell us what to call you.');

    await page.getByLabel('Name', { exact: true }).fill('Mei');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText(/at least 8 characters/);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Onboarding opens automatically for a new account; the name from sign-up is prefilled.
    await expect(page.getByRole('heading', { name: 'Welcome! 欢迎' })).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('Mei');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('button', { name: 'Continue' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('radio', { name: 'HSK exam' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: 'Elementary' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /^30 XP/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: 'Traditional' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Tutorial: four slides.
    await expect(page.getByRole('heading', { name: 'Quick tour' })).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Start learning' }).click();

    await expect(page.getByRole('heading', { name: '你好, Mei!' })).toBeVisible();
    await expect(page.getByText('HSK exam')).toBeVisible();
    await expect(page.getByText('Daily goal: 30 XP a day.', { exact: false })).toBeVisible();

    // Session and profile survive a reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: '你好, Mei!' })).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByRole('radio', { name: 'Traditional' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'Elementary' })).toHaveAttribute('aria-checked', 'true');
  });

  test('settings changed on one device show up on another', async ({ browser }) => {
    const { email } = await createOnboardedUser('Sync');
    const phone = await (await browser.newContext()).newPage();
    const laptop = await (await browser.newContext()).newPage();
    await logIn(phone, email);
    await logIn(laptop, email);

    await phone.goto('/profile');
    await phone.getByRole('radio', { name: /^50 XP/ }).click();
    await expect(phone.getByRole('radio', { name: /^50 XP/ })).toHaveAttribute('aria-checked', 'true');
    await phone.getByLabel('Name', { exact: true }).fill('Sync Renamed');
    await phone.getByLabel('Name', { exact: true }).press('Enter');
    await expect(phone.getByText('Saved ✓')).toBeVisible();

    await laptop.reload();
    await expect(laptop.getByRole('heading', { name: '你好, Sync Renamed!' })).toBeVisible();
    await expect(laptop.getByText('Daily goal: 50 XP a day.', { exact: false })).toBeVisible();
  });

  test('log out and log back in; wrong password is explained', async ({ page }) => {
    const { email } = await createOnboardedUser('Relog');
    await logIn(page, email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();

    await page.goto('/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
    await logIn(page, email);
  });

  test('reset a forgotten password with an emailed code', async ({ page }) => {
    const { email } = await createOnboardedUser('Reset');
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText(`Code sent to ${email}.`)).toBeVisible();

    await page.getByLabel('Code', { exact: true }).fill(await latestCode(email));
    await page.getByLabel('New password', { exact: true }).fill('brand-new-pass-1');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByRole('heading', { name: /^你好, / })).toBeVisible();

    const old = await newClient().auth.signInWithPassword({ email, password: PASSWORD });
    expect(old.error?.message).toMatch(/Invalid login credentials/);
    const fresh = await newClient().auth.signInWithPassword({ email, password: 'brand-new-pass-1' });
    expect(fresh.error).toBeNull();
  });

  test('delete account removes the user for good', async ({ page }) => {
    const { email } = await createOnboardedUser('Delete');
    await logIn(page, email);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByText('It cannot be undone.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, delete permanently' }).click();
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();

    const again = await newClient().auth.signInWithPassword({ email, password: PASSWORD });
    expect(again.error?.message).toMatch(/Invalid login credentials/);
  });
});

test.describe('data privacy (row-level security)', () => {
  test('a learner cannot read or change another learner’s profile', async () => {
    const a = await createOnboardedUser('Alice');
    const b = await createOnboardedUser('Bob');
    const read = await a.client.from('profiles').select('id').eq('id', b.userId);
    expect(read.data).toEqual([]);
    const write = await a.client.from('profiles').update({ display_name: 'hacked' }).eq('id', b.userId).select();
    expect(write.data).toEqual([]);
    const anon = await newClient().from('profiles').select('id');
    expect(anon.data ?? []).toEqual([]);
  });
});
