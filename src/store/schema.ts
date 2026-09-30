import { ContrailError } from '../errors.ts';
import type { Db } from './sqlite.ts';

/**
 * Append-only: to change the schema, add a new entry. Never edit a shipped one.
 * Each entry is a list of single statements so both SQLite drivers can run them.
 */
export const MIGRATIONS: readonly (readonly string[])[] = [
  [
    `CREATE TABLE events (
       id          INTEGER PRIMARY KEY,
       spool_name  TEXT NOT NULL UNIQUE,
       captured_us INTEGER NOT NULL,
       session_id  TEXT,
       prompt_id   TEXT,
       agent_id    TEXT,
       hook_event  TEXT NOT NULL,
       tool_name   TEXT,
       tool_use_id TEXT,
       cwd         TEXT,
       repo_key    TEXT,
       payload     TEXT NOT NULL,
       parse_error TEXT
     )`,
    'CREATE INDEX events_session ON events (session_id, captured_us)',
    'CREATE INDEX events_tool_use ON events (tool_use_id)',
    'CREATE INDEX events_repo ON events (repo_key, captured_us)',
    `CREATE TABLE touches (
       event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
       path     TEXT NOT NULL,
       kind     TEXT NOT NULL CHECK (kind IN ('read', 'write'))
     )`,
    'CREATE INDEX touches_path ON touches (path, kind)',
  ],
  [
    // v2: shell commands without bashEditDiff get "expected" file touches (R6). SQLite can't
    // alter a CHECK constraint, so the table is rebuilt and its rows copied across.
    `CREATE TABLE touches_v2 (
       event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
       path     TEXT NOT NULL,
       kind     TEXT NOT NULL CHECK (kind IN ('read', 'write', 'expected'))
     )`,
    'INSERT INTO touches_v2 (event_id, path, kind) SELECT event_id, path, kind FROM touches',
    'DROP TABLE touches',
    'ALTER TABLE touches_v2 RENAME TO touches',
    'CREATE INDEX touches_path ON touches (path, kind)',
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings a database up to SCHEMA_VERSION. Safe to call from many processes at once. */
export function migrate(db: Db): void {
  db.exec('PRAGMA busy_timeout = 5000');
  useWal(db);
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');

  // BEGIN IMMEDIATE takes the write lock before reading the version, so two
  // processes can't both see v0 and both try to create the tables.
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
    if (version > SCHEMA_VERSION) {
      throw new ContrailError(
        `This contrail.db (schema v${version}) is newer than this Contrail (v${SCHEMA_VERSION}). Update the plugin.`,
      );
    }
    for (let v = version; v < SCHEMA_VERSION; v++) {
      for (const statement of MIGRATIONS[v]!) db.exec(statement);
    }
    if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Switches a database to WAL once. On a new database, two processes switching at the same
 * moment each hold a read lock and need the write lock, which SQLite resolves by failing one of
 * them at once, without the busy timeout. So the switch is skipped when already done, and
 * otherwise retried for up to about five seconds.
 */
function useWal(db: Db, attempts = 100): void {
  for (let i = 1; ; i++) {
    try {
      if (db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode.toLowerCase() !== 'wal') db.exec('PRAGMA journal_mode = WAL');
      return;
    } catch (e) {
      if (i >= attempts || !/locked|busy/i.test((e as Error).message)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 + Math.floor(Math.random() * 30));
    }
  }
}
