import { BASE_BLIND_SPOTS } from '../engine/explain.ts';
import type { Finding } from '../engine/risks.ts';
import { headlineTrace } from '../engine/tree.ts';
import type { Action, Explanation, Graph, Input, Link, Verdict } from '../engine/types.ts';
import { DEFAULT_BASES, type ExternalValue, type Review, type ReviewCommit, type ReviewFile, type ReviewWriter } from '../query/review.ts';
import { callId, clip } from '../util.ts';
import { PLAIN, type Style } from './style.ts';
import { describe, originWording } from './why.ts';

/**
 * contrail review: the recorded agent work behind a branch, for whoever reviews it. Three views
 * of one Review: the terminal, JSON, and GitHub markdown to paste into a pull request. Like every
 * report, it says where values came from and never why the agent acted.
 */

export const REVIEW_BLIND_SPOTS = [
  ...BASE_BLIND_SPOTS,
  'changes made outside recorded Claude Code sessions (by you, another tool, or before Contrail was installed)',
  'which part of a recorded write the diff holds (files are joined by path and time, not content)',
  'commits rebased, amended or squashed after they were recorded (their new shas match no recorded commit line)',
  'sessions removed by retention',
];

const LIST_LIMIT = 20;
const COMMIT_LIMIT = 20;

const sid = (id: string) => id.slice(0, 8);
const short = (sha: string) => sha.slice(0, 7);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const when = (sec: number) => new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const VERDICT_WORDS: Record<Verdict, string> = {
  NAMED: 'named by you',
  NOT_NAMED: 'not named by you',
  NAMED_NEGATED: 'named, but your latest mention is negated',
  PARTLY_NAMED: 'partly named by you',
  NOTHING_TO_MATCH: 'nothing in it to match against your words',
};

/** How a call ended, when it did not end with a result. A denied call has no result recorded. */
const STATUS_WORDS: Record<Action['status'], string> = { ok: '', failed: 'failed', interrupted: 'interrupted', pending: 'no result recorded', denied: 'denied by auto mode' };

/** The value, link and source a trail leads with: a target with a found source, else any found value. */
function headline(e: Explanation, g: Graph): { token: string; link: Link; input: Input } | null {
  const head = headlineTrace(e);
  const link = head?.links.find(l => l.grade !== 'UNKNOWN');
  const input = link?.to ? g.inputs.find(i => i.id === link.to) : undefined;
  return head && link && input ? { token: head.token.text, link, input } : null;
}

const where = (link: Link, input: Input) => `${input.label}${link.quote?.line != null ? `:${link.quote.line}` : ''}`;

/** The committed and uncommitted state of a file, in a few words. */
function fileState(f: ReviewFile): string {
  const committed = f.commits.length ? `committed in ${f.commits.slice(0, 3).map(short).join(', ')}${f.commits.length > 3 ? `, +${f.commits.length - 3} more` : ''}` : '';
  if (committed && f.uncommitted) return `${committed}; changed again, not committed`;
  return committed || (f.uncommitted ? 'not committed' : 'committed, in no listed commit (an older one, or a merge)');
}

function baseWords(r: Review): string {
  const b = r.range.base;
  return b.given ? `base ${b.name}` : `base ${b.name} (default: first found of ${DEFAULT_BASES.join(', ')})`;
}

function counts(r: Review): string[] {
  const agentFiles = r.files.filter(f => f.grade !== 'UNKNOWN').length;
  const uncommitted = r.files.filter(f => f.uncommitted).length;
  const joined = r.commits.filter(c => c.join.kind === 'joined').length;
  return [
    plural(r.range.totalCommits, 'commit'),
    `${plural(r.range.totalFiles, 'changed file')}${uncommitted ? ` (${uncommitted} not committed)` : ''}`,
    `${agentFiles} with recorded agent changes`,
    plural(r.graphs.size + r.sessionsOmitted, 'session'),
    `${joined} of ${r.commits.length} commits joined to the call that made them`,
  ];
}

// ---------------------------------------------------------------------------------------------
// Terminal

export function renderReview(r: Review, s: Style = PLAIN): string {
  const out: string[] = [];
  const range = r.range;
  const head = range.branch ?? `HEAD (detached at ${short(range.head)})`;
  out.push(`${s.bold('Review')}  ${s.bold(clip(head, 80))} against ${s.bold(clip(range.base.name, 80))}`);
  out.push(s.dim(`  ${clip(baseWords(r), 160)} · merge-base ${short(range.base.mergeBase)}`));
  const facts = counts(r);
  out.push(`  ${facts.slice(0, 3).join(s.dim(' · '))}`, `  ${facts.slice(3).join(s.dim(' · '))}`);
  out.push(s.dim(`  agent changes: writes by sessions active here since ${when(r.floorSec)}, joined by path`));
  const limits = limitNotes(r);
  for (const note of limits) out.push(s.dim(`  ${note}`));

  out.push('', s.bold('Values from external content in this change'));
  if (!r.external.length) {
    out.push(s.dim('  None: no value in the agent\'s recorded writes or commits on this branch traces to web, MCP or dependency content.'));
  }
  for (const x of r.external.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(x.sessionId)!;
    const into = x.files.length ? `in ${x.files.map(f => clip(f, 80)).join(', ')} · ` : '';
    out.push(`  ${s.flag('▲')} ${s.accent(clip(x.trail.token.text, 80))}  ${s.dim(`${into}${x.action.tool} ${callId(x.action.id)} · session ${sid(x.sessionId)} · ${turnLabel(x.action, g)}`)}`);
    x.trail.steps.forEach(({ link, input }, i) => {
      const value = i ? `${clip(link.token ?? '', 80)} ` : '';
      const lead = i ? s.dim('one step back: ') : '';
      out.push(`    ${s.grade(link.grade)}${lead}${value}← ${clip(where(link, input), 100)}  ${trust(input, s)}  ${s.dim(`[${link.rule}]`)}`);
    });
    const { link, input } = x.trail.steps.at(-1)!;
    if (link.quote?.text) out.push(`             ${s.dim(link.quote.line != null ? `${link.quote.line}│` : '│')} ${clip(link.quote.text, 96)}`);
    else if (link.quote && input.hashed) out.push(`             ${s.dim(`${link.quote.line ?? ''}│ (text not stored)`)}`);
  }
  more(out, r.external.length, s);

  out.push('', `${s.bold('Sensitive actions in these sessions')} ${s.dim(`(${r.findings.length} of ${r.actionsScanned} tool calls)`)}`);
  if (!r.findings.length) out.push(s.dim('  None found.'));
  for (const f of r.findings.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(f.action.scope.sessionId)!;
    const mark = f.externalUpstream ? s.flag('▲') : f.requested === 'NOT_NAMED' ? s.bold('△') : s.dim('·');
    const asked = f.requested === 'NOT_NAMED' ? s.flag(VERDICT_WORDS[f.requested]) : VERDICT_WORDS[f.requested];
    const status = STATUS_WORDS[f.action.status];
    out.push(`  ${mark} ${s.bold(describe(f.action, g))}${status ? (f.action.status === 'pending' ? s.dim(` (${status})`) : s.flag(` ${status.toUpperCase()}`)) : ''}`);
    out.push(`    ${s.accent(f.kinds.join(' · '))}   ${asked}   ${s.dim(`session ${sid(f.action.scope.sessionId)} · ${turnLabel(f.action, g)} · ${callId(f.action.id)}`)}`);
    const src = firstSource(f);
    if (src) {
      out.push(`    ${s.grade(src.link.grade)}${clip(src.link.token ?? '', 80)} ← ${clip(where(src.link, src.input), 100)}  ${trust(src.input, s)}`);
    } else {
      out.push(s.dim('    values trace to: no observed source'));
    }
  }
  more(out, r.findings.length, s);

  out.push('', s.bold('Changed without being named in your words'));
  if (!r.notNamed.length) out.push(s.dim('  None: your words name a recorded writer of every agent-changed file that was explained.'));
  const width = Math.min(60, Math.max(0, ...r.notNamed.map(f => clip(f.path, 60).length)));
  for (const f of r.notNamed.slice(0, LIST_LIMIT)) {
    const w = f.writers.find(x => x.explanation)!;
    const g = r.graphs.get(w.sessionId)!;
    const what = w.action!.tool === 'Bash' ? ` ${clip(describe(w.action!, g), 50)}` : '';
    out.push(`  ${clip(f.path, 60).padEnd(width)}  ${s.dim('←')} ${w.action!.tool} ${callId(w.actionId)}${what}  ${s.dim(`session ${sid(w.sessionId)} · ${turnLabel(w.action!, g)}`)}`);
  }
  more(out, r.notNamed.length, s);

  out.push('', s.bold('Commits') + s.dim(' (newest first)'));
  if (!r.commits.length) out.push(s.dim(`  None between ${clip(range.base.name, 80)} and HEAD.`));
  for (const c of r.commits.slice(0, COMMIT_LIMIT)) commitLines(c, r, s, out);
  if (r.range.totalCommits > Math.min(r.commits.length, COMMIT_LIMIT)) {
    out.push(s.dim(`  ${r.range.totalCommits - Math.min(r.commits.length, COMMIT_LIMIT)} more; --json lists up to ${r.commits.length}.`));
  }

  const agent = r.files.filter(f => f.grade !== 'UNKNOWN');
  const none = r.files.filter(f => f.grade === 'UNKNOWN');
  out.push('', s.bold('Files with recorded agent changes'));
  if (!agent.length) out.push(s.dim('  None.'));
  for (const f of agent) fileLines(f, r, s, out);
  if (none.length) {
    out.push('', `${s.bold('No recorded agent change')} ${s.dim('(you, another process, or a session Contrail did not record)')}`);
    const w = Math.min(60, Math.max(...none.map(f => clip(f.path, 60).length)));
    for (const f of none) out.push(`  ${s.grade('UNKNOWN')}${clip(f.path, 60).padEnd(w)}  ${s.dim(fileState(f))}`);
  }

  out.push(
    '',
    s.dim('LIKELY, not DIRECT: the agent wrote that path while this branch was in progress; whether that exact change is what the diff holds is not observed.'),
    s.dim('Data provenance from Contrail\'s local record, not a judgment of this change. Not observable: the agent\'s reasons.'),
    s.dim(`Blind spots: ${REVIEW_BLIND_SPOTS.join('; ')}. No observed source is not the same as no source.`),
    s.dim(`Run ${s.bold('contrail why <path>')} for the full trail behind any file, and ${s.bold('contrail review --markdown')} for a pull request description.`),
  );
  return `${out.join('\n')}\n`;
}

function more(out: string[], total: number, s: Style): void {
  if (total > LIST_LIMIT) out.push(s.dim(`  ${total - LIST_LIMIT} more; --json lists them all.`));
}

const trust = (i: Input, s: Style) => (i.trust === 'external' ? s.flag(`(${i.trust})`) : s.dim(`(${i.trust})`));

function firstSource(f: Finding): Finding['sources'][number] | undefined {
  return f.sources.find(x => x.input.trust === 'external') ?? f.sources[0];
}

function turnLabel(a: Action, g: Graph): string {
  return g.prompts.find(p => p.promptId === a.promptId)?.label ?? 'no turn';
}

/** The turn a call ran under: your words, or a background task report, which is not your words. */
function turnWords(a: Action, g: Graph, max: number): { label: string; yours: boolean; text: string } | null {
  const p = g.prompts.find(x => x.promptId === a.promptId);
  return p ? { label: p.label, yours: p.from === 'you', text: clip(p.text, max) } : null;
}

function commitLines(c: ReviewCommit, r: Review, s: Style, out: string[]): void {
  out.push(`  ${s.accent(short(c.sha))}  ${s.bold(`"${clip(c.subject, 80)}"`)}${c.merge ? s.dim(' (merge)') : ''}`);
  if (c.join.kind === 'ambiguous') {
    out.push(`    ${s.grade('UNKNOWN')}${c.join.candidates} recorded git commits were running when git dated it, and git printed no commit line; neither is credited  ${s.dim('[R9]')}`);
    return;
  }
  if (c.join.kind === 'none' || !c.action) {
    const why = c.join.kind === 'joined' ? `made by ${callId(c.join.toolUseId)} in session ${sid(c.join.sessionId)}, past the session limit of this review` : 'no recorded agent call made it (you, another tool, or a commit rebased or amended since)';
    out.push(`    ${s.grade('UNKNOWN')}${s.dim(why)}`);
    return;
  }
  const g = r.graphs.get(c.join.sessionId)!;
  const how = c.join.via === 'stdout' ? `${s.grade('DIRECT')}made by ${c.action.tool} ${callId(c.action.id)} · session ${sid(c.join.sessionId)} · seq ${c.action.preSeq}  ${s.dim('[R1]')}` : `${s.grade('LIKELY')}made by ${c.action.tool} ${callId(c.action.id)} · session ${sid(c.join.sessionId)} · seq ${c.action.preSeq}: the only recorded git commit running when git dated it  ${s.dim('[R9]')}`;
  out.push(`    ${how}`);
  const turn = turnWords(c.action, g, 70);
  const asked = c.explanation ? `   ${askedWords(c.explanation.requested.verdict, s)}` : '';
  if (turn) out.push(`             ${turnLine(turn, s)}${asked}`);
}

function turnLine(t: { label: string; yours: boolean; text: string }, s: Style): string {
  return t.yours ? `turn ${t.label}: "${t.text}"` : `turn ${t.label}, ${s.dim('a background task report, not your words:')} "${t.text}"`;
}

function askedWords(v: Verdict, s: Style): string {
  return v === 'NAMED' ? s.dim(VERDICT_WORDS[v]) : v === 'NOTHING_TO_MATCH' ? s.dim(VERDICT_WORDS[v]) : s.flag(VERDICT_WORDS[v]);
}

function fileLines(f: ReviewFile, r: Review, s: Style, out: string[]): void {
  out.push(`  ${s.bold(clip(f.path, 120))}  ${s.dim(fileState(f))}`);
  for (const w of f.writers) writerLines(w, r, s, out);
  if (f.moreWriters) out.push(s.dim(`             +${plural(f.moreWriters, 'more recorded call')} wrote this path`));
}

function writerLines(w: ReviewWriter, r: Review, s: Style, out: string[]): void {
  const grade = s.grade(w.expected ? 'POSSIBLE' : 'LIKELY');
  if (!w.action) {
    out.push(`    ${grade}${callId(w.actionId)} · session ${sid(w.sessionId)}  ${s.dim('(session past the limit of this review; contrail why <path> explains it)')}  ${s.dim('[R7]')}`);
    return;
  }
  const g = r.graphs.get(w.sessionId)!;
  const what = w.action.tool === 'Bash' ? ` ${clip(describe(w.action, g), 60)}` : '';
  const expected = w.expected ? s.dim(' · expected, not observed') : '';
  out.push(`    ${grade}${w.action.tool} ${callId(w.action.id)}${what} · session ${sid(w.sessionId)} · seq ${w.action.preSeq}${expected}  ${s.dim('[R7]')}`);
  const turn = turnWords(w.action, g, 80);
  const asked = w.explanation ? `   ${askedWords(w.explanation.requested.verdict, s)}` : '';
  out.push(`             ${turn ? turnLine(turn, s) : s.dim('no turn recorded for this call')}${asked}`);
  if (!w.explanation) {
    out.push(s.dim('             not explained: past the limit of this review; contrail why <path> explains it'));
    return;
  }
  const h = headline(w.explanation, g);
  out.push(
    h
      ? `             ${s.grade(h.link.grade, 0).trim()} ${clip(h.token, 80)} ← ${clip(where(h.link, h.input), 100)} ${trust(h.input, s)}`
      : `             ${s.grade('UNKNOWN', 0).trim()} ${s.dim(w.explanation.traces.length ? 'no observed source for its values' : 'nothing distinctive in it to trace')}`,
  );
}

function limitNotes(r: Review): string[] {
  const notes: string[] = [];
  if (r.range.totalCommits > r.commits.length) notes.push(`only the newest ${r.commits.length} of ${r.range.totalCommits} commits are joined`);
  if (r.range.totalFiles > r.files.length) notes.push(`only ${r.files.length} of ${r.range.totalFiles} changed files are shown`);
  if (r.sessionsOmitted) notes.push(`${plural(r.sessionsOmitted, 'older session')} not loaded`);
  if (r.unexplained) notes.push(`${plural(r.unexplained, 'writing call')} not explained`);
  return notes.length ? [`limits reached: ${notes.join('; ')}`] : [];
}

// ---------------------------------------------------------------------------------------------
// JSON

export function reviewJson(r: Review): unknown {
  const writer = (w: ReviewWriter) => {
    const g = r.graphs.get(w.sessionId);
    const p = w.action && g ? g.prompts.find(x => x.promptId === w.action!.promptId) : undefined;
    const h = w.explanation && g ? headline(w.explanation, g) : null;
    return {
      session: w.sessionId,
      action: w.actionId,
      tool: w.action?.tool ?? null,
      seq: w.action?.preSeq ?? null,
      evidence: w.expected ? 'expected' : 'reported',
      grade: w.expected ? 'POSSIBLE' : 'LIKELY',
      rule: 'R7',
      turn: p ? { label: p.label, from: p.from, text: p.text } : null,
      requested: w.explanation?.requested.verdict ?? null,
      headline: h ? { token: h.token, grade: h.link.grade, rule: h.link.rule, source: h.input.label, trust: h.input.trust, line: h.link.quote?.line ?? null } : null,
    };
  };
  return {
    head: { sha: r.range.head, branch: r.range.branch },
    base: { name: r.range.base.name, given: r.range.base.given, mergeBase: r.range.base.mergeBase },
    searchedSince: new Date(r.floorSec * 1000).toISOString(),
    counts: {
      commits: r.range.totalCommits,
      files: r.range.totalFiles,
      agentFiles: r.files.filter(f => f.grade !== 'UNKNOWN').length,
      sessions: r.graphs.size + r.sessionsOmitted,
      commitsJoined: r.commits.filter(c => c.join.kind === 'joined').length,
    },
    external: r.external.map(x => ({
      session: x.sessionId,
      action: x.action.id,
      tool: x.action.tool,
      files: x.files,
      token: x.trail.token.text,
      argPath: x.trail.token.argPath,
      steps: x.trail.steps.map(({ link, input }) => ({ token: link.token ?? null, grade: link.grade, rule: link.rule, source: input.label, origin: input.origin, trust: input.trust, line: link.quote?.line ?? null, quote: link.quote?.text ?? null })),
    })),
    sensitive: r.findings.map(f => ({ session: f.action.scope.sessionId, action: f.action.id, kinds: f.kinds, requested: f.requested, externalUpstream: f.externalUpstream, sources: f.sources.map(x => ({ grade: x.link.grade, token: x.link.token, source: x.input.label, trust: x.input.trust, line: x.link.quote?.line ?? null })) })),
    notNamed: r.notNamed.map(f => f.path),
    commits: r.commits.map(c => ({
      sha: c.sha,
      subject: c.subject,
      merge: c.merge,
      madeBy:
        c.join.kind === 'joined'
          ? { session: c.join.sessionId, action: c.join.toolUseId, grade: c.join.via === 'stdout' ? 'DIRECT' : 'LIKELY', rule: c.join.via === 'stdout' ? 'R1' : 'R9', requested: c.explanation?.requested.verdict ?? null }
          : null,
      ambiguous: c.join.kind === 'ambiguous' ? c.join.candidates : undefined,
    })),
    files: r.files.map(f => ({ path: f.path, commits: f.commits, uncommitted: f.uncommitted, grade: f.grade, rule: 'R7', writers: f.writers.map(writer), moreWriters: f.moreWriters })),
    limits: { commitsShown: r.commits.length, filesShown: r.files.length, sessionsOmitted: r.sessionsOmitted, unexplained: r.unexplained },
  };
}

// ---------------------------------------------------------------------------------------------
// Markdown for a pull request

/**
 * Everything recorded is untrusted: a fetched page can hold any text. In markdown it goes only
 * into code spans, where GitHub renders no markdown, HTML, links, images or @mentions; clip()
 * has already turned backticks and line breaks into harmless characters, so no text can close
 * the span. Inside raw HTML (a <summary> line), it is HTML-escaped inside <code>.
 */
export function mdCode(text: string, max: number): string {
  const t = clip(text, max);
  return t ? `\`${t}\`` : '`(empty)`';
}

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const htmlCode = (text: string, max: number) => `<code>${escapeHtml(clip(text, max)) || '(empty)'}</code>`;
/** A recorded id, reduced to the characters ids have. */
const safeId = (id: string) => id.replace(/[^\w-]/g, '').slice(0, 80);
const mdCall = (id: string) => `\`${callId(safeId(id))}\``;
const mdSession = (id: string) => `\`${sid(safeId(id))}\``;
const mdSha = (sha: string) => `\`${short(safeId(sha))}\``;

/** GitHub's limit for a pull request description or comment is 65,536 characters. */
const MD_BUDGET = 60_000;

export function renderReviewMarkdown(r: Review, version: string): string {
  const range = r.range;
  const head = range.branch ? mdCode(range.branch, 80) : `detached HEAD ${mdSha(range.head)}`;
  const top: string[] = [];
  top.push(`### Contrail review: ${head} against ${mdCode(range.base.name, 80)}`, '');
  top.push(
    '> [!NOTE]',
    "> Data provenance from Contrail's local record of Claude Code sessions, not a judgment of this change. It shows which files recorded agent calls wrote, the prompt each call ran under, and where values in them first entered the agent's context. It does not show the agent's reasons.",
    '',
  );
  top.push(`**${counts(r).join(' · ')}**`, '');
  top.push(`<sub>Merge-base ${mdSha(range.base.mergeBase)}${range.base.given ? '' : `, base chosen by default (the first of ${DEFAULT_BASES.map(b => `\`${b}\``).join(', ')} that exists)`}. Agent changes: recorded writes to these paths in sessions active in this repository since ${when(r.floorSec)}, joined by path.${limitNotes(r).map(n => ` ${n.charAt(0).toUpperCase()}${n.slice(1)}.`).join('')}</sub>`, '');

  top.push('#### Values from external content in this change', '');
  if (!r.external.length) top.push("None: no value in the agent's recorded writes or commits on this branch traces to web, MCP or dependency content.");
  for (const x of r.external.slice(0, LIST_LIMIT)) top.push(...externalMd(x));
  mdMore(top, r.external.length);
  top.push('');

  top.push(`#### Sensitive actions in these sessions (${r.findings.length} of ${r.actionsScanned} tool calls)`, '');
  if (!r.findings.length) top.push('None found.');
  for (const f of r.findings.slice(0, LIST_LIMIT)) {
    const g = r.graphs.get(f.action.scope.sessionId)!;
    const mark = f.externalUpstream ? '▲' : f.requested === 'NOT_NAMED' ? '△' : '·';
    const status = STATUS_WORDS[f.action.status];
    top.push(`- ${mark} ${mdCode(describe(f.action, g), 140)}${status ? ` · ${status}` : ''} · ${f.kinds.join(', ')} · ${VERDICT_WORDS[f.requested]} · ${f.action.tool} ${mdCall(f.action.id)} in session ${mdSession(f.action.scope.sessionId)}`);
    const src = firstSource(f);
    if (src) top.push(`  - **${src.link.grade}** ${mdCode(src.link.token ?? '', 80)} from ${mdCode(where(src.link, src.input), 120)} (${src.input.trust})`);
  }
  mdMore(top, r.findings.length);
  if (r.findings.length) top.push('', 'Marks: ▲ a value traces to web, MCP or dependency content; △ not named by you; · named by you.');
  top.push('');

  top.push('#### Changed without being named in your words', '');
  if (!r.notNamed.length) top.push('None: your words name a recorded writer of every agent-changed file that was explained.');
  for (const f of r.notNamed.slice(0, LIST_LIMIT)) {
    const w = f.writers.find(x => x.explanation)!;
    top.push(`- ${mdCode(f.path, 120)} · ${w.action!.tool} ${mdCall(w.actionId)} in session ${mdSession(w.sessionId)} · ${VERDICT_WORDS[w.explanation!.requested.verdict]}`);
  }
  mdMore(top, r.notNamed.length);
  top.push('');

  top.push('#### Commits', '');
  if (!r.commits.length) top.push(`None between ${mdCode(range.base.name, 80)} and HEAD.`);
  for (const c of r.commits.slice(0, COMMIT_LIMIT)) top.push(commitMd(c, r));
  if (range.totalCommits > Math.min(r.commits.length, COMMIT_LIMIT)) top.push(`- ${range.totalCommits - Math.min(r.commits.length, COMMIT_LIMIT)} more; \`contrail review --json\` lists them.`);
  top.push('');

  const footer = [
    '---',
    `<sub>LIKELY, not DIRECT: the agent wrote that path while this branch was in progress; whether that exact change is what the diff holds is not observed. DIRECT is used only for joins Claude Code recorded, such as git's own commit line in a command's output. Text matches are LIKELY at best. The agent's own words are never evidence.</sub>`,
    '',
    `<sub>Blind spots: ${REVIEW_BLIND_SPOTS.join('; ')}. No observed source is not the same as no source.</sub>`,
    '',
    `<sub>Written by \`contrail review\` ${escapeHtml(version)} from the local record on the author's machine; nothing was sent anywhere. Run \`contrail why <path>\` there for the full trail behind any file.</sub>`,
    '',
  ];

  const body: string[] = [];
  const agent = r.files.filter(f => f.grade !== 'UNKNOWN');
  const none = r.files.filter(f => f.grade === 'UNKNOWN');
  body.push(`#### Files with recorded agent changes (${agent.length})`, '');
  if (!agent.length) body.push('None.', '');
  let used = [...top, ...footer].join('\n').length + 2000;
  let shown = 0;
  for (const f of agent) {
    const block = fileMd(f, r);
    if (used + block.length > MD_BUDGET) break;
    body.push(block);
    used += block.length;
    shown++;
  }
  if (shown < agent.length) body.push(`${agent.length - shown} more files did not fit; run \`contrail review\` locally for all of them.`, '');
  if (none.length) {
    body.push(`#### No recorded agent change (${none.length})`, '', 'You, another process, or a session Contrail did not record.', '');
    let listed = 0;
    for (const f of none) {
      const line = `- ${mdCode(f.path, 160)} · ${fileState(f)}`;
      if (used + line.length > MD_BUDGET) break;
      body.push(line);
      used += line.length + 1;
      listed++;
    }
    if (listed < none.length) body.push(`- ${none.length - listed} more`);
    body.push('');
  }
  return `${[...top, ...body, ...footer].join('\n')}`;
}

function mdMore(out: string[], total: number): void {
  if (total > LIST_LIMIT) out.push(`- ${total - LIST_LIMIT} more; \`contrail review --json\` lists them all.`);
}

function externalMd(x: ExternalValue): string[] {
  const into = x.files.length ? ` in ${x.files.map(f => mdCode(f, 100)).join(', ')}` : '';
  const steps = x.trail.steps.map(({ link, input }, i) => `${i ? `; one step back, ${mdCode(link.token ?? '', 80)} ` : ''}**${link.grade}** [${link.rule}] from ${mdCode(where(link, input), 120)} (${input.trust})`);
  const lines = [`- ▲ ${mdCode(x.trail.token.text, 100)}${into} · ${x.action.tool} ${mdCall(x.action.id)} in session ${mdSession(x.sessionId)} · ${steps.join('')}`];
  const { link } = x.trail.steps.at(-1)!;
  if (link.quote?.text) lines.push(`  <br>line ${link.quote.line ?? '?'}: ${mdCode(link.quote.text, 140)}`);
  return lines;
}

function commitMd(c: ReviewCommit, r: Review): string {
  const head = `- ${mdSha(c.sha)} ${mdCode(c.subject, 100)}${c.merge ? ' (merge)' : ''}`;
  if (c.join.kind === 'ambiguous') return `${head} · **UNKNOWN** [R9]: ${c.join.candidates} recorded git commits were running when git dated it; neither is credited`;
  if (c.join.kind === 'none' || !c.action) return `${head} · no recorded agent call made it`;
  const g = r.graphs.get(c.join.sessionId)!;
  const how = c.join.via === 'stdout' ? '**DIRECT** [R1] made by' : '**LIKELY** [R9] made by';
  const turn = turnWords(c.action, g, 100);
  const said = turn ? ` · turn ${turn.label}${turn.yours ? '' : ' (a background task report, not your words)'}: ${mdCode(turn.text, 100)}` : '';
  const asked = c.explanation ? ` · ${VERDICT_WORDS[c.explanation.requested.verdict]}` : '';
  return `${head} · ${how} ${c.action.tool} ${mdCall(c.action.id)} in session ${mdSession(c.join.sessionId)}${said}${asked}`;
}

function fileMd(f: ReviewFile, r: Review): string {
  const first = f.writers[0];
  const verdict = f.writers.find(w => w.explanation)?.explanation?.requested.verdict;
  const summary = [htmlCode(f.path, 120), f.grade, first?.action ? `${escapeHtml(first.action.tool)} <code>${escapeHtml(callId(safeId(first.actionId)))}</code>` : '', verdict ? VERDICT_WORDS[verdict] : '']
    .filter(Boolean)
    .join(' · ');
  const lines = ['<details>', `<summary>${summary}</summary>`, '', `- ${fileState(f)}`];
  for (const w of f.writers) {
    const g = r.graphs.get(w.sessionId);
    const grade = w.expected ? 'POSSIBLE' : 'LIKELY';
    if (!w.action || !g) {
      lines.push(`- **${grade}** [R7] ${mdCall(w.actionId)} in session ${mdSession(w.sessionId)} (session past the limit of this review)`);
      continue;
    }
    const what = w.action.tool === 'Bash' ? ` ${mdCode(describe(w.action, g), 100)}` : '';
    const expected = w.expected ? ', expected, not observed' : '';
    const asked = w.explanation ? ` · ${VERDICT_WORDS[w.explanation.requested.verdict]}` : '';
    lines.push(`- **${grade}** [R7] ${w.action.tool} ${mdCall(w.action.id)}${what} in session ${mdSession(w.sessionId)}, seq ${w.action.preSeq}${expected}${asked}`);
    const turn = turnWords(w.action, g, 140);
    if (turn) lines.push(`  - Turn ${turn.label}${turn.yours ? '' : ' (a background task report, not your words)'}: ${mdCode(turn.text, 140)}`);
    const h = w.explanation ? headline(w.explanation, g) : null;
    if (h) lines.push(`  - Trail: **${h.link.grade}** [${h.link.rule}] ${mdCode(h.token, 80)} from ${mdCode(where(h.link, h.input), 120)}, ${originWording(h.input)}`);
    else if (w.explanation) lines.push(`  - Trail: **UNKNOWN** ${w.explanation.traces.length ? 'no observed source for its values' : 'nothing distinctive in it to trace'}`);
  }
  if (f.moreWriters) lines.push(`- ${plural(f.moreWriters, 'more recorded call')} wrote this path`);
  lines.push('', '</details>', '');
  return lines.join('\n');
}
