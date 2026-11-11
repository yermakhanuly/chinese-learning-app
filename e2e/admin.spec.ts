import { expect, test, type Page } from '@playwright/test';

import { adminClient, createOnboardedUser, logIn } from './helpers';

/**
 * Phase 10: admin dashboard, problem reports, error log, payments, offline sync.
 * The `admin` and `billing` Edge Functions are replaced by stand-ins (no Stripe account, no Azure);
 * the real functions are checked by scripts/check-admin.ts and scripts/check-billing.ts.
 */
async function adminLearner(page: Page, name: string) {
  const user = await createOnboardedUser(name);
  const { error } = await adminClient().from('profiles').update({ is_admin: true }).eq('id', user.userId);
  if (error) throw error;
  await logIn(page, user.email);
  return user;
}

test.describe('admin, reports, payments, offline (Phase 10)', () => {
  test('only admins see the dashboard; learners cannot make themselves admin', async ({ page }) => {
    const { email, client, userId } = await createOnboardedUser('NotAdmin');
    expect((await client.from('profiles').update({ is_admin: true }).eq('id', userId)).error).not.toBeNull();
    expect((await client.rpc('admin_overview')).error).not.toBeNull();
    expect((await client.rpc('admin_set_premium', { p_user: userId, p_until: '2099-01-01' })).error).not.toBeNull();
    expect((await client.from('content_drafts').insert({ kind: 'word', ref_id: '水', data: {}, created_by: userId })).error).not.toBeNull();
    await logIn(page, email);
    await page.goto('/admin');
    await expect(page.getByText('Page not found')).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: 'Open the admin dashboard' })).toHaveCount(0);
  });

  test('admin: overview, learners and switching Premium on', async ({ page }) => {
    const other = await createOnboardedUser(`Pupil${Math.random().toString(36).slice(2, 7)}`);
    await adminLearner(page, 'Boss');
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Open the admin dashboard' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('learners', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Learners' }).click();
    await page.getByLabel('Search by email or name').fill(other.email);
    const row = page.getByRole('listitem', { name: other.email });
    await expect(row).toContainText('Manual Premium: off');
    await row.getByRole('button', { name: 'Premium 30 days' }).click();
    await expect(row).toContainText('Manual Premium: until');
    const { data } = await other.client.rpc('my_premium');
    expect(data.premium).toBe(true);
  });

  test('admin: edit content as a draft, check, review, publish', async ({ page }) => {
    const { userId } = await adminLearner(page, 'Editor');
    const db = adminClient();
    const sent: Record<string, unknown>[] = [];
    // Stand-in for the admin function: the first check finds a problem; publishing marks the draft.
    await page.route('**/functions/v1/admin', async (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      const { data: draft } = await db.from('content_drafts').select('data').eq('id', body.draft_id).single();
      const row = { ...(draft!.data as object), readings: { '是': [{ s: '是', t: '是', p: 'shì' }] } };
      if (body.action === 'check' || (body.action === 'publish' && !body.accept_problems)) {
        return route.fulfill({ json: { problems: ['"我是很忙" uses words above HSK 1: 很忙'], row, published: false } });
      }
      await db.from('content_drafts').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', body.draft_id);
      return route.fulfill({ json: { problems: [], row, published: true } });
    });
    await page.goto('/admin-content?kind=grammar');
    await page.getByLabel('Filter by id or title').fill('g1-shi');
    await page.getByRole('link', { name: /^g1-shi · / }).click();
    await expect(page).toHaveURL(/\/admin-edit\?kind=grammar&id=g1-shi/);
    const editor = page.getByLabel('Content (JSON)');
    const json = JSON.parse(await editor.inputValue());
    expect(json).toMatchObject({ id: 'g1-shi', level: 1 });
    await editor.fill(JSON.stringify({ ...json, summary: 'Edited in the dashboard.' }, null, 2));
    await expect(page.getByText('Changed: summary')).toBeVisible();

    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('list', { name: 'Problems' })).toContainText('很忙');
    const { data: drafts } = await db.from('content_drafts').select('status, created_by, data').eq('ref_id', 'g1-shi').eq('status', 'draft');
    expect(drafts).toHaveLength(1);
    expect(drafts![0]).toMatchObject({ created_by: userId, data: { summary: 'Edited in the dashboard.' } });

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Publish anyway' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish anyway' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
    expect(sent.map((s) => `${s.action}${s.accept_problems ? '!' : ''}`)).toEqual(['check', 'publish', 'publish!']);
    // Clean up: the live grammar point was never touched (the stand-in doesn't write it).
    await db.from('content_drafts').delete().eq('ref_id', 'g1-shi');

    // The JSON is checked before anything is sent.
    await page.goto('/admin-edit?kind=unit&id=hsk1-u01');
    await page.getByLabel('Content (JSON)').fill('{ "id": ');
    await expect(page.getByRole('alert').filter({ hasText: 'Not valid JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  test('learners report problems; admins resolve them; app errors are logged', async ({ browser }) => {
    const learnerPage = await browser.newPage();
    const learner = await createOnboardedUser('Reporter');
    await logIn(learnerPage, learner.email);
    await learnerPage.goto('/word?w=水');
    await learnerPage.getByRole('link', { name: '⚑ Report a problem' }).click();
    await expect(learnerPage).toHaveURL(/\/report\?kind=word&ref=/);
    await learnerPage.getByRole('radio', { name: /Audio problem/ }).click();
    const message = `The audio cuts off ${Date.now()}`;
    await learnerPage.getByLabel('Tell us more').fill(message);
    await learnerPage.getByRole('button', { name: 'Send report' }).click();
    await expect(learnerPage.getByText('Thank you!')).toBeVisible();
    // An unexpected error in the app is sent to the error log.
    const boom = `e2e boom ${Date.now()}`;
    await learnerPage.evaluate((m) => void Promise.reject(new Error(m)), boom);
    await expect.poll(async () => (await adminClient().from('client_errors').select('message').eq('message', boom)).data?.length).toBe(1);
    // Learners only see their own reports.
    const other = await createOnboardedUser('Nosy');
    expect((await other.client.from('reports').select('id')).data).toEqual([]);
    await learnerPage.close();

    const page = await browser.newPage();
    await adminLearner(page, 'Triage');
    await page.goto('/admin-reports');
    const card = page.getByRole('listitem', { name: `Report: ${message}` });
    await expect(card).toContainText('水');
    await expect(card).toContainText('audio');
    await card.getByLabel('Note').fill('Clip regenerated.');
    await card.getByRole('button', { name: 'Resolved' }).click();
    await expect(card).toHaveCount(0);
    const { data } = await learner.client.from('reports').select('status, admin_note').eq('message', message).single();
    expect(data).toEqual({ status: 'resolved', admin_note: 'Clip regenerated.' });
    await page.goto('/admin-errors');
    await expect(page.getByText(boom)).toBeVisible();
    await page.close();
  });

  test('Premium on the web: plans with a trial, Stripe checkout, back with Premium, manage', async ({ page }) => {
    const { userId } = await (async () => {
      const u = await createOnboardedUser('Buyer');
      await logIn(page, u.email);
      return u;
    })();
    const sent: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/billing', async (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      if (body.action === 'plans') {
        return route.fulfill({
          json: { trial_days: 7, plans: [{ plan: 'monthly', amount: 799, currency: 'usd', interval: 'month' }, { plan: 'yearly', amount: 5999, currency: 'usd', interval: 'year' }] },
        });
      }
      return route.fulfill({ json: { url: `https://stripe.test/${body.action}` } });
    });
    await page.route('https://stripe.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe</h1>' }));

    await page.goto('/premium');
    await expect(page.getByText('Try it free for 7 days')).toBeVisible();
    await page.getByRole('button', { name: 'Yearly · $59.99 / year (save 37%)' }).click();
    await expect(page).toHaveURL('https://stripe.test/checkout');
    expect(sent.find((s) => s.action === 'checkout')).toMatchObject({ plan: 'yearly', return_url: expect.stringMatching(/\/premium$/) });

    // Stripe's webhook would write this; then Stripe sends the learner back.
    const end = new Date(Date.now() + 7 * 86400e3).toISOString();
    await adminClient().from('subscriptions').insert({ user_id: userId, stripe_customer_id: `cus_${Date.now()}`, stripe_subscription_id: `sub_${Date.now()}`, plan: 'yearly', status: 'trialing', current_period_end: end, trial_end: end });
    await page.goto('/premium?checkout=success');
    await expect(page.getByText('✓ You have Premium')).toBeVisible();
    await expect(page.getByText(/^Yearly plan · Free trial until/)).toBeVisible();
    await page.getByRole('button', { name: 'Manage or cancel' }).click();
    await expect(page).toHaveURL('https://stripe.test/portal');
    // The AI tutor is unlocked by the subscription.
    await page.goto('/tutor');
    await expect(page.getByRole('button', { name: 'Ask a question' })).toBeVisible();
  });

  test('offline: answers given without a connection are kept and sent later with their time', async ({ page, context }) => {
    const { email, client } = await createOnboardedUser('Flyer');
    expect((await client.rpc('complete_lesson', { p_lesson_id: 'hsk1-u01-l1', p_score: 100 })).error).toBeNull();
    await logIn(page, email);
    await page.goto('/review-session?deck=all');
    await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();

    await context.setOffline(true);
    const answeredAt = Date.now();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Good, next review in / }).click();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Easy, next review in / }).click();
    expect((await client.from('review_log').select('id')).data ?? []).toHaveLength(0); // (this request goes through Node, not the page)
    const waiting = await page.evaluate(() => JSON.parse(localStorage.getItem('offline:outbox') ?? '[]').length);
    expect(waiting).toBe(2);

    await page.waitForTimeout(1500); // the answers will be sent later than they were given
    await context.setOffline(false);
    await expect.poll(async () => (await client.from('review_log').select('reviewed_at')).data?.length, { timeout: 15_000 }).toBe(2);
    const { data: log } = await client.from('review_log').select('reviewed_at');
    for (const r of log!) expect(Math.abs(new Date(r.reviewed_at).getTime() - answeredAt)).toBeLessThan(1500);
    expect(await page.evaluate(() => localStorage.getItem('offline:outbox'))).toBeNull();
    const { data: xp } = await client.from('activity').select('kind').eq('kind', 'review');
    expect(xp).toHaveLength(2);
  });
});
