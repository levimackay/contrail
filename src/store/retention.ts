import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './sqlite.ts';

export interface Config {
  retentionDays: number;
  maxDbMb: number;
  /** false: store what the agent read as keyed hashes, never as text */
  storeContent: boolean;
  /** false: no tripwire notices before sensitive tool calls */
  tripwire: boolean;
}

export const DEFAULTS: Config = { retentionDays: 90, maxDbMb: 1024, storeContent: true, tripwire: true };

/** config.json in the data directory, e.g. {"retention_days": 30, "max_db_mb": 512}. Missing or invalid values fall back to defaults. */
export function loadConfig(dataDir: string): { config: Config; problem: string | null } {
  let raw: string;
  try {
    raw = readFileSync(join(dataDir, 'config.json'), 'utf8');
  } catch {
    return { config: DEFAULTS, problem: null };
  }
  try {
    const c = JSON.parse(raw) as Record<string, unknown>;
    const positive = (v: unknown, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
    return {
      config: {
        retentionDays: positive(c.retention_days, DEFAULTS.retentionDays),
        maxDbMb: positive(c.max_db_mb, DEFAULTS.maxDbMb),
        storeContent: c.store_content !== false,
        tripwire: c.tripwire !== false,
      },
      problem: null,
    };
  } catch (e) {
    return { config: DEFAULTS, problem: `config.json is not valid JSON (${(e as Error).message}); using defaults` };
  }
}

/**
 * Deletes whole sessions: those whose last event is older than the retention window, then
 * the oldest ones while the live data exceeds the size cap. File touches go with their events.
 */
export function prune(db: Db, config: Config, nowMs: number): { sessionsRemoved: number } {
  const cutoffUs = (nowMs - config.retentionDays * 86_400_000) * 1000;
  let removed = 0;
  const drop = (sessionId: string | null) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (sessionId === null) db.run('DELETE FROM events WHERE session_id IS NULL AND captured_us < ?', cutoffUs);
      else db.run('DELETE FROM events WHERE session_id = ?', sessionId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  const old = db.all<{ id: string }>('SELECT session_id AS id FROM events WHERE session_id IS NOT NULL GROUP BY session_id HAVING MAX(captured_us) < ?', cutoffUs);
  for (const { id } of old) {
    drop(id);
    removed++;
  }
  drop(null);

  const limit = config.maxDbMb * 1024 * 1024;
  while (liveBytes(db) > limit) {
    const oldest = db.get<{ id: string }>(
      'SELECT session_id AS id FROM events WHERE session_id IS NOT NULL GROUP BY session_id ORDER BY MAX(captured_us) LIMIT 1',
    );
    if (!oldest) break;
    drop(oldest.id);
    removed++;
  }
  return { sessionsRemoved: removed };
}

/** Bytes in use: pages minus the free list, so deletes count before a VACUUM. */
export function liveBytes(db: Db): number {
  const pages = db.get<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0;
  const free = db.get<{ freelist_count: number }>('PRAGMA freelist_count')?.freelist_count ?? 0;
  const size = db.get<{ page_size: number }>('PRAGMA page_size')?.page_size ?? 4096;
  return (pages - free) * size;
}
