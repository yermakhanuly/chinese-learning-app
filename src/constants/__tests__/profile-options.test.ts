import fs from 'node:fs';
import path from 'node:path';

import {
  DAILY_GOALS,
  EXPLANATION_LANGUAGES,
  LEARNING_GOALS,
  SCRIPTS,
  SELF_LEVELS,
  labelFor,
} from '@/constants/profile-options';

const migration = fs.readFileSync(
  path.join(__dirname, '../../../supabase/migrations/20261105000000_profiles.sql'),
  'utf8',
);

/** The app's choices must match the database check constraints exactly, or saving fails. */
function checkValues(column: string): string[] {
  const match = migration.match(new RegExp(`${column}[^\\n]*check \\(${column} in \\(([^)]*)\\)`));
  if (!match) throw new Error(`no check constraint for ${column}`);
  return match[1].split(',').map((v) => v.trim().replace(/'/g, ''));
}

describe('profile options match the database', () => {
  it.each([
    ['learning_goal', LEARNING_GOALS],
    ['self_level', SELF_LEVELS],
    ['daily_goal_minutes', DAILY_GOALS],
    ['script', SCRIPTS],
    ['explanation_language', EXPLANATION_LANGUAGES],
  ] as const)('%s', (column, options) => {
    expect(options.map((o) => String(o.value))).toEqual(checkValues(column));
  });
});

describe('labelFor', () => {
  it('finds labels and falls back', () => {
    expect(labelFor(DAILY_GOALS, 15)).toBe('15 min');
    expect(labelFor(LEARNING_GOALS, null)).toBe('Not set');
  });
});
