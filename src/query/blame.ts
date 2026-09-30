import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { blameLines, splitLines, writtenText, type BlameWrite, type LineBlame } from '../engine/blame.ts';
import { explain } from '../engine/explain.ts';
import type { Action, Explanation, Graph } from '../engine/types.ts';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';
import { obj, realPath } from '../util.ts';
import { loadGraph } from './sessions.ts';

/** The newest recorded writes to one file that are read; older ones are counted, not read. */
export const MAX_WRITES = 500;
/** Credited calls whose sessions are loaded and explained; the rest are listed without a trail. */
export const MAX_TRAILS = 60;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface BlameCall {
  id: string;
  sessionId: string;
  /** when the write finished, microseconds since the epoch */
  us: number;
  tool: string;
  /** false: a shell write expected from the command, not reported by Claude Code (R6) */
  observed: boolean;
  /** set once its session is loaded */
  action?: Action;
  graph?: Graph;
  explanation?: Explanation;
}

export interface Blame {
  /** the real path of the file */
  path: string;
  lines: LineBlame[];
  /** the calls credited with at least one line, newest first */
  calls: BlameCall[];
  /** recorded agent writes to this file, and how many of them were read (the newest MAX_WRITES) */
  writes: number;
  read: number;
  /** writes read whose record holds no written text for this file (a shell command other than a heredoc), and the newest */
  textless: number;
  latestTextless: { id: string; tool: string } | null;
  /** only this session's writes were considered */
  session: string | null;
}

interface WriteRow {
  eventId: number;
  sessionId: string;
  toolUseId: string;
  tool: string;
  us: number;
  spool: string;
  cwd: string | null;
  path: string;
  kind: 'write' | 'expected';
}

/** The file's text as it is now: a regular text file, small enough to read whole. */
export function readCurrent(path: string, shown: string): string {
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) throw new ContrailError(`${shown} is not a regular file.`);
    size = st.size;
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`No file ${shown}. Blame reads the file as it is now on disk.`);
  }
  if (size > MAX_FILE_BYTES) throw new ContrailError(`${shown} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB; blame reads text files up to that size.`);
  const text = readFileSync(path, 'utf8');
  if (text.includes('\u0000')) throw new ContrailError(`${shown} looks binary; blame matches lines of text.`);
  return text;
}

/**
 * Every line of a file as it is now, credited to the latest recorded agent write whose text
 * holds it, across all sessions (or one). Reads the recorded writes to this file only, found
 * through the touches table and joined on real paths, newest first.
 */
export function blameFile(db: Db, path: string, shown: string, session: string | null = null): Blame {
  const real = realPath(path);
  const text = readCurrent(real, shown);
  const rows = writesTo(db, path, real, session);
  if (!rows.length) {
    const where = session ? ` in session ${session.slice(0, 8)}` : '';
    throw new ContrailError(
      `No recorded agent write to ${shown}${where}. Contrail sees Edit, Write, MultiEdit and NotebookEdit calls, and shell heredocs, in sessions recorded since it was installed and earlier ones brought in with contrail import.`,
    );
  }

  const notebook = real.endsWith('.ipynb');
  const isThisFile = (p: string) => realPath(p) === real;
  const writes: BlameWrite[] = [];
  const byId = new Map<string, WriteRow>();
  const textless: WriteRow[] = [];
  for (const row of rows.slice(0, MAX_WRITES)) {
    const payload = db.get<{ payload: string }>('SELECT payload FROM events WHERE id = ?', row.eventId)?.payload ?? '{}';
    let input: Record<string, unknown> = {};
    try {
      input = obj(JSON.parse(payload), 'tool_input') ?? {};
    } catch {
      continue;
    }
    const written = writtenText(row.tool, input, isThisFile, row.cwd ?? '', notebook);
    if (!written) {
      textless.push(row);
      continue;
    }
    writes.push({ id: row.toolUseId, at: row.us, tiebreak: row.spool, text: written, observed: row.kind === 'write' });
    byId.set(row.toolUseId, row);
  }

  const lines = blameLines(splitLines(text), writes, notebook);
  const credited = new Set(lines.map(l => l.call).filter((c): c is string => c !== null));
  const calls = [...credited]
    .map(id => byId.get(id)!)
    .sort((a, b) => b.us - a.us)
    .map(r => ({ id: r.toolUseId, sessionId: r.sessionId, us: r.us, tool: r.tool, observed: r.kind === 'write' }));
  const latest = textless[0];
  return {
    path: real,
    lines,
    calls,
    writes: rows.length,
    read: Math.min(rows.length, MAX_WRITES),
    textless: textless.length,
    latestTextless: latest ? { id: latest.toolUseId, tool: latest.tool } : null,
    session,
  };
}

/** The recorded writes to a file, newest first, one per call. */
function writesTo(db: Db, path: string, real: string, session: string | null): WriteRow[] {
  const tails = [...new Set([`/${basename(real)}`, `/${basename(path)}`])];
  const rows = db.all<WriteRow>(
    `SELECT e.id AS eventId, e.session_id AS sessionId, e.tool_use_id AS toolUseId, e.tool_name AS tool,
            e.captured_us AS us, e.spool_name AS spool, e.cwd AS cwd, t.path AS path, t.kind AS kind
       FROM touches t JOIN events e ON e.id = t.event_id
      WHERE t.kind IN ('write', 'expected') AND e.tool_use_id IS NOT NULL AND e.session_id IS NOT NULL
        AND (t.path IN (?, ?) ${tails.map(() => 'OR substr(t.path, -?) = ?').join(' ')})
        ${session ? 'AND e.session_id = ?' : ''}
      ORDER BY e.captured_us DESC, e.spool_name DESC`,
    path,
    real,
    ...tails.flatMap(t => [t.length, t]),
    ...(session ? [session] : []),
  );
  const reals = new Map<string, string>();
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.toolUseId)) return false;
    const rp = reals.get(r.path) ?? reals.set(r.path, realPath(r.path)).get(r.path)!;
    if (rp !== real) return false;
    seen.add(r.toolUseId);
    return true;
  });
}

/**
 * Loads the sessions of the credited calls, newest first, and explains each call, up to
 * MAX_TRAILS calls: only the calls that matter, never every action in those sessions.
 */
export function explainCalls(db: Db, blame: Blame, home: string, hashToken?: (span: string) => string): void {
  const graphs = new Map<string, Graph>();
  let explained = 0;
  for (const call of blame.calls) {
    if (explained >= MAX_TRAILS) break;
    const graph = graphs.get(call.sessionId) ?? graphs.set(call.sessionId, loadGraph(db, call.sessionId, home, hashToken)).get(call.sessionId)!;
    const action = graph.actions.find(a => a.id === call.id);
    if (!action) continue;
    call.action = action;
    call.graph = graph;
    call.explanation = explain(action.id, graph);
    explained++;
  }
}
