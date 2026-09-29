import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseCommitSha } from '../engine/effects.ts';
import type { Commit } from '../engine/types.ts';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';
import { str, toText } from '../util.ts';

export interface CommitHit {
  sessionId: string;
  toolUseId: string;
  cwd: string;
  commit: Commit;
}

/**
 * The recorded shell command that made a commit: git printed "[branch sha] subject" on its
 * stdout. Either sha may be the longer one: git prints 7+ characters, you may paste all 40.
 */
export function findCommit(db: Db, sha: string): CommitHit {
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
      return { sessionId: row.sessionId, toolUseId: row.toolUseId, cwd: row.cwd, commit };
    }
  }
  throw new ContrailError(`No recorded agent action made commit ${sha}. Contrail sees commits made by Claude Code through its shell tool.`);
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
