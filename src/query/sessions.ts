import { clip } from '../util.ts';
import { basename } from 'node:path';
import { ContrailError } from '../errors.ts';
import { buildGraph, TEXT_RESULT_TOOLS, type EventRow } from '../graph/build.ts';
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
  if (!matches.length) throw new ContrailError(`No session starts with "${clip(prefix, 60)}". Run contrail sessions to list them.`);
  throw new ContrailError(`"${clip(prefix, 60)}" matches several sessions:\n${matches.map(m => `  ${clip(m.id, 80)}`).join('\n')}\nUse more characters.`);
}

/** Results the graph may only need as text: their payloads can wait (see loadRows). Never NULL. */
const TEXT_RESULTS = `IFNULL(hook_event = 'PostToolUse' AND (tool_name IN (${TEXT_RESULT_TOOLS.map(t => `'${t}'`).join(', ')}) OR substr(tool_name, 1, 5) = 'mcp__'), 0)`;

/**
 * A session's events in order. With `later`, the payloads of results the graph may only need as
 * text (a Read, a search, a web page) are read from the database the first time something reads
 * them, while the database is open: when the model's own copy of that text was recorded, building
 * the graph never does, and turning those strings into JavaScript is much of a query's time.
 */
export function loadRows(db: Db, sessionId: string, { later = false } = {}): EventRow[] {
  if (!later) return db.all<EventRow>('SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name', sessionId);
  // The same rows in the same order; a stored payload is never NULL, so NULL marks one that waits.
  // The second SELECT lists the table's columns in order, so a migration that adds one adds it there.
  const rows = db.all<Omit<EventRow, 'payload'> & { payload: string | null }>(
    `SELECT * FROM events WHERE session_id = ? AND NOT ${TEXT_RESULTS}
     UNION ALL
     SELECT id, spool_name, captured_us, session_id, prompt_id, agent_id, hook_event, tool_name, tool_use_id, cwd, repo_key, NULL, parse_error
       FROM events WHERE session_id = ?1 AND ${TEXT_RESULTS}
     ORDER BY captured_us, spool_name`,
    sessionId,
  );
  return rows.map(r => {
    const row = r as EventRow;
    if (r.payload === null) readLater(db, row);
    return row;
  });
}

function readLater(db: Db, row: EventRow): void {
  const settle = (payload: string) => {
    Object.defineProperty(row, 'payload', { value: payload, writable: true, enumerable: true, configurable: true });
    return payload;
  };
  Object.defineProperty(row, 'payload', {
    enumerable: true,
    configurable: true,
    get: () => {
      const stored = db.get<{ payload: string }>('SELECT payload FROM events WHERE id = ?', row.id);
      if (!stored) throw new ContrailError('This session changed while it was being read. Run the command again.');
      return settle(stored.payload);
    },
    set: settle,
  });
  row.payloadLater = true;
}

export function loadGraph(db: Db, sessionId: string, home: string, hashToken?: (span: string) => string): Graph {
  return buildGraph(loadRows(db, sessionId, { later: true }), { home, user: basename(home) }, hashToken);
}
