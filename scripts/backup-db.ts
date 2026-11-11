/**
 * Backs up the database to backups/<date>/ (git-ignored): the schema, cluster roles, and all data
 * in the public and auth schemas (learners' accounts and progress, content). The free Supabase plan
 * has no downloadable backups, so run this regularly (e.g. weekly) and keep the files somewhere safe.
 *
 *   npm run db:backup             # the cloud project (asks for the database password if needed)
 *   npm run db:backup -- --local  # local Supabase
 *
 * Restore (into an empty project): psql "$DB_URL" -f roles.sql -f schema.sql -f data.sql
 * Not included: Storage files. Audio is rebuilt with `npm run audio:generate -- --upload-only`
 * (data/audio/ cache); profile pictures and tutor voice replies are not backed up.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dir = join(ROOT, 'backups', `${local ? 'local' : 'cloud'}-${stamp}`);
mkdirSync(dir, { recursive: true });

const target = local ? [] : ['--remote'];
const steps: [string, string[]][] = [
  ['roles.sql', ['--role-only']],
  ['schema.sql', []],
  ['data.sql', ['--data-only', '--use-copy', '--schema', 'public,auth']],
];
for (const [file, args] of steps) {
  process.stdout.write(`  ${file}… `);
  execFileSync('npx', ['supabase', 'db', 'dump', ...target, ...args, '--file', join(dir, file)], { cwd: ROOT, stdio: ['inherit', 'ignore', 'inherit'] });
  console.log(`${(statSync(join(dir, file)).size / 1e6).toFixed(1)} MB`);
}
console.log(`✔ backup in ${dir}`);
