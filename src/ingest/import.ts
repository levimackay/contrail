import { closeSync, fstatSync, lstatSync, readdirSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { ContrailError } from '../errors.ts';
import { liveBytes } from '../store/retention.ts';
import type { Db } from '../store/sqlite.ts';
import { str } from '../util.ts';
import type { Hmac } from './content.ts';
import { insertRow, stored, type Row } from './ingest.ts';
import { openRegular, readLines, TranscriptStream, type TranscriptEvent, type TranscriptStats } from './transcript.ts';

/**
 * contrail import: sessions from before Contrail was installed, rebuilt from Claude Code's own
 * transcripts and stored through the same redact, cap and hash path as ingest. Every row is
 * marked source = 'transcript', so reports can say so. A session Contrail recorded live is
 * never touched, and importing twice stores nothing new.
 */

/** One session's transcript files: the main thread and each subagent's. */
export interface SessionFiles {
  sessionId: string;
  file: string;
  mtimeMs: number;
  subagents: Array<{ file: string; agentId: string; agentType: string | null }>;
}

export type SessionStatus = 'imported' | 'recorded' | 'imported-before' | 'older' | 'expired' | 'empty' | 'unparseable' | 'duplicate' | 'full';

export interface SessionResult {
  sessionId: string;
  file: string;
  cwd: string | null;
  status: SessionStatus;
  /** events stored (or, in a dry run, that would be) */
  events: number;
  lastUs: number | null;
}

export interface ImportSummary {
  /** sessions whose transcripts belong to the chosen project */
  found: number;
  sessions: SessionResult[];
  stats: TranscriptStats;
}

export interface ImportOptions {
  /** which sessions belong: by the working directory the transcript recorded (null: none readable) */
  belongs: (cwd: string | null) => boolean;
  /** skip sessions last active before this (µs since the epoch) */
  sinceUs: number | null;
  /** sessions last active before this would be removed by retention at once, so they are skipped */
  retentionUs: number;
  /** the database's size cap (max_db_mb): once reached, nothing more is imported */
  maxBytes?: number;
  dryRun: boolean;
  repoKeyOf: (cwd: string) => string;
  hmac?: Hmac;
}

const UNIT_MS: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** --since: a date (2026-09-01, or a full ISO time) or a duration back from now (12h, 30d, 2w). Milliseconds. */
export function parseSince(value: string, nowMs: number): number {
  const v = value.trim();
  const d = /^(\d{1,6})([hdw])$/i.exec(v);
  if (d) return nowMs - Number(d[1]) * UNIT_MS[d[2]!.toLowerCase()]!;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return ms;
  }
  throw new ContrailError('--since takes a date such as 2026-09-01, or a duration back from now such as 12h, 30d or 2w.');
}

/** Where Claude Code keeps transcripts: $CLAUDE_CONFIG_DIR/projects, or ~/.claude/projects. */
export function projectsRoot(env: NodeJS.ProcessEnv, home: string): string {
  return join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'projects');
}

const SESSION_FILE = /^[\w-]{1,128}\.jsonl$/;

/** Every session transcript under the projects folder (or one project folder), with its subagents. */
export function listSessions(root: string, folder?: string): SessionFiles[] {
  const folders = folder ? [folder] : entries(root).map(name => join(root, name));
  const out: SessionFiles[] = [];
  for (const dir of folders) {
    for (const name of entries(dir)) {
      // Claude Code names a transcript by its session id, a UUID; anything else is not one of its sessions.
      if (!SESSION_FILE.test(name)) continue;
      const file = join(dir, name);
      const st = regularFile(file);
      if (!st) continue;
      const sessionId = name.slice(0, -'.jsonl'.length);
      const subDir = join(dir, sessionId, 'subagents');
      const subagents = entries(subDir)
        .filter(n => /^agent-[\w-]{1,128}\.jsonl$/.test(n) && regularFile(join(subDir, n)))
        .map(n => {
          const agentId = n.slice('agent-'.length, -'.jsonl'.length);
          return { file: join(subDir, n), agentId, agentType: agentTypeOf(join(subDir, `agent-${agentId}.meta.json`)) };
        });
      out.push({ sessionId, file, mtimeMs: st.mtimeMs, subagents });
    }
  }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs || a.file.localeCompare(b.file));
}

/** Imports every session that belongs, oldest first. */
export async function importSessions(db: Db | null, files: SessionFiles[], o: ImportOptions): Promise<ImportSummary> {
  const summary: ImportSummary = { found: 0, sessions: [], stats: { entries: 0, malformed: 0, unknown: 0, skipped: 0 } };
  const done = new Set<string>();
  for (const f of files) {
    const cwd = firstCwd(f.file);
    // A file with no readable working directory belongs to no repository, but to every folder.
    if (cwd === null ? !o.belongs(null) : !o.belongs(cwd)) continue;
    summary.found++;
    const result: SessionResult = { sessionId: f.sessionId, file: f.file, cwd, status: 'imported', events: 0, lastUs: null };
    summary.sessions.push(result);
    if (cwd === null) {
      result.status = 'unparseable';
      continue;
    }
    const lastUs = f.mtimeMs * 1000;
    if (done.has(f.sessionId)) result.status = 'duplicate';
    else if (lastUs < o.retentionUs) result.status = 'expired';
    else if (o.sinceUs !== null && lastUs < o.sinceUs) result.status = 'older';
    else if (db && recordedLive(db, f.sessionId)) result.status = 'recorded';
    if (result.status !== 'imported') continue;
    done.add(f.sessionId);

    const parsed = await parseSession(f, o.hmac);
    for (const k of Object.keys(summary.stats) as Array<keyof TranscriptStats>) summary.stats[k] += parsed.stats[k];
    result.lastUs = parsed.events.reduce((max, e) => Math.max(max, e.us), 0) || null;
    if (!parsed.events.length) {
      result.status = parsed.stats.entries ? 'empty' : 'unparseable';
      continue;
    }
    if (result.lastUs !== null && result.lastUs < o.retentionUs) {
      result.status = 'expired';
      continue;
    }
    if (o.sinceUs !== null && result.lastUs !== null && result.lastUs < o.sinceUs) {
      result.status = 'older';
      continue;
    }
    if (o.dryRun || !db) {
      result.events = db ? parsed.events.filter(e => !isStored(db, name(f.sessionId, e))).length : parsed.events.length;
      if (!result.events) result.status = 'imported-before';
      continue;
    }
    // Past the size cap, retention would make room by removing the oldest sessions, which may be
    // ones recorded live: an import never pushes those out.
    if (o.maxBytes !== undefined && liveBytes(db) >= o.maxBytes) {
      result.status = 'full';
      continue;
    }
    const stored = store(db, f.sessionId, parsed.events, o.repoKeyOf);
    if (stored === null) result.status = 'recorded';
    else if (stored === 0) result.status = 'imported-before';
    else result.events = stored;
  }
  return summary;
}

/** Reads a session's files into events, the main thread first, then each subagent. */
export async function parseSession(f: SessionFiles, hmac?: Hmac): Promise<{ events: TranscriptEvent[]; stats: TranscriptStats }> {
  const keep = (p: Record<string, unknown>, hook: string) => stored(p, hook, hmac) as Record<string, unknown>;
  const streams = [new TranscriptStream(f.sessionId, null, null, keep)];
  const files = [f.file];
  for (const s of f.subagents) {
    streams.push(new TranscriptStream(f.sessionId, s.agentId, s.agentType, keep));
    files.push(s.file);
  }
  const stats: TranscriptStats = { entries: 0, malformed: 0, unknown: 0, skipped: 0 };
  const events: TranscriptEvent[] = [];
  for (const [i, stream] of streams.entries()) {
    try {
      for await (const line of readLines(files[i]!)) stream.line(line);
    } catch {
      stats.malformed++; // unreadable part way: keep what was read
    }
    stream.end();
    for (const k of Object.keys(stats) as Array<keyof TranscriptStats>) stats[k] += stream.stats[k];
    events.push(...stream.events);
  }
  return { events, stats };
}

/** The spool name of an imported event: unique, and the same each time the transcript is read. */
const name = (sessionId: string, e: TranscriptEvent) => `transcript:${sessionId}:${e.key}`;

const isStored = (db: Db, spoolName: string) => Boolean(db.get('SELECT 1 FROM events WHERE spool_name = ?', spoolName));

/** Whether any hook recorded this session live. Such a session is never mixed with a transcript. */
export function recordedLive(db: Db, sessionId: string): boolean {
  try {
    return Boolean(db.get('SELECT 1 FROM events WHERE session_id = ? AND source IS NULL LIMIT 1', sessionId));
  } catch {
    // A dry run reads the database as it is; before schema v3 every event came from a hook.
    return Boolean(db.get('SELECT 1 FROM events WHERE session_id = ? LIMIT 1', sessionId));
  }
}

const CHUNK = 500;

/**
 * Stores a session's events in transactions of CHUNK rows, so a long import never holds the
 * write lock long enough to stall the hooks' own ingest. Returns how many rows were new, or
 * null when a hook started recording the session meanwhile (then nothing more is stored).
 */
function store(db: Db, sessionId: string, events: TranscriptEvent[], repoKeyOf: (cwd: string) => string): number | null {
  let added = 0;
  for (let i = 0; i < events.length; i += CHUNK) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (recordedLive(db, sessionId)) {
        db.exec('ROLLBACK');
        return null;
      }
      for (const e of events.slice(i, i + CHUNK)) {
        const row: Row = {
          capturedUs: e.us, sessionId, promptId: e.promptId, agentId: e.agentId, hookEvent: e.hook, toolName: e.toolName,
          toolUseId: e.toolUseId, cwd: e.cwd, repoKey: e.cwd ? repoKeyOf(e.cwd) : null, payload: JSON.stringify(e.payload),
          parseError: null, touches: e.touches,
        };
        if (insertRow(db, name(sessionId, e), row, 'transcript')) added++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return added;
}

/**
 * The working directory a transcript recorded, from its first entries: which project a session
 * belongs to. Reads at most 4 MB, in pieces, and never the whole file. Null when there is none.
 */
export function firstCwd(file: string, limit = 4 * 1024 * 1024): string | null {
  let fd: number;
  try {
    fd = openRegular(file);
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(64 * 1024);
    let text = '';
    for (let read = 0; read < limit; ) {
      const n = readSync(fd, buf, 0, buf.length, read);
      if (n <= 0) break;
      read += n;
      text += buf.toString('utf8', 0, n);
      let nl: number;
      while ((nl = text.indexOf('\n')) >= 0) {
        const line = text.slice(0, nl);
        text = text.slice(nl + 1);
        const cwd = cwdOf(line);
        if (cwd) return cwd;
      }
    }
    return cwdOf(text);
  } finally {
    closeSync(fd);
  }
}

function cwdOf(line: string): string | null {
  if (!line.includes('"cwd"')) return null;
  try {
    return str(JSON.parse(line), 'cwd') ?? null;
  } catch {
    return null;
  }
}

/** The subagent's type, from the small meta file Claude Code writes beside its transcript. */
function agentTypeOf(meta: string): string | null {
  let fd: number;
  try {
    fd = openRegular(meta);
  } catch {
    return null;
  }
  try {
    if (fstatSync(fd).size > 64 * 1024) return null;
    return str(JSON.parse(readFileSync(fd, 'utf8')), 'agentType') ?? null;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** A regular file, not followed through a symlink. */
function regularFile(path: string): { mtimeMs: number } | null {
  try {
    const st = lstatSync(path);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}
