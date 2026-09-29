import { basename, isAbsolute, resolve } from 'node:path';
import { hostPath } from '../util.ts';
import { shellSegments } from './tokens.ts';
import type { Commit } from './types.ts';

const COMMIT_LINE = /^\[([^\s\]]+)(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m;
const GIT_COMMITS = /(^|[;&|(\s])git(?:\s+-C\s+\S+)?\s+(commit|cherry-pick|revert|merge)\b/;

/**
 * R1: the commit a command made, from git's own "[branch sha] subject" line.
 * Only when the command really runs git commit, so `echo "[main 9f3c2a1] x"` proves nothing.
 */
export function parseCommitSha(command: string, stdout: string): Commit | null {
  if (!GIT_COMMITS.test(command)) return null;
  const m = COMMIT_LINE.exec(stdout);
  return m ? { branch: m[1]!, sha: m[2]!, subject: m[3]! } : null;
}

export interface ExpectedEffect {
  kind: 'file' | 'network';
  /** absolute path for files, host (+path) for network */
  target: string;
}

const LOCKFILES: Record<string, string> = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: 'bun.lock' };
const INSTALL_VERBS = new Set(['install', 'i', 'add']);
const NETWORK_PROGRAMS = new Set(['curl', 'wget', 'nc', 'ncat', 'scp', 'rsync', 'ssh', 'ftp', 'sftp', 'http', 'https']);

/**
 * R6: what a shell command is expected to change when Claude Code did not report it
 * (bashEditDiff is off outside auto and bypass modes). Always graded POSSIBLE and worded
 * "expected, not observed": the package may already have been installed, the write may have failed.
 */
export function expectedShellEffects(command: string, cwd: string): ExpectedEffect[] {
  const out: ExpectedEffect[] = [];
  const seen = new Set<string>();
  const add = (kind: ExpectedEffect['kind'], target: string) => {
    const key = `${kind}:${target}`;
    if (target && !seen.has(key)) {
      seen.add(key);
      out.push({ kind, target });
    }
  };
  const file = (p: string) => add('file', isAbsolute(p) ? p : resolve(cwd || '/', p));

  for (const seg of shellSegments(command)) {
    for (const r of seg.redirects) if (!r.startsWith('&') && r !== '/dev/null') file(r);
    const words = seg.words.filter(w => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
    const [first, ...args] = words;
    if (!first) continue;
    const prog = basename(first === 'sudo' ? (args.shift() ?? '') : first);
    const plain = args.filter(a => !a.startsWith('-'));

    if (LOCKFILES[prog] && plain[0] && INSTALL_VERBS.has(plain[0])) {
      file('package.json');
      file(LOCKFILES[prog]!);
    } else if (prog === 'tee' || prog === 'touch') {
      plain.forEach(file);
    } else if ((prog === 'mv' || prog === 'cp') && plain.length >= 2) {
      file(plain[plain.length - 1]!);
    } else if (prog === 'sed' && args.some(a => a === '-i' || a.startsWith('-i'))) {
      if (plain.length >= 2) file(plain[plain.length - 1]!);
    }

    if (NETWORK_PROGRAMS.has(prog) || (prog === 'git' && ['clone', 'fetch', 'pull', 'push'].includes(plain[0] ?? ''))) {
      const url = args.find(a => /^https?:\/\//.test(a));
      if (url) add('network', hostPath(url).split('/')[0]!);
      else if (prog === 'git') add('network', 'git remote');
      else if (prog === 'ssh' || prog === 'scp' || prog === 'rsync') {
        const host = plain.find(a => a.includes('@') || a.includes(':'));
        if (host) add('network', host.replace(/:.*$/, '').replace(/^.*@/, ''));
      }
    }
  }
  return out;
}

export interface CommitFile {
  file: string;
  /** the latest agent write to this file since the previous commit that touched it, if any */
  actionId: string | null;
  grade: 'LIKELY' | 'POSSIBLE' | 'UNKNOWN';
}

/**
 * R7: join the files git says a commit contains to the agent's writes that came before it.
 * LIKELY at best: whether that exact change is what got committed is not observed.
 * Expected (not reported) writes give POSSIBLE; no write gives UNKNOWN.
 */
export function commitContains(
  commitSeq: number,
  files: string[],
  writes: Array<{ path: string; seq: number; actionId: string; expected: boolean }>,
  earlierCommits: Array<{ seq: number; files: string[] }>,
): CommitFile[] {
  return files.map(file => {
    const since = Math.max(0, ...earlierCommits.filter(c => c.seq < commitSeq && c.files.includes(file)).map(c => c.seq));
    const candidates = writes
      .filter(w => w.path === file && w.seq > since && w.seq < commitSeq)
      .sort((a, b) => b.seq - a.seq);
    const latest = candidates.find(w => !w.expected) ?? candidates[0];
    if (!latest) return { file, actionId: null, grade: 'UNKNOWN' as const };
    return { file, actionId: latest.actionId, grade: latest.expected ? ('POSSIBLE' as const) : ('LIKELY' as const) };
  });
}
