import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { database } from './database.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function migrate() {
  await database.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    if ((await database.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount) continue;
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  await database.end();
}
migrate().catch((error) => { console.error(error); process.exit(1); });
