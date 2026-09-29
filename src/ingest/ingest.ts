import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../store/sqlite.ts';
import { changedFiles, obj, str } from '../util.ts';
import { expectedShellEffects } from '../engine/effects.ts';
import { redactString, redactValue } from './redact.ts';

/** Longest string kept per field. Long enough to hold most files an agent reads, so lineage can match. */
export const STRING_CAP = 256 * 1024;
const STALE_TMP_MS = 60 * 60 * 1000;
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'NotebookRead']);

export interface IngestReport {
  ingested: number;
  duplicates: number;
  parseErrors: number;
  staleTmpRemoved: number;
}

interface Touch {
  path: string;
  kind: 'read' | 'write' | 'expected';
}

/**
 * Moves spool files into the events table: redact, cap, insert, then delete the file.
 * Idempotent (keyed by spool file name), so two ingests running at once are safe.
 */
export function ingest(db: Db, spoolDir: string, repoKeyOf: (cwd: string) => string, now = Date.now()): IngestReport {
  const report: IngestReport = { ingested: 0, duplicates: 0, parseErrors: 0, staleTmpRemoved: 0 };
  let names: string[];
  try {
    names = readdirSync(spoolDir).sort();
  } catch {
    return report;
  }

  for (const name of names) {
    const file = join(spoolDir, name);
    if (name.startsWith('.tmp.')) {
      if (removeIfStale(file, now)) report.staleTmpRemoved++;
      continue;
    }
    if (!name.endsWith('.json')) continue;

    let raw: string;
    let mtimeNs: bigint;
    try {
      mtimeNs = statSync(file, { bigint: true }).mtimeNs;
      raw = readFileSync(file, 'utf8');
    } catch {
      continue; // a concurrent ingest already took it
    }

    const capturedUs = Number(mtimeNs / 1000n);
    let row: Row;
    try {
      row = toRow(name, raw, capturedUs, repoKeyOf);
    } catch (e) {
      // Never let one bad payload block every later event: store the failure and move on.
      row = failedRow(capturedUs, `${name}: ${(e as Error).message}`);
    }
    if (row.parseError) report.parseErrors++;

    db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = db.run(
        `INSERT OR IGNORE INTO events
           (spool_name, captured_us, session_id, prompt_id, agent_id, hook_event, tool_name, tool_use_id, cwd, repo_key, payload, parse_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        name, row.capturedUs, row.sessionId, row.promptId, row.agentId, row.hookEvent,
        row.toolName, row.toolUseId, row.cwd, row.repoKey, row.payload, row.parseError,
      );
      if (inserted) {
        const id = db.get<{ id: number }>('SELECT id FROM events WHERE spool_name = ?', name)!.id;
        for (const t of row.touches) db.run('INSERT INTO touches (event_id, path, kind) VALUES (?, ?, ?)', id, t.path, t.kind);
        report.ingested++;
      } else {
        report.duplicates++;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    try {
      unlinkSync(file);
    } catch {
      // already removed by a concurrent ingest
    }
  }
  return report;
}

interface Row {
  capturedUs: number;
  sessionId: string | null;
  promptId: string | null;
  agentId: string | null;
  hookEvent: string;
  toolName: string | null;
  toolUseId: string | null;
  cwd: string | null;
  repoKey: string | null;
  payload: string;
  parseError: string | null;
  touches: Touch[];
}

function toRow(name: string, raw: string, capturedUs: number, repoKeyOf: (cwd: string) => string): Row {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ...failedRow(capturedUs, `${name}: ${(e as Error).message}`), payload: JSON.stringify({ raw: redactString(capString(raw)) }) };
  }

  const p = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed }) as Record<string, unknown>;
  const hookEvent = str(p, 'hook_event_name') ?? 'unknown';
  if (hookEvent === 'InstructionsLoaded') attachInstructionText(p, capturedUs);
  const cwd = str(p, 'cwd') ?? null;

  return {
    capturedUs,
    sessionId: str(p, 'session_id') ?? null,
    promptId: str(p, 'prompt_id') ?? null,
    agentId: str(p, 'agent_id') ?? null,
    hookEvent,
    toolName: str(p, 'tool_name') ?? null,
    toolUseId: str(p, 'tool_use_id') ?? null,
    cwd,
    repoKey: cwd ? repoKeyOf(cwd) : null,
    // Cap before redacting, so no pattern ever scans more than STRING_CAP characters.
    payload: JSON.stringify(redactValue(capValue(dropBulky(p)))),
    parseError: null,
    touches: hookEvent === 'PostToolUse' ? touchesOf(p, cwd ?? '') : [],
  };
}

function failedRow(capturedUs: number, parseError: string): Row {
  return {
    capturedUs, sessionId: null, promptId: null, agentId: null, hookEvent: 'unparsed', toolName: null,
    toolUseId: null, cwd: null, repoKey: null, touches: [], payload: '{}', parseError,
  };
}

/** Only the files InstructionsLoaded can name: CLAUDE.md, CLAUDE.local.md and .claude/rules/*.md. */
const INSTRUCTION_FILE = /(^|\/)CLAUDE(\.local)?\.md$|\/\.claude\/rules\/.+\.md$/i;

/**
 * The hook names the instruction file but not its text, so read it now, as close to load
 * time as we get. If it changed after it loaded (say the agent edited it), its current text
 * is not what the agent saw, so it is not kept.
 */
function attachInstructionText(p: Record<string, unknown>, capturedUs: number): void {
  const path = str(p, 'file_path');
  if (!path || !INSTRUCTION_FILE.test(path)) return;
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > STRING_CAP) {
      p._contrail = { skipped: st.isFile() ? 'larger than the storage cap' : 'not a regular file' };
      return;
    }
    const changedSinceLoad = st.mtimeMs * 1000 > capturedUs;
    const text = changedSinceLoad ? '' : readFileSync(path, 'utf8');
    p._contrail = { text, sha256: text ? sha256(text) : null, changedSinceLoad };
  } catch {
    p._contrail ??= { missing: true };
  }
}

function touchesOf(p: Record<string, unknown>, cwd: string): Touch[] {
  const tool = str(p, 'tool_name') ?? '';
  const input = obj(p, 'tool_input');
  const response = p.tool_response;
  if (WRITE_TOOLS.has(tool)) {
    const path = str(response, 'filePath') ?? str(input, 'file_path') ?? str(input, 'notebook_path');
    return path ? [{ path, kind: 'write' }] : [];
  }
  if (READ_TOOLS.has(tool)) {
    const path = str(input, 'file_path') ?? str(input, 'notebook_path');
    return path ? [{ path, kind: 'read' }] : [];
  }
  if (tool === 'Bash') {
    if (obj(response, 'bashEditDiff')) return changedFiles(response, cwd).map(path => ({ path, kind: 'write' }));
    return expectedShellEffects(str(input, 'command') ?? '', cwd)
      .filter(e => e.kind === 'file')
      .map(e => ({ path: e.target, kind: 'expected' }));
  }
  return [];
}

/** Drops content that is large and useless for provenance: Edit's copy of the whole old file, and base64 images. */
function dropBulky(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (key === 'originalFile' || key === 'base64') {
      return `[contrail: dropped ${key}, ${value.length} bytes, sha256 ${sha256(value).slice(0, 16)}]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => dropBulky(v));
  if (value && typeof value === 'object') {
    const isBase64Block = (value as Record<string, unknown>).type === 'base64';
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, dropBulky(v, isBase64Block && k === 'data' ? 'base64' : k)]),
    );
  }
  return value;
}

function capValue(value: unknown): unknown {
  if (typeof value === 'string') return capString(value);
  if (Array.isArray(value)) return value.map(capValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, capValue(v)]));
  }
  return value;
}

function capString(s: string): string {
  return s.length <= STRING_CAP ? s : `${s.slice(0, STRING_CAP)}\n…[contrail: truncated ${s.length - STRING_CAP} bytes]`;
}

function removeIfStale(file: string, now: number): boolean {
  try {
    if (now - statSync(file).mtimeMs < STALE_TMP_MS) return false;
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
