import { defineConfig, devices } from '@playwright/test';

import { localSupabase } from './e2e/local-supabase';

const supabase = localSupabase();

/**
 * Web end-to-end tests. Needs local Supabase running with data imported
 * (`npm run db:start && npm run data:import`). The test build is pointed at the local database,
 * whatever .env.local says (that's the cloud project for everyday development).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:8082',
    // The pronunciation test also replaces getUserMedia with a synthetic tone.
    permissions: ['microphone'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  // Tests run against a production web build (fast and deterministic), not the dev server, which
  // bundles each route on first visit and can run out of memory under parallel browsers.
  webServer: {
    command: 'npx expo export --platform web --output-dir dist --clear && npx expo serve dist --port 8082',
    url: 'http://localhost:8082',
    reuseExistingServer: false, // always rebuild, so tests never run against stale code
    timeout: 300_000,
    // Real environment variables win over .env.local when Expo inlines EXPO_PUBLIC_*.
    env: { EXPO_PUBLIC_SUPABASE_URL: supabase.url, EXPO_PUBLIC_SUPABASE_KEY: supabase.key },
  },
});
