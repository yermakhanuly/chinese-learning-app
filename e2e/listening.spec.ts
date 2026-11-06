import { expect, test, type Page } from '@playwright/test';

import { createOnboardedUser, logIn, newClient } from './helpers';

/** Answers every question of an audio quiz (first option each time) and checks the score screen. */
async function finishQuiz(page: Page) {
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
    await page.getByRole('radio').first().click();
    await expect(page.getByRole('alert')).toHaveText(/^(Correct!|Answer: .+)$/);
    await page.getByRole('button', { name: i < 9 ? 'Next' : 'See result' }).click();
  }
  await expect(page.getByRole('status')).toHaveText(/^\d+ of 10 right$/);
}

test.describe('listening & speaking (Phase 6)', () => {
  test('tone trainer and tone quizzes', async ({ page }) => {
    await page.goto('/learn');
    await page.getByRole('button', { name: 'Open listening & speaking' }).click();
    await page.getByRole('button', { name: 'Tone trainer' }).click();
    await expect(page.getByRole('heading', { name: 'Third tone · ǎ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play mǎ' })).toBeVisible();
    await expect(page.getByText('nǐ hǎo')).toBeVisible(); // pair words show pinyin
    await expect(page.getByRole('heading', { name: '不 bù' })).toBeVisible();

    await page.goto('/tone-quiz?mode=syllable');
    await expect(page.getByRole('radio', { name: /^[a-zāáǎàīíǐìūúǔùōóǒò]+$/ }).first()).toBeVisible();
    await finishQuiz(page);

    await page.goto('/tone-quiz?mode=word');
    await finishQuiz(page);
  });

  test('listening quizzes use the recorded sentences and words', async ({ page }) => {
    await page.goto('/listening-quiz?mode=sentence&level=1');
    await finishQuiz(page);
    await page.goto('/listening-quiz?mode=word&level=2');
    await finishQuiz(page);
  });

  test('pronunciation: record, get scores per syllable, compare with the model', async ({ page }) => {
    const { email } = await createOnboardedUser('Speaker');
    let sent: { text: string; audio: string } | null = null;
    // The scoring function (Azure) is stubbed: the test checks what the app sends and shows.
    await page.route('**/functions/v1/pronounce', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        json: {
          score: 92,
          accuracy: 90,
          fluency: 100,
          completeness: 100,
          heard: '你好。',
          syllables: [
            { char: '你', pinyin: 'ni', tone: 3, accuracy: 88, error: 'None', start: 0.1, end: 0.4 },
            { char: '好', pinyin: 'hao', tone: 3, accuracy: 45, error: 'None', start: 0.4, end: 0.9 },
          ],
          left: 59,
        },
      });
    });
    // A synthetic microphone: a 220 Hz voice-like tone (headless Chromium's fake device hangs on macOS).
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.frequency.value = 220;
        const dest = ctx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        return dest.stream;
      };
    });
    await logIn(page, email);
    await page.goto('/word?w=你好');
    await page.getByRole('button', { name: 'Practise saying it' }).click();
    await expect(page).toHaveURL(/\/pronounce\?text=/);

    await page.getByRole('button', { name: 'Record yourself' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Recording… \d+s/);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording' }).click();

    await expect(page.getByLabel('Score 92 out of 100')).toBeVisible();
    await expect(page.getByRole('listitem', { name: '你 nǐ: 88' })).toBeVisible();
    await expect(page.getByRole('listitem', { name: '好 hǎo: 45' })).toBeVisible();
    await expect(page.getByText('Red syllables need work')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Pitch of your voice compared with the model' })).toBeVisible();
    await expect(page.getByText('59 checks left today.')).toBeVisible();
    expect(sent!.text).toBe('你好');
    expect(Buffer.from(sent!.audio, 'base64').subarray(0, 4).toString()).toBe('RIFF');
  });

  test('guests are asked to log in to record; audio speed is a setting', async ({ page }) => {
    await page.goto('/pronounce?text=谢谢');
    await expect(page.getByRole('heading', { name: 'Check your pronunciation' })).toBeVisible();
    await page.goto('/profile');
    await page.getByRole('radio', { name: '0.75×' }).click();
    await page.reload();
    await expect(page.getByRole('radio', { name: '0.75×' })).toHaveAttribute('aria-checked', 'true');
  });

  test('audio data is public and read-only; scoring has a daily limit', async () => {
    const anon = newClient();
    const { data: clips } = await anon.from('audio_clips').select('key, kind').limit(5);
    expect(clips!.length).toBeGreaterThan(0);
    const { data: index } = await anon.storage.from('audio').download('index.json');
    expect(JSON.parse(await index!.text())).toContain(clips![0].key);
    expect((await anon.from('audio_clips').insert({ key: 'x', text: 'x', kind: 'word', voice: 'x', duration_ms: 1 })).error).not.toBeNull();
    expect((await anon.storage.from('audio').upload('clips/evil.mp3', new Blob(['x'], { type: 'audio/mpeg' }))).error).not.toBeNull();

    const { client } = await createOnboardedUser('Quota');
    expect((await client.rpc('take_pronunciation_quota', { p_limit: 2 })).data).toBe(1);
    expect((await client.rpc('take_pronunciation_quota', { p_limit: 2 })).data).toBe(0);
    expect((await client.rpc('take_pronunciation_quota', { p_limit: 2 })).error).not.toBeNull();
    expect((await anon.rpc('take_pronunciation_quota')).error).not.toBeNull();
    expect((await client.from('pronunciation_usage').insert({ user_id: (await client.auth.getUser()).data.user!.id })).error).not.toBeNull();
  });
});
