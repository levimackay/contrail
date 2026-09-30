import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { commitByTime, parseCommitSha } from '../engine/effects.ts';
import type { Commit } from '../engine/types.ts';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';
import { str, toText } from '../util.ts';

export interface CommitHit {
  sessionId: string;
  toolUseId: string;
  cwd: string;
  commit: Commit;
  /** stdout: git printed the commit line (R1, DIRECT). time: joined on git's commit time (R9, LIKELY). */
  via: 'stdout' | 'time';
  /** the second git dated the commit, when joined on time */
  commitSec?: number;
}

/**
 * The recorded shell command that made a commit. First, git's own "[branch sha] subject"
 * line on its stdout (either sha may be the longer one: git prints 7+ characters, you may
 * paste all 40). When git printed none, as with `git commit -q`, ask git in `cwd` when it
 * dated the commit and look for the one recorded git commit running at that second.
 */
export function findCommit(db: Db, sha: string, cwd?: string, repoKey?: string): CommitHit {
  const wanted = sha.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(wanted)) throw new ContrailError(`"${sha}" is not a commit sha (7 to 40 hex characters).`);
  const rows = db.all<{ sessionId: string; toolUseId: string; cwd: string; payload: string }>(
    `SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, payload FROM events
      WHERE hook_event = 'PostToolUse' AND tool_name = 'Bash' AND instr(payload, ?) > 0
      ORDER BY captured_us DESC`,
    wanted.slice(0, 7),
  );
  for (const row of rows) {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const commit = parseCommitSha(str(p.tool_input, 'command') ?? '', str(p.tool_response, 'stdout') ?? toText(p.tool_response));
    if (commit && (wanted.startsWith(commit.sha) || commit.sha.startsWith(wanted))) {
      return { sessionId: row.sessionId, toolUseId: row.toolUseId, cwd: row.cwd, commit, via: 'stdout' };
    }
  }

  const info = cwd ? commitInfo(cwd, wanted) : null;
  if (info) {
    const { match, candidates } = commitByTime(info.sec, bashCallsBetween(db, info.sec * 1e6 - WINDOW_US, info.sec * 1e6 + WINDOW_US, repoKey));
    if (match) return { sessionId: match.sessionId, toolUseId: match.toolUseId, cwd: match.cwd, commit: info.commit, via: 'time', commitSec: info.sec };
    if (candidates > 1) {
      throw new ContrailError(`${candidates} recorded git commits were running when git dated commit ${sha}, and git printed no commit line, so Contrail cannot tell which one made it.`);
    }
  }
  throw new ContrailError(`No recorded agent action made commit ${sha}. Contrail sees commits made by Claude Code through its shell tool.`);
}

/** How far from git's commit second to look for the recorded command that made it. */
const WINDOW_US = 3600 * 1e6;

interface BashCall {
  sessionId: string;
  toolUseId: string;
  cwd: string;
  command: string;
  preUs: number;
  postUs: number;
}

/** True of a shell command that might commit; runsGitCommit decides. Bounds the rows read. */
const MIGHT_COMMIT = `(command LIKE '%commit%' OR command LIKE '%merge%' OR command LIKE '%cherry-pick%' OR command LIKE '%revert%')`;

/** Recorded shell calls with both hooks between two times, optionally only those that might commit. */
function bashCallsBetween(db: Db, fromUs: number, toUs: number, repoKey?: string, mightCommit = false): BashCall[] {
  const rows = db.all<{ sessionId: string; toolUseId: string; cwd: string; hook: string; us: number; command: string | null }>(
    `SELECT * FROM (
       SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, hook_event AS hook, captured_us AS us,
              json_extract(payload, '$.tool_input.command') AS command
         FROM events
        WHERE tool_name = 'Bash' AND hook_event IN ('PreToolUse', 'PostToolUse', 'PostToolUseFailure')
          AND captured_us BETWEEN ? AND ? ${repoKey ? 'AND repo_key = ?' : ''}
     ) ${mightCommit ? `WHERE ${MIGHT_COMMIT}` : ''}`,
    fromUs,
    toUs,
    ...(repoKey ? [repoKey] : []),
  );
  const byId = new Map<string, BashCall>();
  for (const e of rows) {
    const c = byId.get(e.toolUseId) ?? { sessionId: e.sessionId, toolUseId: e.toolUseId, cwd: e.cwd, command: '', preUs: 0, postUs: 0 };
    if (e.hook === 'PreToolUse') c.preUs = e.us;
    else c.postUs = e.us;
    c.command ||= e.command ?? '';
    byId.set(e.toolUseId, c);
  }
  return [...byId.values()].filter(c => c.preUs && c.postUs);
}

export type CommitJoin =
  | { kind: 'joined'; sessionId: string; toolUseId: string; via: 'stdout' | 'time' }
  | { kind: 'ambiguous'; candidates: number }
  | { kind: 'none' };

/**
 * findCommit for many commits at once, with bounded reads: each commit is joined to the recorded
 * shell command whose output was git's commit line (R1), or else to the one git commit running
 * in the second git dated it (R9). Only commands recorded in this repository from `sinceSec`
 * (or the earliest commit's date) to shortly after the newest commit are read.
 */
export function joinCommits(db: Db, commits: Array<{ sha: string; sec: number }>, repoKey: string, sinceSec?: number): Map<string, CommitJoin> {
  const joins = new Map<string, CommitJoin>();
  if (!commits.length) return joins;
  const fromUs = Math.min(sinceSec ?? Infinity, ...commits.map(c => c.sec)) * 1e6 - WINDOW_US;
  const toUs = Math.max(...commits.map(c => c.sec)) * 1e6 + WINDOW_US;

  const printed = db.all<{ sessionId: string; toolUseId: string; command: string | null; payload: string }>(
    `SELECT * FROM (
       SELECT session_id AS sessionId, tool_use_id AS toolUseId, json_extract(payload, '$.tool_input.command') AS command,
              payload, captured_us AS us
         FROM events
        WHERE hook_event = 'PostToolUse' AND tool_name = 'Bash' AND repo_key = ? AND captured_us BETWEEN ? AND ?
     ) WHERE ${MIGHT_COMMIT} ORDER BY us DESC`,
    repoKey,
    fromUs,
    toUs,
  );
  // Newest first, so the command that printed a sha most recently wins.
  const byPrefix = new Map<string, Array<{ sha: string; sessionId: string; toolUseId: string }>>();
  for (const row of printed) {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const made = parseCommitSha(row.command ?? '', str(p.tool_response, 'stdout') ?? toText(p.tool_response));
    if (!made) continue;
    const key = made.sha.slice(0, 7).toLowerCase();
    byPrefix.set(key, [...(byPrefix.get(key) ?? []), { sha: made.sha.toLowerCase(), sessionId: row.sessionId, toolUseId: row.toolUseId }]);
  }

  let calls: BashCall[] | null = null;
  for (const c of commits) {
    const sha = c.sha.toLowerCase();
    const hit = byPrefix.get(sha.slice(0, 7))?.find(h => sha.startsWith(h.sha));
    if (hit) {
      joins.set(c.sha, { kind: 'joined', sessionId: hit.sessionId, toolUseId: hit.toolUseId, via: 'stdout' });
      continue;
    }
    calls ??= bashCallsBetween(db, fromUs, toUs, repoKey, true);
    const { match, candidates } = commitByTime(c.sec, calls);
    joins.set(
      c.sha,
      match
        ? { kind: 'joined', sessionId: match.sessionId, toolUseId: match.toolUseId, via: 'time' }
        : candidates > 1
          ? { kind: 'ambiguous', candidates }
          : { kind: 'none' },
    );
  }
  return joins;
}

/** A commit as git knows it: its sha, the second it was committed, its first branch and subject. */
function commitInfo(cwd: string, sha: string): { commit: Commit; sec: number } | null {
  try {
    const run = (args: string[]) =>
      execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [full, sec, ...subject] = run(['show', '-s', '--format=%H%n%ct%n%s', `${sha}^{commit}`]).split('\n');
    if (!full || !sec) return null;
    const branch = run(['for-each-ref', '--contains', full, '--format=%(refname:short)', 'refs/heads']).split('\n')[0] || '(no branch)';
    return { commit: { branch, sha: full.slice(0, 7), subject: subject.join(' ') }, sec: Number(sec) };
  } catch {
    return null;
  }
}

/** The absolute paths a commit touched, from git itself; null when git can't show it from here. */
export function commitFiles(cwd: string, sha: string): string[] | null {
  try {
    const run = (args: string[]) =>
      execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const top = run(['rev-parse', '--show-toplevel']);
    return run(['show', '--name-only', '--format=', '--no-renames', sha])
      .split('\n')
      .filter(Boolean)
      .map(f => resolve(top, f));
  } catch {
    return null;
  }
}
