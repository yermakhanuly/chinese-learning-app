import fs from 'node:fs';
import path from 'node:path';

import { TOPICS } from '../topics';

describe('TOPICS', () => {
  it('matches the topics seeded in the database migration', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../supabase/migrations/20261106000000_dictionary.sql'),
      'utf8',
    );
    const seeded = [...sql.matchAll(/^\s+\('([a-z-]+)',\s+'([^']+)'/gm)].map((m) => ({ slug: m[1], name: m[2] }));
    expect(seeded).toEqual(TOPICS.map(({ slug, name }) => ({ slug, name })));
  });
});
