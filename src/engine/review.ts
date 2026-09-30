/**
 * The pure part of `contrail review`: which recorded agent writes a branch's diff can hold,
 * and how strongly each changed file is joined to them. Git and the database are read in
 * src/query/review.ts; nothing here reads either.
 */
import { bestPerGroup } from './explain.ts';
import type { Explanation, Graph, Input, Link, Token, TokenTrace } from './types.ts';

/** One recorded agent write to a path: a file tool's reported write, or a command's expected one (R6). */
export interface PathWrite {
  sessionId: string;
  actionId: string;
  /** when the hook recorded the write, in microseconds since the epoch */
  us: number;
  expected: boolean;
}

export interface FileJoin {
  /** LIKELY: a reported write. POSSIBLE: only expected ones. UNKNOWN: none recorded. */
  grade: 'LIKELY' | 'POSSIBLE' | 'UNKNOWN';
  /** the writes the diff can hold, newest first */
  writes: PathWrite[];
}

/**
 * Where a branch's recorded work can start: the earlier of the merge-base's commit date and the
 * earliest author date in the range. Author dates survive a rebase, so work rebased onto a newer
 * base still counts. Sessions active since then are searched for writes, including their earlier
 * calls, since a session writes before it commits.
 */
export function branchFloor(mergeBaseSec: number, authorSecs: number[]): number {
  return Math.min(mergeBaseSec, ...authorSecs);
}

/**
 * R7 across sessions: join one changed file to the recorded agent writes to its path. When the
 * file's latest state is committed, a write recorded after that commit (git dates it in whole
 * seconds, so one second of slack) is not what the diff holds. LIKELY at best: path and time
 * join, content does not. A write only expected from a command is POSSIBLE; no write is UNKNOWN.
 */
export function joinFileWrites(file: { lastCommitSec: number | null; uncommitted: boolean }, writes: PathWrite[]): FileJoin {
  const until = file.uncommitted || file.lastCommitSec === null ? Infinity : (file.lastCommitSec + 1) * 1e6;
  const held = writes.filter(w => w.us <= until).sort((a, b) => b.us - a.us);
  const grade = held.some(w => !w.expected) ? 'LIKELY' : held.length ? 'POSSIBLE' : 'UNKNOWN';
  return { grade, writes: held };
}

/** A value in an action whose credited trail reaches external content. */
export interface ExternalTrail {
  /** the value as it appears in the action's arguments */
  token: Token;
  /** the credited source at each step back, from the action's own value to the external one */
  steps: Array<{ link: Link; input: Input }>;
}

/**
 * The values in an action whose credited source, or a credited source further back on the same
 * trail (R5), was written outside your machine: a web page or search, an MCP server, a dependency,
 * network output. Only the credited link of each step is followed (the one source, or the first
 * seen), so a value you supplied that a page merely also held is not listed.
 */
export function externalTrails(e: Explanation, g: Graph): ExternalTrail[] {
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const out: ExternalTrail[] = [];
  for (const top of bestPerGroup(e.traces)) {
    const steps: ExternalTrail['steps'] = [];
    for (let t: TokenTrace | undefined = top; t; t = t.upstream?.trace) {
      const found = t.links.filter(l => l.grade !== 'UNKNOWN' && l.to && inputs.has(l.to));
      // The link trace.ts follows upstream, so each step continues from the one before.
      const best = found.find(l => l.grade === 'LIKELY') ?? found.find(l => l.firstSeen);
      if (!best) break;
      const input = inputs.get(best.to!)!;
      steps.push({ link: best, input });
      if (input.trust !== 'external') continue;
      // A path and the words in it can credit the same line of a page: list that line once.
      const sameLine = out.some(x => x.steps.at(-1)!.input.id === input.id && x.steps.at(-1)!.link.quote?.line === best.quote?.line);
      if (!sameLine || top.token.role !== 'hint') out.push({ token: top.token, steps });
      break;
    }
  }
  return out;
}
