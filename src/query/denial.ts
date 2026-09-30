import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import type { Action } from '../engine/types.ts';
import { redactString } from '../ingest/redact.ts';
import type { Db } from '../store/sqlite.ts';
import { realPath } from '../util.ts';

/** Transcripts larger than this are not searched. */
const MAX_TRANSCRIPT = 256 * 1024 * 1024;

/**
 * A live call with no recorded result may have been denied at a permission prompt, which no hook
 * reports. Claude Code's own transcript of the session does record it: the denial's kind and the
 * message the model got. This reads that one fact back for one call. Only a regular .jsonl file
 * inside Claude Code's projects directory is read, whatever path a recorded event names.
 */
export function denialFor(db: Db, action: Action, projectsRoot: string): { kind: string; reason: string } | null {
  if (action.status !== 'pending') return null;
  const row = db.get<{ path: string | null }>(
    `SELECT json_extract(payload, '$.transcript_path') AS path FROM events
      WHERE session_id = ? AND source IS NULL AND json_extract(payload, '$.transcript_path') IS NOT NULL LIMIT 1`,
    action.scope.sessionId,
  );
  if (!row?.path) return null;
  const root = realPath(projectsRoot);
  const file = realPath(row.path);
  if (!file.startsWith(root + sep) || !file.endsWith('.jsonl')) return null;
  let text: string;
  try {
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const st = fstatSync(fd);
      if (!st.isFile() || st.size > MAX_TRANSCRIPT) return null;
      text = readFileSync(fd, 'utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
  const needle = `"tool_use_id":"${action.id}"`;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    const line = text.slice(text.lastIndexOf('\n', at) + 1, text.indexOf('\n', at) === -1 ? text.length : text.indexOf('\n', at));
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const kind = typeof entry.toolDenialKind === 'string' ? entry.toolDenialKind : null;
    if (!kind) continue;
    const content = (entry.message as { content?: unknown } | undefined)?.content;
    const block = Array.isArray(content) ? content.find(b => (b as { tool_use_id?: unknown })?.tool_use_id === action.id) : undefined;
    const body = (block as { content?: unknown } | undefined)?.content;
    const reason = typeof body === 'string' ? body : Array.isArray(body) ? body.map(b => (b as { text?: unknown })?.text).filter(t => typeof t === 'string').join(' ') : '';
    // Read from disk, never stored: redacted before it is shown, as anything recorded is.
    return { kind: kind.slice(0, 64), reason: redactString(reason.slice(0, 4000)) };
  }
  return null;
}
