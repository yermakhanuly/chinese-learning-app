# HSK Chinese

Mandarin learning app built on the HSK 3.0 curriculum — one codebase for the **iPhone app** and the **website**.

- Stack: Expo SDK 58 (React Native + Expo Router, TypeScript), Supabase, TanStack Query
- Feature list: [`chinese-app-features`](chinese-app-features)

## Prerequisites

- Node 22+, Xcode (for the iPhone simulator), Docker Desktop (only for the automated tests)
- Optional: **Expo Go** on your iPhone, on the same Wi-Fi as your Mac (the dev server is on your Mac; the database is in the cloud)

## Databases

| | Used by | Where |
|---|---|---|
| **Cloud** — project `chinese-learning-app-dev` (ref `dpyfrpfrqewgrmkozsny`) | the app, via `.env.local` | https://supabase.com/dashboard/project/dpyfrpfrqewgrmkozsny |
| **Local** — Docker | Playwright tests (always; they refuse any other database) | Studio http://127.0.0.1:54323, emails http://127.0.0.1:54324 |

## First-time setup

```bash
npm install
npx supabase login                      # in your own Terminal (needs a real terminal)
npx supabase link --project-ref dpyfrpfrqewgrmkozsny
npx supabase projects api-keys --project-ref dpyfrpfrqewgrmkozsny
# put the project URL and the publishable key into .env.local (see .env.example)
```

### Changing the cloud database

```bash
npx supabase db push --remote           # apply new files in supabase/migrations/
npx supabase config push                # login settings from supabase/config.toml (shows a diff first)
SUPABASE_URL=https://dpyfrpfrqewgrmkozsny.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret key: projects api-keys --reveal> npm run data:import
```

`data:import` loads HSK words, CC-CEDICT, Tatoeba example sentences (downloaded to `data/raw/`, needs `bzip2`) and the word topics from `data/word-topics.json`.

### Lessons (AI-drafted, checked automatically)

```bash
npm run content:draft   # Claude drafts content/hsk1/ (outline + one JSON per lesson); keeps existing files
npm run data:import     # loads lessons (adds pinyin/traditional and word details)
```

Delete a lesson's JSON file and re-run `content:draft` to redraft it; or edit the JSON by hand. `src/lib/lessons.ts` describes the format and the checks (only words already taught, valid answers, every HSK word taught once).

### Characters

`npm run data:import` also loads stroke order and character details from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) for every character in the HSK words (simplified and traditional forms, ~4,300). `npm run data:import -- --only=characters` reloads just those. Handwriting is checked in `src/lib/stroke-match.ts` (adapted from Hanzi Writer, MIT).

### Audio and pronunciation (Azure Speech)

Put `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in `scripts/.env` (git-ignored).

```bash
npm run audio:generate                    # neural voices for HSK 1–4 words, their example sentences, lesson
                                          # sentences and tone syllables → data/audio/ (cache) → LOCAL storage
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run audio:generate -- --upload-only   # same files → cloud
```

The free tier allows 20 voice requests a minute, so the script puts many texts in one request and cuts the audio at the pauses (~30 minutes for ~7,300 clips). The app plays `audio/clips/<audioKey(text)>.mp3` when `audio/index.json` lists it, otherwise the device voice.

Pronunciation scoring runs in the `pronounce` Edge Function (Azure key on the server, 60 checks per learner per day):

```bash
grep ^AZURE_ scripts/.env > supabase/functions/.env            # git-ignored; local only
npx supabase functions serve --env-file supabase/functions/.env    # local
npx supabase secrets set AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=…  # cloud (then: npx supabase functions deploy pronounce)
```

### Review (spaced repetition)

Cards live in `review_cards` and are created by the database: finishing a lesson (`complete_lesson`) adds its words, saving a word adds it (trigger), and learners add sentences and their own cards. Each word gets three cards (read, listen, recall). The app schedules them with [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (FSRS-7, `src/lib/srs.ts`) and saves each answer through `record_review`, which also logs mistakes. `review_queue` builds the day's session: due cards, then new cards up to the learner's daily limit, one direction of a word per day.

### Word topics (AI-tagged, run once)

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > scripts/.env   # git-ignored
npm run data:topics     # Claude tags each HSK word with 1–2 of 25 topics (Batch API, ~1 hour, ≈ $5)
npm run data:import     # loads them; commit data/word-topics.json
```

> `config push` applies the `[remotes.cloud-dev]` overrides at the end of `config.toml` (Gmail SMTP) and needs `supabase/.env` filled in (see Emails).

### Local database (tests, or offline work)

```bash
npm run db:start        # local Supabase in Docker (first run downloads images)
npm run data:import     # loads HSK words + CC-CEDICT into the local database
```

To point the app at it instead of the cloud, put `API_URL` / `PUBLISHABLE_KEY` from `npx supabase status` into `.env.local` and restart `npx expo start`.

> `npm run db:reset` re-applies migrations and **empties the local database** — run `npm run data:import` again afterwards.

## Google login (optional)

The "Continue with Google" button appears only once Google is configured:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** of type *Web application*.
   Authorized redirect URIs: `https://dpyfrpfrqewgrmkozsny.supabase.co/auth/v1/callback` (cloud) and `http://127.0.0.1:54321/auth/v1/callback` (local).
2. Create `supabase/.env` (git-ignored):
   ```
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
   ```
3. In `supabase/config.toml` set `[auth.external.google] enabled = true`, then `npx supabase config push` (cloud) and/or `npm run db:stop && npm run db:start` (local).

## Emails

- **Cloud:** sent through Gmail SMTP from your Gmail address as "HSK Chinese" (about 500/day; the project allows 30/hour). Credentials are in `supabase/.env` (git-ignored): `SUPABASE_AUTH_SMTP_USER` and `SUPABASE_AUTH_SMTP_PASS`, a Google App password from https://myaccount.google.com/apppasswords. After changing them, run `npx supabase config push`.
- **Local:** nothing is really sent; emails land in **Mailpit**: http://127.0.0.1:54324

## Run

```bash
npx expo start          # then press i (iPhone simulator) or w (web),
                        # or scan the QR code with your iPhone camera (Expo Go)
```

Database browser: the Supabase dashboard (cloud) or Studio http://127.0.0.1:54323 (local).

## Checks

```bash
npm run typecheck
npm run lint
npm test                # unit tests (Jest)
npx playwright test     # web end-to-end tests (needs LOCAL Supabase running + data imported)
```

## Project layout

```
src/app/            screens (Expo Router: every file is a route)
src/components/     shared UI (Screen, Card, SegmentedControl, tab bars)
src/constants/      design tokens (colors incl. tone colors, spacing) and tab list
src/hooks/          data + theme hooks
src/lib/            pinyin, vocabulary parsers, lessons, review scheduling (FSRS), Supabase client, auth, storage
src/providers/      login session (auth) and theme preference
supabase/           Supabase config (cloud + local) + SQL migrations
scripts/            data import, icon generation
e2e/                Playwright tests
```

## Data & licenses

- HSK word lists: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT). Levels use the **2026 HSK 3.0 syllabus** (`hsk_level`; 7 = levels 7–9); the 2021 standard and HSK 2.0 levels are stored too.
- Dictionary: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (CC BY-SA 4.0) — attribution shown in the app's Profile → Credits.
- Example sentences: [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR) — each sentence links to its Tatoeba page.
- Voices and pronunciation scoring: Azure AI Speech (neural voices Xiaoxiao and Yunxi).
- Review scheduling: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT).
- Characters: [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) — stroke shapes and medians under the Arphic Public License, character details (radical, parts, origin) under the LGPL. Stroke checking adapted from [Hanzi Writer](https://github.com/chanind/hanzi-writer) (MIT).
- Word audio (for now): the device's built-in Chinese voice.
