import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';

/** Official Miniflare API avoids Wrangler's optional network-interface discovery. */
export async function createRuntime({ port = 8787, persist = true } = {}) {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: 'dist/worker/index.js',
    compatibilityDate: '2026-10-09',
    host: '127.0.0.1',
    port,
    d1Databases: { DB: 'workbench-local' },
    d1Persist: persist ? '.wrangler/local-d1' : false,
    bindings: { JEV_ENABLED: 'false', WORKERS_PLAN: 'free' },
  }));
  try {
    await runtime.ready;
    const database = await runtime.getD1Database('DB');
    const sql = await readFile('migrations/0001_initial.sql', 'utf8');
    const initialized = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").first();
    if (!initialized) {
      const statements = sql.replace(/--[^\n]*/g, '').split(';').map(part => part.trim()).filter(part => part && !/^PRAGMA/i.test(part));
      await database.batch(statements.map(statement => database.prepare(statement)));
    }
    const schema = await database.prepare("SELECT sql FROM sqlite_master WHERE name = 'monthly_metrics'").first();
    if (!schema.sql.includes('subs_delta BETWEEN -9007199254740991')) {
      const migration = await readFile('migrations/0002_signed_subscriber_delta.sql', 'utf8');
      const statements = migration.replace(/--[^\n]*/g, '').split(';').map(part => part.trim()).filter(Boolean);
      await database.batch(statements.map(statement => database.prepare(statement)));
    }
    return runtime;
  } catch (error) { await runtime.dispose(); throw error; }
}
