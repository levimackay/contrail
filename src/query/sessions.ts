import { basename } from 'node:path';
import { ContrailError } from '../errors.ts';
import { buildGraph, type EventRow } from '../graph/build.ts';
import type { Graph } from '../engine/types.ts';
import type { Db } from '../store/sqlite.ts';

export interface SessionRow {
  id: string;
  lastUs: number;
  cwd: string;
}

/** Most recent sessions, in this repository when it has any, otherwise anywhere. */
export function recentSessions(db: Db, repoKey: string, limit: number, all = false): SessionRow[] {
  const query = (where: string, ...params: Array<string | number>) =>
    db.all<SessionRow>(
      `SELECT session_id AS id, MAX(captured_us) AS lastUs, MAX(cwd) AS cwd FROM events
        WHERE session_id IS NOT NULL ${where}
        GROUP BY session_id ORDER BY lastUs DESC LIMIT ?`,
      ...params,
      limit,
    );
  if (all) return query('');
  const here = query('AND session_id IN (SELECT DISTINCT session_id FROM events WHERE repo_key = ?)', repoKey);
  return here.length ? here : query('');
}

/** A session by id prefix, or the latest one here when none is given. */
export function pickSession(db: Db, prefix: string | undefined, repoKey: string): string {
  if (!prefix || prefix === 'last') {
    const [latest] = recentSessions(db, repoKey, 1);
    if (!latest) throw new ContrailError('No sessions recorded yet. Use Claude Code with the plugin enabled, then try again.');
    return latest.id;
  }
  const matches = db.all<{ id: string }>(
    "SELECT DISTINCT session_id AS id FROM events WHERE session_id LIKE ? || '%' LIMIT 5",
    prefix,
  );
  if (matches.length === 1) return matches[0]!.id;
  if (!matches.length) throw new ContrailError(`No session starts with "${prefix}". Run contrail sessions to list them.`);
  throw new ContrailError(`"${prefix}" matches several sessions:\n${matches.map(m => `  ${m.id}`).join('\n')}\nUse more characters.`);
}

export function loadRows(db: Db, sessionId: string): EventRow[] {
  return db.all<EventRow>('SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name', sessionId);
}

export function loadGraph(db: Db, sessionId: string, home: string): Graph {
  return buildGraph(loadRows(db, sessionId), { home, user: basename(home) });
}
