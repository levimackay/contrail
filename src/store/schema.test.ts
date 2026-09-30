import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ContrailError } from '../errors.ts';
import { migrate, MIGRATIONS, SCHEMA_VERSION } from './schema.ts';
import { openDb } from './sqlite.ts';

const tempDb = () => join(mkdtempSync(join(tmpdir(), 'contrail-db-')), 'contrail.db');

test('a fresh database gets the current schema', async () => {
  const db = await openDb(tempDb());
  migrate(db);
  assert.equal(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version, SCHEMA_VERSION);
  assert.deepEqual(
    db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map(r => r.name),
    ['events', 'touches'],
  );
  db.close();
});

test('migrating twice is a no-op', async () => {
  const path = tempDb();
  const db = await openDb(path);
  migrate(db);
  migrate(db);
  assert.equal(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version, SCHEMA_VERSION);
  db.close();
});

test('a v2 database gains the source column, and its rows read as recorded live', async () => {
  const db = await openDb(tempDb());
  for (const statement of [...MIGRATIONS[0]!, ...MIGRATIONS[1]!]) db.exec(statement);
  db.exec('PRAGMA user_version = 2');
  db.run("INSERT INTO events (spool_name, captured_us, session_id, hook_event, payload) VALUES ('a', 1, 's1', 'PreToolUse', '{}')");
  migrate(db);
  assert.equal(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version, SCHEMA_VERSION);
  assert.deepEqual(db.all<{ spool_name: string; source: string | null }>('SELECT spool_name, source FROM events').map(r => [r.spool_name, r.source]), [['a', null]]);
  db.run("INSERT INTO events (spool_name, captured_us, session_id, hook_event, payload, source) VALUES ('b', 2, 's2', 'PreToolUse', '{}', 'transcript')");
  assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE source = 'transcript'")?.n, 1);
  db.close();
});

test('a database from a newer Contrail is refused with a clear message', async () => {
  const db = await openDb(tempDb());
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  assert.throws(() => migrate(db), (e: unknown) => e instanceof ContrailError && /newer than this Contrail/.test(e.message));
  db.close();
});

test('sixteen processes migrating the same new database at once all succeed', async () => {
  const path = tempDb();
  const script = join(import.meta.dirname, '..', '..', 'test', 'helpers', 'migrate-once.ts');
  const codes = await Promise.all(
    Array.from({ length: 16 }, () => new Promise<number | null>(resolve => {
      spawn(process.execPath, [script, path], { stdio: 'ignore' }).on('close', resolve);
    })),
  );
  assert.deepEqual(codes, Array(16).fill(0));
  const db = await openDb(path);
  assert.equal(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version, SCHEMA_VERSION);
  db.close();
});

test('switching a new database to WAL is retried when SQLite fails it at once as a lock conflict', async () => {
  const db = await openDb(tempDb());
  let failures = 2;
  const flaky: typeof db = {
    ...db,
    exec: (sql: string) => {
      if (/journal_mode = WAL/.test(sql) && failures-- > 0) throw new Error('database is locked');
      db.exec(sql);
    },
    get: db.get.bind(db),
    run: db.run.bind(db),
    all: db.all.bind(db),
    close: db.close.bind(db),
  };
  migrate(flaky);
  assert.equal(failures, -1);
  assert.equal(db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode, 'wal');
  db.close();
});
