import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';

export type Target =
  | { kind: 'path'; path: string; shown: string }
  | { kind: 'command'; text: string }
  | { kind: 'last' };

export interface Hit {
  sessionId: string;
  toolUseId: string;
  /** how many recorded actions matched; the latest is explained */
  total: number;
}

/** `last`, an existing or path-looking argument, or else text to find in a shell command. */
export function parseTarget(args: string[], cwd: string): Target {
  const text = args.join(' ').trim();
  if (!text) throw new ContrailError('Usage: contrail why <path | "command text" | last>');
  if (text === 'last') return { kind: 'last' };
  const abs = resolve(cwd, text);
  if (!/\s/.test(text) && (existsSync(abs) || /\/|\.[A-Za-z0-9]{1,8}$/.test(text))) return { kind: 'path', path: abs, shown: text };
  return { kind: 'command', text };
}

const WRITE_OR_EXTERNAL = `(tool_name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch') OR tool_name LIKE 'mcp%')`;

export function findTarget(db: Db, target: Target, repoKey: string): Hit {
  let rows: Array<{ sessionId: string; toolUseId: string }>;

  if (target.kind === 'path') {
    const real = existsSync(target.path) ? realpathSync(target.path) : target.path;
    rows = db.all(
      `SELECT e.session_id AS sessionId, e.tool_use_id AS toolUseId
         FROM touches t JOIN events e ON e.id = t.event_id
        WHERE t.kind = 'write' AND t.path IN (?, ?) AND e.tool_use_id IS NOT NULL
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
          AND instr(json_extract(payload, '$.tool_input.command'), ?) > 0
        ORDER BY captured_us DESC, spool_name DESC`,
      target.text,
    );
    if (!rows.length) throw new ContrailError(`No recorded shell command contains "${target.text}".`);
  } else {
    rows = db.all(
      `SELECT session_id AS sessionId, tool_use_id AS toolUseId FROM events
        WHERE hook_event = 'PreToolUse' AND repo_key = ? AND ${WRITE_OR_EXTERNAL}
        ORDER BY captured_us DESC, spool_name DESC LIMIT 1`,
      repoKey,
    );
    if (!rows.length) throw new ContrailError('No recorded actions in this repository yet.');
  }

  return { ...rows[0]!, total: rows.length };
}
