import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { explain } from '../engine/explain.ts';
import { branchFloor, externalTrails, joinFileWrites, type ExternalTrail, type PathWrite } from '../engine/review.ts';
import { findingsFor, rankFindings, type Finding } from '../engine/risks.ts';
import type { Action, Explanation, Graph } from '../engine/types.ts';
import { ContrailError } from '../errors.ts';
import type { Db } from '../store/sqlite.ts';
import { clip, realPath } from '../util.ts';
import { joinCommits, type CommitJoin } from './commit.ts';
import { loadGraph } from './sessions.ts';

/** Bounds on the work one review does, so a long branch stays fast. Each one is reported when hit. */
export const LIMITS = { commits: 500, files: 1000, sessions: 30, writersPerFile: 3, explained: 300, touches: 50_000 };

/** Tried in order when no base is named. */
export const DEFAULT_BASES = ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master'];

const GIT_BUFFER_MB = 32;

export interface RangeCommit {
  sha: string;
  /** when git dated the commit (committer date), in seconds */
  sec: number;
  authorSec: number;
  merge: boolean;
  subject: string;
  /** repository-relative paths the commit changed (none for a merge) */
  files: string[];
}

export interface RangeFile {
  /** repository-relative, as git prints it */
  path: string;
  /** range commits that changed it, newest first */
  commits: string[];
  /** differs from HEAD in the working tree or index, or is untracked */
  uncommitted: boolean;
}

export interface BranchRange {
  /** the repository's top directory, as git reports it (symlinks resolved) */
  top: string;
  head: string;
  /** the checked-out branch, or null when HEAD is detached */
  branch: string | null;
  base: { name: string; given: boolean; tried: string[]; mergeBase: string; mergeBaseSec: number };
  /** newest first */
  commits: RangeCommit[];
  totalCommits: number;
  files: RangeFile[];
  totalFiles: number;
}

type Git = (args: string[]) => string | null;

/** git in one directory: argument arrays only, output capped, stderr dropped, no optional locks taken. */
function gitIn(cwd: string): Git {
  return args => {
    try {
      return execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: GIT_BUFFER_MB * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new ContrailError('git is not installed or not on PATH; contrail review reads the branch from git.');
      if (code === 'ENOBUFS') throw new ContrailError(`git's output for this range is larger than the ${GIT_BUFFER_MB} MB Contrail reads. Name a closer base: contrail review <base>.`);
      if (code === 'ETIMEDOUT') throw new ContrailError('git did not answer within 15 seconds.');
      return null;
    }
  };
}

const zList = (out: string | null) => (out ?? '').split('\0').filter(Boolean);

/** A revision as typed: no leading dash (never an option), no spaces or control characters. */
const REVISION = /^[^\s\x00-\x1f\x7f-][^\s\x00-\x1f\x7f]{0,255}$/;

/**
 * The commits in <base>..HEAD and every file that differs from the merge-base, committed or
 * not. Without a base, the first of DEFAULT_BASES that exists. Reads git only.
 */
export function branchRange(cwd: string, base?: string): BranchRange {
  const top = gitIn(cwd)(['rev-parse', '--show-toplevel'])?.trim();
  if (!top) throw new ContrailError(`${clip(cwd, 200)} is not inside a git repository. contrail review lists the changes on the current branch, so run it inside one.`);
  const git = gitIn(top);
  const head = git(['rev-parse', '--verify', '-q', 'HEAD^{commit}'])?.trim();
  if (!head) throw new ContrailError('This repository has no commits yet, so there is no branch to review.');
  const branch = git(['symbolic-ref', '-q', '--short', 'HEAD'])?.trim() || null;
  const resolve = (rev: string) => git(['rev-parse', '--verify', '-q', `${rev}^{commit}`])?.trim() || null;

  let name: string;
  let baseSha: string | null;
  if (base !== undefined) {
    if (!REVISION.test(base)) throw new ContrailError(`"${clip(base, 80)}" is not a revision contrail review accepts. Name a branch, tag or commit, for example origin/main.`);
    name = base;
    baseSha = resolve(base);
    if (!baseSha) throw new ContrailError(`Unknown base "${clip(base, 80)}": git has no commit by that name here. Name a branch, tag or commit, for example origin/main.`);
  } else {
    const found = DEFAULT_BASES.map(rev => ({ rev, sha: resolve(rev) })).find(c => c.sha);
    if (!found) throw new ContrailError(`No base to compare with: none of ${DEFAULT_BASES.join(', ')} exists here. Name one: contrail review <base>.`);
    name = found.rev === 'origin/HEAD' ? git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])?.trim() || found.rev : found.rev;
    baseSha = found.sha;
  }
  const mergeBase = git(['merge-base', baseSha!, head])?.trim();
  if (!mergeBase) throw new ContrailError(`${clip(name, 80)} and HEAD share no history, so there is no range between them to review.`);
  const mergeBaseSec = Number(git(['show', '-s', '--format=%ct', mergeBase])?.trim() ?? 0);

  const range = `${mergeBase}..${head}`;
  const totalCommits = Number(git(['rev-list', '--count', range])?.trim() ?? 0);
  const commits: RangeCommit[] = [];
  const meta = (git(['log', '-z', `--max-count=${LIMITS.commits}`, '--format=%H%x00%ct%x00%at%x00%P%x00%s', range]) ?? '').split('\0');
  for (let i = 0; i + 5 <= meta.length; i += 5) {
    const [sha, sec, authorSec, parents, subject] = meta.slice(i, i + 5) as [string, string, string, string, string];
    commits.push({ sha, sec: Number(sec), authorSec: Number(authorSec), merge: parents.split(' ').length > 1, subject, files: [] });
  }
  const bySha = new Map(commits.map(c => [c.sha, c]));
  let current: RangeCommit | undefined;
  for (const raw of (git(['log', '-z', '--no-renames', '--name-only', `--max-count=${LIMITS.commits}`, '--format=%x01%H', range]) ?? '').split('\0')) {
    const part = raw.replace(/^\n/, '');
    if (part.startsWith('\x01')) current = bySha.get(part.slice(1));
    else if (part && current) current.files.push(part);
  }

  const committed = zList(git(['diff', '-z', '--no-renames', '--name-only', mergeBase, head]));
  const dirty = new Set([...zList(git(['diff', '-z', '--no-renames', '--name-only', 'HEAD'])), ...zList(git(['ls-files', '-z', '--others', '--exclude-standard']))]);
  const all = [...new Set([...committed, ...dirty])].sort();
  const commitsOf = new Map<string, string[]>();
  for (const c of commits) for (const f of c.files) commitsOf.set(f, [...(commitsOf.get(f) ?? []), c.sha]);
  const files = all.slice(0, LIMITS.files).map(path => ({ path, commits: commitsOf.get(path) ?? [], uncommitted: dirty.has(path) }));

  return { top, head, branch, base: { name, given: base !== undefined, tried: base !== undefined ? [base] : DEFAULT_BASES, mergeBase, mergeBaseSec }, commits, totalCommits, files, totalFiles: all.length };
}

/** One call that wrote a changed file, with its explanation when it was loaded and explained. */
export interface ReviewWriter {
  sessionId: string;
  actionId: string;
  us: number;
  expected: boolean;
  action: Action | null;
  explanation: Explanation | null;
}

export interface ReviewFile extends RangeFile {
  grade: 'LIKELY' | 'POSSIBLE' | 'UNKNOWN';
  /** newest first: the latest call of each session, then others, up to LIMITS.writersPerFile */
  writers: ReviewWriter[];
  moreWriters: number;
}

export interface ReviewCommit extends RangeCommit {
  join: CommitJoin;
  action: Action | null;
  explanation: Explanation | null;
}

/** A value in an agent write or commit on this branch whose trail reaches external content. */
export interface ExternalValue {
  sessionId: string;
  action: Action;
  /** the changed files this call wrote */
  files: string[];
  trail: ExternalTrail;
}

export interface Review {
  range: BranchRange;
  /** sessions active in this repository since this second are searched for writes */
  floorSec: number;
  commits: ReviewCommit[];
  files: ReviewFile[];
  /** the sessions behind this change, newest first */
  graphs: Map<string, Graph>;
  sessionsOmitted: number;
  external: ExternalValue[];
  /** sensitive actions in those sessions, ranked as risks ranks them */
  findings: Finding[];
  actionsScanned: number;
  /** changed files whose explained writers include none your words named */
  notNamed: ReviewFile[];
  /** writer calls left unexplained at LIMITS.explained */
  unexplained: number;
}

/**
 * The recorded agent work behind a branch: each commit joined to the call that made it (R1, R9),
 * each changed file to the recorded writes to its path (R7), and the calls that matter explained.
 */
export function reviewBranch(db: Db, o: { cwd: string; base?: string; repoKey: string; home: string; hashToken?: (span: string) => string }): Review {
  const range = branchRange(o.cwd, o.base);
  const floorSec = branchFloor(range.base.mergeBaseSec, range.commits.map(c => c.authorSec));
  const joins = joinCommits(db, range.commits, o.repoKey, floorSec);

  // Writes by the real path git would print: hooks may record a symlinked path (/var on macOS).
  const top = realPath(range.top);
  const wanted = new Map(range.files.map(f => [join(top, f.path), f.path]));
  const writesTo = new Map<string, PathWrite[]>();
  const real = new Map<string, string>();
  for (const t of recordedWrites(db, floorSec * 1e6, o.repoKey)) {
    const path = wanted.get(real.get(t.path) ?? real.set(t.path, realPath(t.path)).get(t.path)!);
    if (!path) continue;
    writesTo.set(path, [...(writesTo.get(path) ?? []), { sessionId: t.sessionId, actionId: t.toolUseId, us: t.us, expected: t.kind === 'expected' }]);
  }

  const secOf = new Map(range.commits.map(c => [c.sha, c.sec]));
  const headSec = range.commits[0]?.sec ?? null;
  const joined = range.files.map(f => {
    const lastCommitSec = f.commits.length ? secOf.get(f.commits[0]!)! : headSec;
    return { file: f, ...joinFileWrites({ lastCommitSec, uncommitted: f.uncommitted }, writesTo.get(f.path) ?? []) };
  });

  // The sessions behind this change, newest first, up to the limit.
  const latest = new Map<string, number>();
  const seen = (id: string, us: number) => latest.set(id, Math.max(latest.get(id) ?? 0, us));
  for (const j of joined) for (const w of j.writes) seen(w.sessionId, w.us);
  for (const c of range.commits) {
    const join = joins.get(c.sha);
    if (join?.kind === 'joined') seen(join.sessionId, c.sec * 1e6);
  }
  const ids = [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const graphs = new Map(ids.slice(0, LIMITS.sessions).map(id => [id, loadGraph(db, id, o.home, o.hashToken)]));

  const explained = new Map<string, Explanation>();
  let budget = LIMITS.explained;
  let unexplained = 0;
  const explainOnce = (sessionId: string, actionId: string, capped = true): { action: Action | null; explanation: Explanation | null } => {
    const g = graphs.get(sessionId);
    const action = g?.actions.find(a => a.id === actionId) ?? null;
    if (!g || !action) return { action, explanation: null };
    const key = `${sessionId}\0${actionId}`;
    let e = explained.get(key);
    if (!e && capped && budget <= 0) {
      unexplained++;
      return { action, explanation: null };
    }
    if (!e) {
      e = explain(actionId, g);
      explained.set(key, e);
      if (capped) budget--;
    }
    return { action, explanation: e };
  };

  const files: ReviewFile[] = joined.map(({ file, grade, writes }) => {
    const calls = [...new Map(writes.map(w => [`${w.sessionId}\0${w.actionId}`, w])).values()];
    const firstPerSession = calls.filter((w, i) => calls.findIndex(x => x.sessionId === w.sessionId) === i);
    const picked = [...new Set([...firstPerSession, ...calls])].slice(0, LIMITS.writersPerFile);
    const writers = picked.map(w => ({ ...w, ...explainOnce(w.sessionId, w.actionId) }));
    return { ...file, grade, writers, moreWriters: calls.length - picked.length };
  });

  const commits: ReviewCommit[] = range.commits.map(c => {
    const join = joins.get(c.sha) ?? { kind: 'none' as const };
    const found = join.kind === 'joined' ? explainOnce(join.sessionId, join.toolUseId) : { action: null, explanation: null };
    return { ...c, join, ...found };
  });

  const external: ExternalValue[] = [];
  const calls = [
    ...files.flatMap(f => f.writers.map(w => ({ sessionId: w.sessionId, e: w.explanation }))),
    ...commits.map(c => ({ sessionId: c.join.kind === 'joined' ? c.join.sessionId : '', e: c.explanation })),
  ];
  const done = new Set<string>();
  for (const { sessionId, e } of calls) {
    if (!e || done.has(`${sessionId}\0${e.action.id}`)) continue;
    done.add(`${sessionId}\0${e.action.id}`);
    const wrote = files.filter(f => f.writers.some(w => w.actionId === e.action.id && w.sessionId === sessionId)).map(f => f.path);
    for (const trail of externalTrails(e, graphs.get(sessionId)!)) external.push({ sessionId, action: e.action, files: wrote, trail });
  }

  const findings: Finding[] = [];
  let actionsScanned = 0;
  for (const [id, g] of graphs) {
    actionsScanned += g.actions.length;
    findings.push(...findingsFor(g, actionId => explainOnce(id, actionId, false).explanation!));
  }

  const notNamed = files.filter(f => {
    const verdicts = f.writers.flatMap(w => (w.explanation ? [w.explanation.requested.verdict] : []));
    return verdicts.length > 0 && !verdicts.includes('NAMED');
  });

  return {
    range,
    floorSec,
    commits,
    files,
    graphs,
    sessionsOmitted: ids.length - graphs.size,
    external,
    findings: rankFindings(findings),
    actionsScanned,
    notNamed,
    unexplained,
  };
}

/** Recorded writes (reported or expected) by sessions active in this repository since a time. */
function recordedWrites(db: Db, sinceUs: number, repoKey: string): Array<{ path: string; kind: string; sessionId: string; toolUseId: string; us: number }> {
  return db.all(
    `SELECT t.path AS path, t.kind AS kind, e.session_id AS sessionId, e.tool_use_id AS toolUseId, e.captured_us AS us
       FROM touches t JOIN events e ON e.id = t.event_id
      WHERE t.kind IN ('write', 'expected') AND e.tool_use_id IS NOT NULL
        AND e.session_id IN (SELECT DISTINCT session_id FROM events WHERE repo_key = ? AND captured_us >= ?)
      ORDER BY e.captured_us DESC
      LIMIT ?`,
    repoKey,
    sinceUs,
    LIMITS.touches,
  );
}
