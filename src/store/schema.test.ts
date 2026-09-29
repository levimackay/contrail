import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ContrailError } from '../errors.ts';
import { migrate, SCHEMA_VERSION } from './schema.ts';
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
