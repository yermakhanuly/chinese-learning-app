import { expect, test, type Page, type Route } from '@playwright/test';

import { adminClient, createOnboardedUser, logIn, makePremium } from './helpers';

/**
 * The AI tutor's Edge Function calls Claude, which tests never do (no credit is spent). Instead the
 * function is replaced by this stand-in: it answers like the real one and writes the same rows with
 * the service role, so the screens, the mistake notebook and XP (database triggers) are tested for
 * real. The function itself is covered by unit tests of its prompts and schemas.
 */
type Sent = Record<string, unknown> & { action: string };

const CORRECTION = { ok: false, corrected: '我要一个米饭。', corrected_pinyin: 'wǒ yào yí ge mǐfàn.', explanation: 'Put 要 before the thing you want.', kind: 'word order' };

async function fakeTutor(page: Page, userId: string) {
  const db = adminClient();
  const sent: Sent[] = [];
  const add = async (conversation_id: string, rows: { role: 'user' | 'assistant'; text: string; data: Record<string, unknown> }[]) => {
    const out = [];
    for (const r of rows) {
      const { data, error } = await db.from('tutor_messages').insert({ ...r, conversation_id, user_id: userId }).select('id, role, text, data, created_at').single();
      if (error) throw error;
      out.push(data);
    }
    return out;
  };
  await page.route('**/functions/v1/tutor', async (route: Route) => {
    const body = route.request().postDataJSON() as Sent;
    sent.push(body);
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data });
    switch (body.action) {
      case 'start': {
        const s = body.scenario_id ? (await db.from('tutor_scenarios').select('*').eq('id', body.scenario_id).single()).data : null;
        const { data: conversation, error } = await db
          .from('tutor_conversations')
          .insert({ user_id: userId, mode: body.mode, scenario_id: s?.id ?? null, topic: body.topic ?? null, title: s?.title ?? (body.topic as string) ?? 'Ask the tutor', level: 1 })
          .select('*')
          .single();
        if (error) throw error;
        const first = s
          ? { text: s.opening.zh, data: { pinyin: 'nǐhǎo! nǐ xiǎng chī shénme?', en: s.opening.en } }
          : body.mode === 'tutor'
            ? { text: "Hi! I'm your Chinese tutor.", data: {} }
            : { text: '你好！你喜欢做什么？', data: { pinyin: 'nǐ hǎo! nǐ xǐhuan zuò shénme?', en: 'Hi! What do you like doing?' } };
        return json({ conversation, messages: await add(conversation.id, [{ role: 'assistant', ...first }]) });
      }
      case 'send':
      case 'voice': {
        const id = body.conversation_id as string;
        const { data: c } = await db.from('tutor_conversations').select('mode').eq('id', id).single();
        const said = body.action === 'voice' ? '我要茶' : (body.text as string);
        if (c!.mode === 'tutor') {
          return json({ messages: await add(id, [{ role: 'user', text: said, data: {} }, { role: 'assistant', text: '是 (shì) links two nouns: 我是学生 (wǒ shì xuésheng).', data: {} }]) });
        }
        const correction = body.action === 'voice' ? { ok: true, corrected: said, corrected_pinyin: '', explanation: '', kind: '' } : CORRECTION;
        const messages = await add(id, [
          { role: 'user', text: said, data: { correction, ...(body.action === 'voice' ? { voice: true } : {}) } },
          { role: 'assistant', text: '好的！你想喝什么？', data: { pinyin: 'hǎo de! nǐ xiǎng hē shénme?', en: 'OK! What would you like to drink?', goals_done: [0] } },
        ]);
        return json(body.action === 'voice' ? { messages, heard: said, audio_path: '/storage/v1/object/sign/tutor-audio/tts/x.mp3?token=t' } : { messages });
      }
      case 'finish': {
        const feedback = { summary: 'You ordered lunch clearly.', strengths: ['Polite greeting'], focus: ['Word order with 要'], score: 82 };
        await db.from('tutor_conversations').update({ feedback, finished_at: new Date().toISOString() }).eq('id', body.conversation_id as string);
        return json({ feedback });
      }
      case 'speak':
        return json({ audio_path: '/storage/v1/object/sign/tutor-audio/tts/x.mp3?token=t' });
      case 'check':
        return json({ ok: false, corrected: '我很喜欢吃米饭。', corrected_pinyin: 'wǒ hěn xǐhuan chī mǐfàn.', translation: 'I really like eating rice.', explanation: '很 comes before the verb.', fixes: [{ wrong: '喜欢很', right: '很喜欢', why: 'Adverbs go before the verb.' }], natural: '' });
      case 'explain':
        return json({ translation: 'I am at home.', literal: 'I at home', words: [{ zh: '我', pinyin: 'wǒ', meaning: 'I', role: 'subject' }, { zh: '在', pinyin: 'zài', meaning: 'at', role: 'verb (be at)' }, { zh: '家', pinyin: 'jiā', meaning: 'home', role: 'place' }], grammar: [{ pattern: 'Subject + 在 + place', explanation: 'Says where someone is.' }] });
      case 'examples':
        return json({ examples: [{ zh: '我每天喝水。', pinyin: 'wǒ měitiān hē shuǐ.', en: 'I drink water every day.' }, { zh: '这是水。', pinyin: 'zhè shì shuǐ.', en: 'This is water.' }, { zh: '你要水吗？', pinyin: 'nǐ yào shuǐ ma?', en: 'Do you want water?' }] });
      case 'quiz':
        return json({ questions: [
          { prompt: 'What does this mean?', zh: '水', options: ['water', 'tea', 'rice', 'milk'], answer: 0, why: '水 (shuǐ) is water.', word: '水' },
          { prompt: 'Which word means "tea"?', zh: '', options: ['米饭', '茶', '水', '菜'], answer: 1, why: '茶 (chá) is tea.', word: '茶' },
          { prompt: 'Fill the gap', zh: '我___茶。', options: ['喝', '吃', '看', '听'], answer: 0, why: 'You drink (喝 hē) tea.', word: '喝' },
        ] });
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  });
  return sent;
}

async function premiumLearner(page: Page, name: string) {
  const user = await createOnboardedUser(name);
  await makePremium(user.userId);
  const sent = await fakeTutor(page, user.userId);
  await logIn(page, user.email);
  return { ...user, sent };
}

test.describe('AI tutor (Phase 9)', () => {
  test('without Premium the tutor is locked, and learners cannot give themselves Premium', async ({ page }) => {
    const { email, client, userId } = await createOnboardedUser('Free');
    const update = await client.from('profiles').update({ premium_until: '2099-01-01T00:00:00Z' }).eq('id', userId);
    expect(update.error).not.toBeNull();
    expect((await client.from('tutor_messages').insert({ conversation_id: crypto.randomUUID(), user_id: userId, role: 'user', text: 'x' })).error).not.toBeNull();

    await logIn(page, email);
    await expect(page.getByRole('link', { name: /Practise conversation with the AI tutor/ })).toBeVisible(); // Home: what to study next
    await page.goto('/tutor');
    await expect(page.getByText('✨ The AI tutor is part of Premium')).toBeVisible();
    await page.getByRole('button', { name: 'About Premium' }).click();
    await expect(page).toHaveURL(/\/premium/);
    await expect(page.getByText('Subscriptions are coming soon')).toBeVisible();
    await page.goto('/word?w=水');
    await expect(page.getByText('✨ Examples made for you')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Write examples for me' })).toHaveCount(0);
  });

  test('role-play: corrections under each message, goals, feedback, notebook and XP', async ({ page }) => {
    const { client, sent } = await premiumLearner(page, 'Roleplayer');
    await page.goto('/tutor');
    await page.getByRole('button', { name: 'Role-play: Ordering at a restaurant' }).click();
    await expect(page).toHaveURL(/\/conversation\?id=/);
    await expect(page.getByRole('listitem', { name: 'Tutor: 你好！你想吃什么？' })).toBeVisible();
    await expect(page.getByText('nǐhǎo! nǐ xiǎng chī shénme?')).toBeVisible(); // pinyin on by default
    await page.getByRole('switch', { name: 'English' }).click();
    await expect(page.getByText('Hello! What would you like to eat?')).toBeVisible();

    await page.getByLabel('Your message in Chinese').fill('我一个米饭要');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('listitem', { name: 'You: 我一个米饭要' })).toBeVisible();
    const note = page.getByRole('note', { name: 'Correction: 我要一个米饭。' });
    await expect(note).toContainText('✎ Better · word order');
    await note.getByRole('button', { name: 'Why?' }).click();
    await expect(note).toContainText('Put 要 before the thing you want.');
    await expect(page.getByRole('listitem', { name: 'Order one dish and a drink, done' })).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Ask for the bill' })).toBeVisible();
    expect(sent.find((s) => s.action === 'send')).toMatchObject({ text: '我一个米饭要' });

    await page.getByRole('button', { name: 'Finish and get feedback' }).click();
    await expect(page.getByText('How it went')).toBeVisible();
    await expect(page.getByLabel('Score: 82 out of 100')).toBeVisible();
    await expect(page.getByText('Your corrections (1)')).toBeVisible();
    await expect(page.getByLabel('Your message in Chinese')).toHaveCount(0);

    // The correction is in the mistake notebook, and the message earned XP (database trigger).
    await page.goto('/mistakes');
    await expect(page.getByRole('heading', { name: 'From conversations' })).toBeVisible();
    await expect(page.getByRole('listitem', { name: '我一个米饭要 corrected to 我要一个米饭。' })).toBeVisible();
    expect((await client.from('activity').select('kind, xp')).data).toEqual([{ kind: 'conversation', xp: 2 }]);

    await page.goto('/tutor');
    await expect(page.getByRole('link', { name: '🎭 Ordering at a restaurant' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Ordering at a restaurant' }).click();
    await expect(page.getByRole('link', { name: '🎭 Ordering at a restaurant' })).toHaveCount(0);
  });

  test('voice: hold to talk sends a WAV recording; the reply shows what was heard', async ({ page }) => {
    // A synthetic microphone (as in the pronunciation test).
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
    const { sent } = await premiumLearner(page, 'Talker');
    await page.route('**/storage/v1/object/sign/tutor-audio/**', (route) => route.fulfill({ status: 404 }));
    await page.goto('/tutor');
    await page.getByRole('button', { name: 'Talk about Food' }).click();
    await expect(page.getByRole('listitem', { name: 'Tutor: 你好！你喜欢做什么？' })).toBeVisible();
    const mic = page.getByRole('button', { name: 'Hold to talk' });
    await mic.scrollIntoViewIfNeeded();
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByText(/Recording… \ds · release to send/)).toBeVisible();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(page.getByRole('listitem', { name: 'You (spoken): 我要茶' })).toBeVisible();
    await expect(page.getByText('Heard: 我要茶')).toBeVisible();
    const voice = sent.find((s) => s.action === 'voice')!;
    expect(atob((voice.audio as string).slice(0, 16)).slice(0, 4)).toBe('RIFF');
  });

  test('ask the tutor, check and explain sentences, AI examples and a quiz', async ({ page }) => {
    const { client } = await premiumLearner(page, 'Asker');
    await page.goto('/tutor');
    await page.getByRole('button', { name: 'Ask a question' }).click();
    await page.getByLabel('Your question').fill('How do I use 是?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('listitem', { name: /^Tutor: 是 \(shì\) links two nouns/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hold to talk' })).toHaveCount(0); // no voice in tutor chat

    await page.goto('/ai-tools?tool=check');
    await page.getByLabel('Your sentence in Chinese').fill('我喜欢很吃米饭');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText('✎ Corrected')).toBeVisible();
    await expect(page.getByText('我很喜欢吃米饭。')).toBeVisible();
    await expect(page.getByText('Adverbs go before the verb.')).toBeVisible();
    await page.getByRole('radio', { name: 'Explain a sentence' }).click();
    await page.getByLabel('A Chinese sentence').fill('我在家。');
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await expect(page.getByRole('listitem', { name: '家: home' })).toBeVisible();
    await expect(page.getByText('Subject + 在 + place')).toBeVisible();

    await page.goto('/word?w=水');
    await page.getByRole('button', { name: 'Write examples for me' }).click();
    await expect(page.getByText('我每天喝水。')).toBeVisible();
    await expect(page.getByText('Do you want water?')).toBeVisible();

    await page.goto('/ai-quiz');
    await page.getByRole('radio', { name: 'water' }).click();
    await expect(page.getByRole('status')).toContainText('Right! 水 (shuǐ) is water.');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: '水', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Not quite.');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: '喝' }).click();
    await page.getByRole('button', { name: 'See result' }).click();
    await expect(page.getByText('2 / 3 right')).toBeVisible();
    await expect.poll(async () => (await client.from('activity').select('kind, xp, correct, total').eq('kind', 'ai_quiz')).data).toEqual([
      { kind: 'ai_quiz', xp: 2, correct: 2, total: 3 },
    ]);
  });
});
