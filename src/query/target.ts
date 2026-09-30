import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';

export type Target =
  | { kind: 'path'; path: string; shown: string }
  | { kind: 'command'; text: string }
  | { kind: 'call'; prefix: string; suffix: string; shown: string }
  /** a line or range of a file as it is now: file.ts:42 or file.ts:40-48 */
  | { kind: 'line'; path: string; shown: string; start: number; end: number }
  | { kind: 'last' };

export interface Hit {
  sessionId: string;
  toolUseId: string;
  /** how many recorded actions matched; the latest is explained */
  total: number;
}

/**
 * A call id as reports print it (toolu…ALhq1, or toolu...ALhq1 where … is awkward to type) or in
 * full (toolu_01…); both halves are id characters only.
 */
const SHORT_CALL = /^([A-Za-z0-9_-]{1,40})(?:…|\.\.\.)([A-Za-z0-9_-]{1,40})$/;
const FULL_CALL = /^toolu_[A-Za-z0-9_-]{8,200}$/;

/** file.ts:42 or file.ts:40-48: a path, then a line or a range. */
const LINE_SUFFIX = /^(\S{1,4096}):(\d{1,9})(?:-(\d{1,9}))?$/;
const PATH_LIKE = /\/|\.[A-Za-z0-9]{1,8}$/;

/**
 * `last`, a call id, an existing or path-looking argument, a path with a line (file.ts:42), or
 * else text to find in a shell command. A file whose name really ends in :42 stays a path.
 */
export function parseTarget(args: string[], cwd: string): Target {
  const text = unquote(args.join(' ').trim());
  // Nothing named: the question is almost always about what just happened.
  if (!text || text === 'last') return { kind: 'last' };
  const abs = resolve(cwd, text);
  const short = SHORT_CALL.exec(text);
  if (short && !existsSync(abs)) return { kind: 'call', prefix: short[1]!, suffix: short[2]!, shown: text };
  if (FULL_CALL.test(text) && !existsSync(abs)) return { kind: 'call', prefix: text, suffix: '', shown: text };
  // A URL is a value to look for, never a path or a line.
  if (/^[a-z][a-z0-9+.-]{0,20}:\/\//i.test(text)) return { kind: 'command', text };
  const line = LINE_SUFFIX.exec(text);
  if (line && !existsSync(abs) && (existsSync(resolve(cwd, line[1]!)) || PATH_LIKE.test(line[1]!))) {
    const start = Number(line[2]);
    const end = line[3] ? Number(line[3]) : start;
    if (start < 1 || end < start) throw new ContrailError(`"${text}" is not a line range: lines start at 1, and a range runs low to high.`);
    return { kind: 'line', path: resolve(cwd, line[1]!), shown: line[1]!, start, end };
  }
  if (!/\s/.test(text) && (existsSync(abs) || PATH_LIKE.test(text))) return { kind: 'path', path: abs, shown: text };
  return { kind: 'command', text };
}

/** Text typed through the skill arrives with its quotes: "npm install foo" → npm install foo. */
export function unquote(s: string): string {
  const m = /^(["'])(.*)\1$/s.exec(s);
  return m ? m[2]!.trim() : s;
}

const WRITE_OR_EXTERNAL = `(tool_name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch') OR tool_name LIKE 'mcp%')`;

/** Contrail's own queries, run by the agent through Bash, must never answer themselves. */
const COMMAND = `COALESCE(json_extract(payload, '$.tool_input.command'), '')`;
const NOT_CONTRAIL = `NOT (${COMMAND} LIKE '%bin/contrail%' OR ${COMMAND} LIKE 'contrail %')`;

export function findTarget(db: Db, target: Exclude<Target, { kind: 'line' }>, repoKey: string): Hit {
  let rows: Array<{ sessionId: string; toolUseId: string }>;

  if (target.kind === 'path') {
    const real = existsSync(target.path) ? realpathSync(target.path) : target.path;
    rows = db.all(
      `SELECT e.session_id AS sessionId, e.tool_use_id AS toolUseId
         FROM touches t JOIN events e ON e.id = t.event_id
        WHERE t.kind IN ('write', 'expected') AND t.path IN (?, ?) AND e.tool_use_id IS NOT NULL
        ORDER BY e.captured_us DESC, e.spool_name DESC`,
      target.path, real,
    );
    if (!rows.length) {
      throw new ContrailError(`No recorded agent change to ${target.shown}. Contrail only sees sessions recorded since it was installed.`);
    }
  } else if (target.kind === 'command') {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND tool_name = 'Bash'
          AND instr(${COMMAND}, ?) > 0 AND ${NOT_CONTRAIL}
        ORDER BY captured_us DESC, spool_name DESC`,
      target.text,
    );
    if (!rows.length) throw new ContrailError(`No recorded shell command contains "${target.text}".`);
  } else if (target.kind === 'call') {
    // Any tool, any repository: a call id names one call wherever it ran.
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND substr(tool_use_id, 1, ?) = ? AND length(tool_use_id) >= ?
          AND (? = '' OR substr(tool_use_id, -?) = ?)
        ORDER BY captured_us DESC, spool_name DESC`,
      target.prefix.length, target.prefix, target.prefix.length + target.suffix.length,
      target.suffix, target.suffix.length, target.suffix,
    );
    if (!rows.length) throw new ContrailError(`No recorded tool call ${target.shown}.`);
  } else {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND repo_key = ? AND ${WRITE_OR_EXTERNAL} AND ${NOT_CONTRAIL}
        ORDER BY captured_us DESC, spool_name DESC LIMIT 1`,
      repoKey,
    );
    if (!rows.length) throw new ContrailError('No recorded actions in this repository yet.');
  }

  return { ...rows[0]!, total: rows.length };
}
