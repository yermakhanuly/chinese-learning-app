# HSK Chinese

Mandarin learning app built on the HSK 3.0 curriculum — one codebase for the **iPhone app** and the **website**.

- Stack: Expo SDK 58 (React Native + Expo Router, TypeScript), Supabase, TanStack Query
- Plan and phase status: [`PLAN.md`](PLAN.md) · Feature list: [`chinese-app-features`](chinese-app-features)

## Prerequisites

- Node 22+, Docker Desktop (running), Xcode (for the iPhone simulator)
- Optional: **Expo Go** on your iPhone, on the same Wi-Fi as your Mac

## First-time setup

```bash
npm install
npm run db:start        # local Supabase in Docker (first run downloads images)
npm run data:import     # loads HSK words + CC-CEDICT into the local database
npx supabase status     # copy API_URL and PUBLISHABLE_KEY into .env.local (see .env.example)
```

> `npm run db:reset` re-applies migrations and **empties the database** — run `npm run data:import` again afterwards.

## Google login (optional)

The "Continue with Google" button appears only once Google is configured:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** of type *Web application*.
   Authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`.
2. Create `supabase/.env` (git-ignored):
   ```
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
   ```
3. In `supabase/config.toml` set `[auth.external.google] enabled = true`, then `npm run db:stop && npm run db:start`.

Works on the web and in the iPhone simulator. A physical iPhone needs the cloud Supabase project (Phase 10).

## Emails in development

Local Supabase doesn't send real email. Sign-up confirmations and password-reset codes land in **Mailpit**: http://127.0.0.1:54324

## Run

```bash
npx expo start          # then press i (iPhone simulator) or w (web),
                        # or scan the QR code with your iPhone camera (Expo Go)
```

Supabase Studio (database browser): http://127.0.0.1:54323

## Checks

```bash
npm run typecheck
npm run lint
npm test                # unit tests (Jest)
npx playwright test     # web end-to-end tests (needs Supabase running + data imported)
```

## Project layout

```
src/app/            screens (Expo Router: every file is a route)
src/components/     shared UI (Screen, Card, SegmentedControl, tab bars)
src/constants/      design tokens (colors incl. tone colors, spacing) and tab list
src/hooks/          data + theme hooks
src/lib/            pinyin, vocabulary parsers, Supabase client, auth helpers, storage
src/providers/      login session (auth) and theme preference
supabase/           local Supabase config + SQL migrations
scripts/            data import, icon generation
e2e/                Playwright tests
```

## Data & licenses

- HSK word lists: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT). Levels use the **2026 HSK 3.0 syllabus** (`hsk_level`; 7 = levels 7–9); the 2021 standard and HSK 2.0 levels are stored too.
- Dictionary: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (CC BY-SA 4.0) — attribution shown in the app's Profile → Credits.
