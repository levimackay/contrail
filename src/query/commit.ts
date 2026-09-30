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
  const info = cwd ? commitInfo(cwd, wanted) : null;
  for (const row of rows) {
    const p = JSON.parse(row.payload) as Record<string, unknown>;
    const commit = parseCommitSha(str(p.tool_input, 'command') ?? '', str(p.tool_response, 'stdout') ?? toText(p.tool_response));
    if (!commit || !(wanted.startsWith(commit.sha) || commit.sha.startsWith(wanted))) continue;
    // A command can print any text. When git can date the commit, its line counts only from a
    // command that was running at that second; an echo of someone else's commit does not.
    if (info && !ranAt(db, row.toolUseId, info.sec)) continue;
    return { sessionId: row.sessionId, toolUseId: row.toolUseId, cwd: row.cwd, commit, via: 'stdout' };
  }

  if (info) {
    const window = 3600 * 1e6;
    const calls = db
      .all<{ sessionId: string; toolUseId: string; cwd: string; hook: string; us: number; command: string | null }>(
        `SELECT session_id AS sessionId, tool_use_id AS toolUseId, cwd, hook_event AS hook, captured_us AS us,
                json_extract(payload, '$.tool_input.command') AS command
           FROM events
          WHERE tool_name = 'Bash' AND hook_event IN ('PreToolUse', 'PostToolUse', 'PostToolUseFailure')
            AND captured_us BETWEEN ? AND ? ${repoKey ? 'AND repo_key = ?' : ''}`,
        info.sec * 1e6 - window,
        info.sec * 1e6 + window,
        ...(repoKey ? [repoKey] : []),
      )
      .reduce((byId, e) => {
        const c = byId.get(e.toolUseId) ?? { sessionId: e.sessionId, toolUseId: e.toolUseId, cwd: e.cwd, command: '', preUs: 0, postUs: 0 };
        if (e.hook === 'PreToolUse') c.preUs = e.us;
        else c.postUs = e.us;
        c.command ||= e.command ?? '';
        return byId.set(e.toolUseId, c);
      }, new Map<string, { sessionId: string; toolUseId: string; cwd: string; command: string; preUs: number; postUs: number }>());
    const { match, candidates } = commitByTime(info.sec, [...calls.values()].filter(c => c.preUs && c.postUs));
    if (match) return { sessionId: match.sessionId, toolUseId: match.toolUseId, cwd: match.cwd, commit: info.commit, via: 'time', commitSec: info.sec };
    if (candidates > 1) {
      throw new ContrailError(`${candidates} recorded git commits were running when git dated commit ${sha}, and git printed no commit line, so Contrail cannot tell which one made it.`);
    }
  }
  throw new ContrailError(`No recorded agent action made commit ${sha}. Contrail sees commits made by Claude Code through its shell tool.`);
}

/** Whether a recorded call was running at a second git dated a commit (git counts whole seconds). */
function ranAt(db: Db, toolUseId: string, sec: number): boolean {
  const span = db.get<{ first: number | null; last: number | null }>(
    `SELECT MIN(captured_us) AS first, MAX(captured_us) AS last FROM events
      WHERE tool_use_id = ? AND hook_event IN ('PreToolUse', 'PostToolUse', 'PostToolUseFailure')`,
    toolUseId,
  );
  if (!span?.first || !span.last) return false;
  return sec * 1e6 >= span.first - 1e6 && sec * 1e6 <= span.last + 1e6;
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

/** Whether git in cwd knows this text as a commit, so `why <sha>` needs no "commit" word. */
export function isCommit(cwd: string, text: string): boolean {
  if (!/^[0-9a-f]{7,40}$/i.test(text)) return false;
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--verify', '--quiet', `${text}^{commit}`], { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
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
