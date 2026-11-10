import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import type { MockTest } from '../src/lib/mock-test';
import { createOnboardedUser, logIn, newClient } from './helpers';

const mock = (level: number): MockTest =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'mock', `hsk${level}.json`), 'utf8'));

test.describe('progress (Phase 8)', () => {
  test('XP comes from saved work; the dashboard, Home and celebrations show it', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Progress');
    await logIn(page, email);
    // Home starts at zero (and this device records that baseline).
    await expect(page.getByLabel('Today: 0 of 20 XP')).toBeVisible();

    expect((await client.rpc('complete_grammar', { p_grammar_id: 'g1-shi', p_score: 90, p_missed: [] })).error).toBeNull(); // 8 + 2
    expect((await client.rpc('complete_reading', { p_text_id: 'r1-01', p_score: 75 })).error).toBeNull(); // 10 + 3
    expect((await client.rpc('complete_quiz', { p_kind: 'tones', p_ref: 'syllable', p_correct: 7, p_total: 10 })).error).toBeNull(); // 7
    const { data: rows } = await client.from('activity').select('kind, xp').order('id');
    expect(rows).toEqual([
      { kind: 'grammar', xp: 10 },
      { kind: 'reading', xp: 13 },
      { kind: 'tones', xp: 7 },
    ]);

    await page.reload();
    // 30 XP: the daily goal (20) and level 2 (25 XP) are celebrated once.
    const dialog = page.getByRole('dialog', { name: 'Celebration' });
    await expect(dialog).toContainText('Daily goal reached!');
    await expect(dialog).toContainText('Level 2!');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Today: 30 of 20 XP')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Daily goal reached' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Today: 30 of 20 XP')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Celebration' })).toHaveCount(0);

    await page.getByRole('button', { name: 'See your progress' }).click();
    await expect(page).toHaveURL(/\/progress/);
    await expect(page.getByRole('heading', { name: 'Level 2' })).toBeVisible();
    await expect(page.getByText('30 XP in total')).toBeVisible();
    await expect(page.getByLabel('day streak: 🔥 1, best 1')).toBeVisible();
    await expect(page.getByRole('listitem', { name: /^Reach your goal of 20 XP: 20 of 20, done$/ })).toBeVisible();
    await expect(page.getByLabel(/: 30 XP$/)).toBeVisible(); // today's calendar cell
    await expect(page.getByRole('listitem', { name: /^Grammar: .*, average best score$/ })).toHaveCount(0); // skill rows are plain
    await expect(page.getByText('1 points practised, average best score')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Badges · \d+ of 20$/ })).toBeVisible();
    await expect(page.getByText('🧩 Grammar · 90%')).toBeVisible(); // history
  });

  test('XP cannot be faked: no direct writes, quiz results are checked and capped', async () => {
    const a = await createOnboardedUser('XpA');
    const b = await createOnboardedUser('XpB');
    expect((await a.client.from('activity').insert({ user_id: a.userId, kind: 'lesson', xp: 100, seconds: 0 })).error).not.toBeNull();
    expect((await a.client.rpc('complete_quiz', { p_kind: 'lesson', p_ref: 'x', p_correct: 1, p_total: 1 })).error).not.toBeNull();
    expect((await a.client.rpc('complete_quiz', { p_kind: 'tones', p_ref: 'x', p_correct: 30, p_total: 30 })).error).not.toBeNull();
    expect((await a.client.rpc('complete_quiz', { p_kind: 'tones', p_ref: 'x', p_correct: 5, p_total: 4 })).error).not.toBeNull();
    expect((await newClient().rpc('complete_quiz', { p_kind: 'tones', p_ref: 'x', p_correct: 1, p_total: 1 })).error).not.toBeNull();
    for (let i = 0; i < 41; i++) await a.client.rpc('complete_quiz', { p_kind: 'listening', p_ref: 'x', p_correct: 1, p_total: 1 });
    const { count } = await a.client.from('activity').select('*', { count: 'exact', head: true }).eq('kind', 'listening');
    expect(count).toBe(40);
    expect((await b.client.from('activity').select('*')).data).toEqual([]);
    expect((await a.client.rpc('complete_mock', { p_test_id: 'hsk1', p_listening: 120, p_reading: 0 })).error).not.toBeNull();
  });

  test('the weekly leaderboard shows only learners who joined, with name and XP only', async ({ page }) => {
    // Other test runs may have joined too: look only at this run's two learners.
    const tag = Math.random().toString(36).slice(2, 7);
    const a = await createOnboardedUser(`Leader${tag}`);
    const b = await createOnboardedUser(`Quiet${tag}`);
    const ours = (rows: { rank: number; display_name: string }[] | null) => (rows ?? []).filter((r) => r.display_name.endsWith(tag));
    await a.client.rpc('complete_quiz', { p_kind: 'tones', p_ref: 'x', p_correct: 9, p_total: 10 });
    await b.client.rpc('complete_quiz', { p_kind: 'tones', p_ref: 'x', p_correct: 3, p_total: 10 });

    expect((await a.client.rpc('weekly_leaderboard')).data).toEqual([]); // not joined: sees nothing
    await logIn(page, a.email);
    await page.goto('/leaderboard');
    await page.getByRole('button', { name: 'Join the leaderboard' }).click();
    await expect(page.getByRole('listitem', { name: new RegExp(`^\\d+\\. Leader${tag} \\(you\\): 9 XP$`) })).toBeVisible();
    // B hasn't joined, so B isn't listed.
    await expect(page.getByRole('listitem', { name: new RegExp(`Quiet${tag}`) })).toHaveCount(0);

    await b.client.from('profiles').update({ leaderboard_opt_in: true }).eq('id', b.userId);
    const { data } = await b.client.rpc('weekly_leaderboard');
    expect(ours(data).map(({ rank: _rank, ...r }) => r)).toEqual([
      { display_name: `Leader${tag}`, avatar_url: null, xp: 9, is_me: false },
      { display_name: `Quiet${tag}`, avatar_url: null, xp: 3, is_me: true },
    ]);
    expect(Object.keys(data![0]).sort()).toEqual(['avatar_url', 'display_name', 'is_me', 'rank', 'xp']);
    await page.getByRole('button', { name: 'Leave the leaderboard' }).click();
    await expect(page.getByRole('button', { name: 'Join the leaderboard' })).toBeVisible();
    expect(ours((await b.client.rpc('weekly_leaderboard')).data)).toHaveLength(1);
  });

  test('a mock HSK test is timed, scored /200, explained, and saved for readiness', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Mock');
    await logIn(page, email);
    const t = mock(1);
    await page.goto('/mock-test?level=1');
    await expect(page.getByText(/30 questions · 25 minutes/)).toBeVisible();
    await page.getByRole('button', { name: 'Start the test' }).click();
    await expect(page.getByRole('timer')).toContainText('⏱ 2');

    const questions = t.sections.flatMap((s) => s.questions);
    for (const [i, q] of questions.entries()) {
      if (q.type === 'listen-judge' || q.type === 'read-judge') {
        // The last reading question is answered wrong on purpose.
        const right = i === questions.length - 1 ? !q.answer : q.answer;
        await page.getByRole('radio', { name: right ? '✓ 对 True' : '✗ 错 False' }).click();
      } else {
        await page.getByRole('radio', { name: q.options[q.answer], exact: true }).click();
      }
      if (i < questions.length - 1) await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.getByRole('button', { name: 'Hand in (30/30)' }).click();
    await expect(page.getByRole('heading', { name: '193 / 200' })).toBeVisible();
    await expect(page.getByText('Passed (pass mark 120)')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Result saved. It counts towards your HSK readiness.');
    await expect(page.getByText(questions[questions.length - 1].why)).toBeVisible();

    const { data } = await client.from('mock_results').select('test_id, listening, reading, total');
    expect(data).toEqual([{ test_id: 'hsk1', listening: 100, reading: 93, total: 193 }]);
    await page.goto('/progress');
    await expect(page.getByText('Best mock test: 193 / 200 (pass)')).toBeVisible();
  });

  test('the daily goal is in XP; the web explains reminders', async ({ page }) => {
    const { email, client } = await createOnboardedUser('Goal');
    await logIn(page, email);
    await page.goto('/profile');
    await page.getByRole('radio', { name: /^50 XP/ }).click();
    await expect.poll(async () => (await client.from('profiles').select('daily_goal_xp').single()).data?.daily_goal_xp).toBe(50);
    await expect(page.getByText(/on the web, Home shows a reminder/)).toBeVisible();
    await page.goto('/');
    await expect(page.getByLabel('Today: 0 of 50 XP')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: "You haven't studied today." })).toBeVisible();
  });
});
