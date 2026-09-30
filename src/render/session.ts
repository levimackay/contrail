import type { CommitFile } from '../engine/effects.ts';
import type { Finding } from '../engine/risks.ts';
import type { Sighting } from '../engine/find.ts';
import { headlineTrace, type TreeNode, type TreeRoot } from '../engine/tree.ts';
import type { Action, Commit, Explanation, Graph, Grade, Input, TokenTrace } from '../engine/types.ts';
import { clip, displayPath } from '../util.ts';
import { callId, PLAIN, type Style } from './style.ts';
import { describe, originWording } from './why.ts';

export interface SessionSummary {
  id: string;
  lastUs: number;
  cwd: string;
  graph: Graph;
  flagged: number;
}

export type TraceFilter = 'writes' | 'shell' | 'network' | 'mcp' | 'subagents' | 'instructions';

const KIND: Record<string, string> = {
  Read: 'READ', Grep: 'SEARCH', Glob: 'SEARCH', LS: 'SEARCH', Edit: 'EDIT', MultiEdit: 'EDIT', Write: 'WRITE',
  NotebookEdit: 'EDIT', Bash: 'SHELL', WebFetch: 'WEB', WebSearch: 'WEB', Agent: 'AGENT', Task: 'AGENT', Skill: 'SKILL',
};
export const kindOf = (a: Action) => (a.tool.startsWith('mcp__') ? 'MCP' : (KIND[a.tool] ?? 'TOOL'));
/** What a timeline line shows after the kind: for a tool without a kind of its own, its name first. */
export const summary = (a: Action, g: Graph) => (kindOf(a) === 'TOOL' ? `${a.tool} ${describe(a, g)}` : describe(a, g));

/** Side effects worth explaining in a trace: anything that writes, runs, or reaches the network. */
export const EXPLAINED = new Set(['EDIT', 'WRITE', 'SHELL', 'WEB', 'MCP', 'AGENT']);

export function matchesFilter(a: Action, g: Graph, filter: TraceFilter | null): boolean {
  if (!filter) return true;
  const kind = kindOf(a);
  if (filter === 'writes') return g.effects.some(e => e.actionId === a.id && e.kind === 'file');
  if (filter === 'shell') return kind === 'SHELL';
  if (filter === 'network') return kind === 'WEB' || kind === 'MCP' || g.effects.some(e => e.actionId === a.id && e.kind === 'network');
  if (filter === 'mcp') return kind === 'MCP';
  if (filter === 'subagents') return kind === 'AGENT' || a.scope.agentId !== null;
  return false;
}

/** A session as a timeline of turns, each side effect shown with where its values came from. */
export function renderTrace(
  g: Graph,
  explanations: Map<string, Explanation>,
  filter: TraceFilter | null,
  s: Style = PLAIN,
): string {
  const out: string[] = [];
  const sessionId = g.sessionId;
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  out.push(`${s.bold('Session')} ${sessionId.slice(0, 8)}  ${s.dim(clip(g.env.cwd, 120))}`);
  out.push(
    s.dim(
      `${counted(g.prompts.length, 'turn')} · ${counted(g.actions.length, 'tool call')} · ${counted(g.effects.filter(e => e.kind === 'file').length, 'file effect')}` +
        (filter ? ` · showing --${filter}` : ''),
    ),
  );

  type Item = { seq: number; line: () => string[] };
  const items: Item[] = [];
  if (!filter) {
    for (const p of g.prompts) {
      const head = p.from === 'task' ? `${s.dim('background task report, not your words:')} "${clip(p.text, 80)}"` : s.bold(`"${clip(p.text, 100)}"`);
      items.push({ seq: p.seq, line: () => ['', `${s.bold(p.label)}  ${head}`] });
    }
  }
  if (!filter || filter === 'instructions') {
    for (const i of g.inputs.filter(x => x.origin === 'instructions')) {
      items.push({ seq: i.availableAt, line: () => [`  ${s.dim(pad(`${i.availableAt}`, 4))} ${pad('LOADED', 7)} ${clip(i.label, 100)}  ${s.dim(originWording(i))}`] });
    }
  }
  if (!filter) {
    for (const i of g.inputs.filter(x => x.origin === 'compaction')) {
      items.push({ seq: i.availableAt, line: () => [`  ${s.dim(pad(`${i.availableAt}`, 4))} ${s.dim('COMPACTED  earlier context now visible only through the summary')}`] });
    }
  }
  for (const a of g.actions) {
    if (filter === 'instructions' || !matchesFilter(a, g, filter)) continue;
    items.push({ seq: a.preSeq, line: () => actionLines(a, g, explanations.get(a.id), inputs, s) });
  }

  items.sort((a, b) => a.seq - b.seq);
  for (const item of items) out.push(...item.line());
  if (!items.length) out.push('', s.dim('  nothing matches this filter'));
  out.push('', s.dim(`Run ${s.bold('contrail why <path | "command">')} for the full trail behind any line.`));
  return `${out.join('\n')}\n`;
}

function actionLines(a: Action, g: Graph, e: Explanation | undefined, inputs: Map<string, Input>, s: Style): string[] {
  const kind = kindOf(a);
  const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : '';
  const failed = a.status === 'failed' || a.status === 'interrupted' || a.status === 'denied' ? s.flag(` ${a.status.toUpperCase()}`) : '';
  const lines = [`  ${s.dim(pad(`${a.preSeq}`, 4))} ${pad(kind, 7)} ${summary(a, g)}${who}${failed}`];
  if (!e) return lines;

  const detail = trailDetail(e, inputs, s);
  if (detail) lines.push(`         ${s.dim('↳')} ${detail}`);

  const effects = g.effects.filter(x => x.actionId === a.id && x.kind !== 'network');
  if (effects.length && kind === 'SHELL') {
    const shown = effects.slice(0, 4).map(x => clip(x.target, 80)).join(', ') + (effects.length > 4 ? `, +${effects.length - 4} more` : '');
    const how = effects.every(x => x.evidence === 'expected') ? s.dim(' (expected, not observed)') : '';
    lines.push(`         ${s.dim('→')} ${shown}${how}`);
  }
  return lines;
}

/** An action's headline value and where it first came from, then whether you named it: one line. */
export function trailDetail(e: Explanation, inputs: Map<string, Input>, s: Style): string {
  const head = headlineTrace(e);
  const from = head ? traceSource(head, inputs, s) : '';
  const found = from || (e.traces.length ? `${s.grade('UNKNOWN', 0).trim()} ${s.dim('no observed source')}` : '');
  const asked = e.requested.verdict === 'NAMED' ? s.dim('named by you') : e.requested.verdict === 'NOT_NAMED' ? s.flag('not named by you') : '';
  return [found, asked].filter(Boolean).join('   ');
}

/** A traced value and the source first credited with it: `LIKELY jwt-decode ← README.md:13 (local)`; empty when none was found. */
export function traceSource(t: TokenTrace, inputs: Map<string, Input>, s: Style): string {
  const link = t.links.find(l => l.grade !== 'UNKNOWN');
  const src = link?.to ? inputs.get(link.to) : undefined;
  if (!src || !link) return '';
  const trust = src.trust === 'external' ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
  return `${s.grade(link.grade, 0).trim()} ${clip(t.token.text, 80)} ← ${clip(src.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ''} ${trust}`;
}

/** trace --tree: each action under the call whose output first held its headline value. */
export function renderTree(g: Graph, forest: TreeRoot[], omitted: number, s: Style = PLAIN): string {
  const out: string[] = [];
  const sessionId = g.sessionId;
  out.push(`${s.bold('Session')} ${sessionId.slice(0, 8)}  ${s.dim(clip(g.env.cwd, 120))}`);
  out.push(s.dim('Each action sits under the call whose output first held its headline value. Data flow, not the agent\'s reasons.'));
  for (const root of forest) {
    out.push('', rootLine(root, g, s));
    root.children.forEach((child, i) => nodeLines(child, '', i === root.children.length - 1, g, s, out));
  }
  if (omitted) out.push('', s.dim(`${omitted} later actions are not shown; run contrail trace for the full timeline.`));
  out.push('', s.dim(`Run ${s.bold('contrail why <path | "command">')} for the full trail behind any line.`));
  return `${out.join('\n')}\n`;
}

function rootLine(root: TreeRoot, g: Graph, s: Style): string {
  if (root.kind === 'unknown') return s.bold('no observed source');
  if (root.kind === 'nothing') return s.bold('nothing to trace') + s.dim(' (no values in these calls to follow)');
  const src = root.source!;
  const prompt = src.origin === 'prompt' ? g.prompts.find(p => `prompt:${p.promptId}` === src.id) : undefined;
  const what = prompt ? `${clip(src.label, 100)}  "${clip(prompt.text, 70)}"` : clip(src.label, 100);
  return `${s.bold(what)}  ${src.trust === 'external' ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`)}`;
}

function nodeLines(node: TreeNode, prefix: string, last: boolean, g: Graph, s: Style, out: string[]): void {
  const a = node.action;
  const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : '';
  const failed = a.status === 'failed' || a.status === 'interrupted' || a.status === 'denied' ? s.flag(` ${a.status.toUpperCase()}`) : '';
  const line = node.link?.quote?.line != null ? s.dim(` (line ${node.link.quote.line})`) : '';
  const external = node.source?.trust === 'external' ? ` ${s.flag('(external)')}` : '';
  const via = node.link && node.token ? `  ${s.dim('←')} ${s.grade(node.link.grade, 0).trim()} ${clip(node.token, 80)}${line}${external}` : '';
  out.push(`${s.dim(prefix + (last ? '└── ' : '├── '))}${s.dim(pad(`${a.preSeq}`, 4))} ${pad(kindOf(a), 7)} ${clip(summary(a, g), 60)}${who}${failed}${via}`);
  const next = prefix + (last ? '    ' : '│   ');
  node.children.forEach((child, i) => nodeLines(child, next, i === node.children.length - 1, g, s, out));
}

/**
 * One status-bar line for the current session: sensitive actions whose values trace to external
 * content, those you did not name, and how many calls were recorded. Null: nothing recorded yet.
 */
export function renderStatusline(g: Graph | null, findings: Finding[], s: Style = PLAIN): string {
  const name = s.dim('contrail');
  if (!g) return `${name} ${s.dim('recording')}`;
  const external = findings.filter(f => f.externalUpstream).length;
  const unnamed = findings.filter(f => !f.externalUpstream && f.requested === 'NOT_NAMED').length;
  const parts = [
    external ? s.flag(`▲ ${external} from external content`) : '',
    unnamed ? s.bold(`△ ${unnamed} not named by you`) : '',
    s.dim(`${g.actions.length} call${g.actions.length === 1 ? '' : 's'}`),
  ].filter(Boolean);
  return `${name} ${parts.join(s.dim(' · '))}`;
}

/** contrail find: where one value appeared, session by session, in order. */
export function renderFind(value: string, hits: Array<{ graph: Graph; sightings: Sighting[] }>, scanned: number, s: Style = PLAIN): string {
  const found = hits.filter(h => h.sightings.length);
  const out = [`${s.bold(`"${clip(value, 80)}"`)} ${s.dim(`in ${found.length} of ${scanned} session${scanned === 1 ? '' : 's'}`)}`];
  if (!found.length) {
    out.push('', `  ${s.dim('No recorded input or call contains it. Matching is whole-token and literal; no observed source is not the same as no source.')}`);
    return `${out.join('\n')}\n`;
  }
  for (const { graph: g, sightings } of found) {
    const sessionId = g.sessionId;
    const first = g.prompts.find(p => p.from === 'you');
    out.push('', `${s.bold('Session')} ${sessionId.slice(0, 8)}  ${s.dim(first ? `"${clip(first.text, 70)}"` : '')}`);
    let seenSource = false;
    for (const hit of sightings) {
      if (hit.source) {
        const src = hit.source.input;
        const where = `${clip(src.label, 90)}${hit.source.line != null ? `:${hit.source.line}` : ''}`;
        const trust = src.trust === 'external' ? s.flag(`(${src.trust})`) : s.dim(`(${src.trust})`);
        out.push(`  ${s.dim(pad(`${hit.seq}`, 4))} ${pad('HELD', 6)} ${where}  ${trust}${seenSource ? '' : `  ${s.accent('first seen')}`}`);
        seenSource = true;
        if (hit.source.text) out.push(`              ${s.dim(hit.source.line != null ? `${hit.source.line}│` : '│')} ${clip(hit.source.text, 96)}`);
        else if (src.hashed) out.push(`              ${s.dim(`${hit.source.line ?? ''}│ (text not stored)`)}`);
      } else if (hit.use) {
        const a = hit.use.action;
        const who = a.scope.agentId ? s.dim(` [subagent ${callId(a.scope.agentId)}]`) : '';
        const kinds = hit.use.kinds.length ? `  ${s.flag(hit.use.kinds.join(' · '))}` : '';
        out.push(`  ${s.dim(pad(`${hit.seq}`, 4))} ${pad('USED', 6)} ${kindOf(a)} ${clip(summary(a, g), 80)} ${s.dim(`(${hit.use.argPath})`)}${who}${kinds}`);
      }
    }
  }
  out.push('', s.dim(`HELD: an input that held the value. USED: a call whose arguments contain it. Run ${s.bold('contrail why')} on a call for its graded trail.`));
  return `${out.join('\n')}\n`;
}

/** Recent sessions with what they did at a glance. */
export function renderSessions(sessions: SessionSummary[], s: Style = PLAIN): string {
  if (!sessions.length) return 'No sessions recorded yet. Use Claude Code with the plugin enabled, then try again.\n';
  const head = ['SESSION', 'LAST ACTIVE', 'TURNS', 'READS', 'WRITES', 'SHELL', 'WEB/MCP', 'SUBAGENTS', 'FLAGGED', 'FIRST PROMPT'];
  const rows = sessions.map(x => {
    const g = x.graph;
    const count = (kinds: string[]) => g.actions.filter(a => kinds.includes(kindOf(a))).length;
    const subagents = new Set(g.actions.map(a => a.scope.agentId).filter(Boolean)).size;
    return [
      x.id.slice(0, 8),
      localTime(x.lastUs),
      `${g.prompts.length}`,
      `${count(['READ', 'SEARCH'])}`,
      `${new Set(g.effects.filter(e => e.kind === 'file').map(e => e.target)).size}`,
      `${count(['SHELL'])}`,
      `${count(['WEB', 'MCP'])}`,
      `${subagents}`,
      `${x.flagged}`,
      clip(g.prompts.find(p => p.from === 'you')?.text ?? '', 60),
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!))).join('  ');
  const body = rows.map(line);
  const flaggedCol = head.indexOf('FLAGGED');
  return (
    [s.bold(line(head)), ...body.map((b, i) => (rows[i]![flaggedCol] !== '0' ? highlightFlag(b, s) : b))].join('\n') +
    `\n\n${s.dim('FLAGGED = sensitive actions whose values trace to external content. See: contrail risks --session <id>')}\n`
  );
}

function highlightFlag(row: string, s: Style): string {
  return s.on ? row.replace(/^(\S+)/, m => s.flag(m)) : row;
}

/** Sensitive actions, those whose values trace to external content first. Facts only; nothing is judged or blocked. */
export function renderRisks(findings: Finding[], scanned: { actions: number; sessions: number }, g: Map<string, Graph>, s: Style = PLAIN): string {
  const out: string[] = [];
  out.push(
    `${s.bold('Sensitive actions')} ${s.dim(`(${findings.length} of ${counted(scanned.actions, 'tool call')} in ${counted(scanned.sessions, 'session')})`)}`,
  );
  if (!scanned.actions) {
    out.push('', '  No tool calls recorded yet. Contrail records from the moment the plugin is enabled: use Claude Code, then try again.');
    return `${out.join('\n')}\n`;
  }
  if (!findings.length) out.push('', '  None found.');
  for (const f of findings) {
    const graph = g.get(f.action.scope.sessionId)!;
    const mark = f.externalUpstream ? s.flag('▲') : f.requested === 'NOT_NAMED' ? s.bold('△') : s.dim('·');
    out.push('', `${mark} ${s.bold(describe(f.action, graph))}`);
    const asked = f.requested === 'NAMED' ? 'named by you' : f.requested === 'NOT_NAMED' ? s.flag('not named by you') : f.requested.toLowerCase().replace(/_/g, ' ');
    const prompt = graph.prompts.find(p => p.promptId === f.action.promptId);
    out.push(`  ${s.accent(f.kinds.join(' · '))}   ${asked}   ${s.dim(`session ${f.action.scope.sessionId.slice(0, 8)} · ${prompt?.label ?? 'no turn'} · ${callId(f.action.id)}`)}`);
    const external = f.sources.filter(x => x.input.trust === 'external');
    const shown = (external.length ? external : f.sources).slice(0, 3);
    if (!shown.length) {
      out.push(`  ${s.dim('values trace to: no observed source')}`);
      continue;
    }
    out.push(`  ${external.length ? s.flag('values trace to external content:') : s.dim('values trace to:')}`);
    for (const { link, input } of shown) {
      const where = `${clip(input.label, 100)}${link.quote?.line != null ? `:${link.quote.line}` : ''}`;
      out.push(`    ${s.grade(link.grade)}${clip(link.token ?? '', 80)}  ← ${where}  ${input.trust === 'external' ? s.flag(`(${input.trust})`) : s.dim(`(${input.trust})`)}`);
      if (link.quote?.text) out.push(`             ${s.dim(link.quote.line != null ? `${link.quote.line}│` : '│')} ${clip(link.quote.text, 96)}`);
      else if (link.quote && input.hashed) out.push(`             ${s.dim(`${link.quote.line ?? ''}│ (text not stored)`)}`);
    }
  }
  out.push(
    '',
    s.dim('▲ values trace to web, MCP or dependency content   △ not named by you   · named by you'),
    s.dim('Contrail explains; it does not judge or block. A flagged action is not proof of an attack, and an unflagged one is not proof of safety.'),
  );
  return `${out.join('\n')}\n`;
}

export interface CommitReport {
  commit: Commit;
  action: Action;
  explanation: Explanation;
  files: Array<CommitFile & { writer?: { action: Action; named: boolean } }> | null;
  /** how the commit was joined to the action; stdout unless git printed no commit line */
  via?: 'stdout' | 'time';
  commitSec?: number;
}

/** What a commit contains, joined to the agent's changes, and who asked for them. */
export function renderCommit(r: CommitReport, g: Graph, s: Style = PLAIN): string {
  const out: string[] = [];
  const { commit, action, explanation: e } = r;
  const prompt = g.prompts.find(p => p.promptId === action.promptId);
  out.push(`${s.bold('Commit')} ${s.accent(commit.sha)} on ${clip(commit.branch, 60)}  ${s.bold(`"${clip(commit.subject, 80)}"`)}`);
  if (r.via === 'time') {
    const at = r.commitSec ? new Date(r.commitSec * 1000).toISOString().slice(11, 19) : 'that second';
    out.push(
      `  ${s.grade('LIKELY')}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): the only recorded git commit running when git dated this commit (${at} UTC)  ${s.dim('[R9]')}`,
      `           ${s.dim('git printed no commit line for this command, so the join is on time, not on git\'s output')}`,
    );
  } else {
    out.push(`  ${s.grade('DIRECT')}made by ${action.tool} ${callId(action.id)} (seq ${action.preSeq}): [${clip(commit.branch, 60)} ${commit.sha}] ${clip(commit.subject, 60)}  ${s.dim('[R1]')}`);
  }
  const verdict = e.requested.verdict;
  const said = e.requested.sentence ? ` "${clip(e.requested.sentence.text, 70)}"` : '';
  out.push(`Requested?  ${verdict === 'NOT_NAMED' ? s.flag('NOT NAMED') : s.bold(verdict.replace(/_/g, ' '))}${said}  ${s.dim(`[R8 ${e.requested.grade}]`)}`);
  if (prompt) out.push(`Turn        ${s.grade('DIRECT')}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  ${s.dim('[R1]')}`);
  out.push('');

  if (!r.files) {
    out.push(s.dim('Commit contents unavailable: git could not show this commit here (run from inside the repository).'));
    return `${out.join('\n')}\n`;
  }
  out.push(s.bold('What the commit contains') + s.dim(' (file list from git now, joined to the agent\'s changes by path)'));
  const width = Math.max(...r.files.map(f => displayPath(f.file, g.env.cwd, g.env.home).length));
  const order = { LIKELY: 0, POSSIBLE: 1, UNKNOWN: 2 };
  for (const f of [...r.files].sort((a, b) => order[a.grade] - order[b.grade])) {
    const shown = displayPath(f.file, g.env.cwd, g.env.home).padEnd(width);
    if (!f.writer) {
      out.push(`  ${s.grade('UNKNOWN')}${shown}  ${s.dim('no agent change recorded in this session (you, another process, or an earlier session)')}`);
      continue;
    }
    const w = f.writer;
    out.push(
      `  ${s.grade(f.grade as Grade)}${shown}  ← ${w.action.tool} ${callId(w.action.id)} ${clip(describe(w.action, g), 44)}  ${w.named ? s.dim('named by you') : s.flag('not named by you')}  ${s.dim('[R7]')}`,
    );
  }
  const unnamed = r.files.filter(f => f.writer && !f.writer.named).length;
  out.push(
    '',
    s.dim('LIKELY, not DIRECT: git lists the file and the agent changed it earlier; whether that exact change is what was committed is not observed.'),
    `${unnamed} of ${r.files.length} files hold agent changes you did not name. ${s.dim('Run contrail why <file> for the trail behind each one.')}`,
  );
  return `${out.join('\n')}\n`;
}

const pad = (text: string, width: number) => text.padEnd(width);

/** "1 tool call", "2 tool calls" */
const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function localTime(us: number): string {
  const d = new Date(Math.floor(us / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

const TRIPWIRE_ASKED: Record<Finding['requested'], string> = {
  NAMED: 'named in your words',
  NAMED_NEGATED: 'named, but your latest mention is negated',
  PARTLY_NAMED: 'partly named in your words',
  NOT_NAMED: 'not named in your words',
  NOTHING_TO_MATCH: 'nothing in it to match against your words',
};

/**
 * The tripwire notice, shown to the person before a sensitive call runs: what is sensitive,
 * whether your words named it, and the nearest external source its values first appeared in.
 * Plain text on one line; it describes where values came from and never judges the call.
 */
export function renderTripwire(f: Finding, e: Explanation): string {
  const external = f.sources.find(x => x.input.trust === 'external')!;
  const values = [...new Set(f.sources.filter(x => x.input.id === external.input.id).map(x => x.link.token).filter((v): v is string => !!v))];
  const where = external.link.quote?.line != null ? `${clip(external.input.label, 80)}:${external.link.quote.line}` : clip(external.input.label, 80);
  const shown = values.length ? clip(values.map(v => clip(v, 60)).join(', '), 120) : 'a value in it';
  return (
    `Contrail ▲ ${f.kinds.join(' · ')} · ${TRIPWIRE_ASKED[f.requested]}: ${shown} first appeared in ${where} ` +
    `(external, ${external.link.grade}). Trail: /contrail:why ${callId(e.action.id)}`
  );
}
