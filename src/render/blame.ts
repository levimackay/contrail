import { blameBlocks, type LineBlame } from '../engine/blame.ts';
import { bestPerGroup } from '../engine/explain.ts';
import { findMention } from '../engine/text.ts';
import { headlineTrace } from '../engine/tree.ts';
import type { Input, TokenTrace } from '../engine/types.ts';
import type { Blame, BlameCall } from '../query/blame.ts';
import { clip } from '../util.ts';
import { localTime, traceSource, trailDetail } from './session.ts';
import { callId, PLAIN, type Style } from './style.ts';

export const BLAME_FOOTER = [
  'LIKELY: this call wrote this text to this file, and no later recorded write did [R10]. A text match, so never DIRECT.',
  'POSSIBLE: the file holds the text more often than this call wrote it, or the shell write was expected, not reported.',
  'UNKNOWN: no recorded agent write holds the text. Blank and bracket-only lines join a block only if both sides agree.',
  "Which call last wrote a line is data provenance, not the agent's reasons.",
];
const BLIND_SPOTS = [
  "Blind spots: edits outside Claude Code's tools or before Contrail was installed; text redacted or cut when stored.",
  'A Write counts every line it wrote, even unchanged ones. No match is not the same as not written by the agent.',
];

const CODE_WIDTH = 104;

/**
 * contrail blame: the file as it is now, each block of lines under the recorded agent call
 * that last wrote that text, with the call's turn and headline trail.
 */
export function renderBlame(b: Blame, shown: string, s: Style = PLAIN): string {
  const out: string[] = [];
  const total = b.lines.length;
  const attributed = b.lines.filter(l => l.call).length;
  const sessions = new Set(b.calls.map(c => c.sessionId)).size;
  out.push(`${s.bold('Blame')} ${s.bold(clip(shown, 110))}  ${s.dim('(the file as it is now)')}`);
  out.push(
    s.dim(
      `${attributed} of ${total} line${total === 1 ? '' : 's'} attributed to ${plural(b.calls.length, 'recorded agent call')} in ${plural(sessions, 'session')}` +
        ` · ${plural(b.writes, 'recorded write')} to this file${b.read < b.writes ? ` (the newest ${b.read} read)` : ''}` +
        (b.session ? ` · only session ${b.session.slice(0, 8)}` : ''),
    ),
  );
  if (b.latestTextless) {
    const which = b.textless === 1 ? `1 of them (${b.latestTextless.tool} ${callId(b.latestTextless.id)})` : `${b.textless} of them`;
    out.push(s.dim(`${which} recorded no text to match (a shell write other than a literal heredoc).`));
    out.push(s.dim(`contrail why ${clip(shown, 80)} shows the latest write to the file.`));
  }

  const calls = new Map(b.calls.map(c => [c.id, c]));
  const shownCalls = new Set<string>();
  const gutter = Math.max(4, String(total).length);
  for (const block of blameBlocks(b.lines)) {
    out.push('');
    const call = block.call ? calls.get(block.call) : undefined;
    if (!call) {
      out.push(`${s.grade('UNKNOWN')}${s.dim('no recorded agent write holds these lines (they may be yours, pre-existing, or changed since)')}`);
    } else if (shownCalls.has(call.id)) {
      out.push(`${s.grade(block.grade!)}${call.tool} ${callId(call.id)} ${s.dim('(shown above)')}`);
    } else {
      shownCalls.add(call.id);
      out.push(...callHeader(call, block.grade!, s));
    }
    const text = b.lines.slice(block.start - 1, block.end).map(l => l.text).join('\n');
    const value = call?.explanation ? blockValue(call, text) : undefined;
    if (value && call?.graph) {
      const from = traceSource(value, new Map(call.graph.inputs.map(i => [i.id, i])), s);
      if (from) out.push(`         ${s.dim('↳ in these lines:')} ${from}`);
    }
    for (const l of b.lines.slice(block.start - 1, block.end)) {
      const code = codeLine(l.text, CODE_WIDTH);
      out.push(`${s.dim(`${String(l.line).padStart(gutter)} │`)} ${call ? code : s.dim(code)}`.trimEnd());
    }
  }

  out.push('');
  const example = b.calls[0] ? `, as in ${s.bold(`contrail why ${callId(b.calls[0].id)}`)}` : '';
  out.push(s.dim(`Run contrail why <call id>${example}, or contrail why <file>:<line>, for the full trail behind a call.`));
  for (const line of BLAME_FOOTER) out.push(s.dim(line));
  for (const line of BLIND_SPOTS) out.push(s.dim(line));
  return `${out.join('\n')}\n`;
}

function callHeader(call: BlameCall, grade: string, s: Style): string[] {
  const a = call.action;
  const g = call.graph;
  const prompt = a && g ? g.prompts.find(p => p.promptId === a.promptId) : undefined;
  const who = a?.scope.agentId ? s.dim(` · subagent ${callId(a.scope.agentId)}`) : '';
  const tool = call.tool === 'Bash' ? 'Bash heredoc' : call.tool;
  const lines = [`${s.grade(grade)}${s.bold(`${tool} ${callId(call.id)}`)}${s.dim(` · session ${call.sessionId.slice(0, 8)} · ${localTime(call.us)}`)}${who}`];
  if (a) {
    lines.push(
      `         ${
        !prompt
          ? s.dim('turn not recorded')
          : prompt.from === 'task'
            ? `${prompt.label} ${s.dim('a background task report, not your words:')} "${clip(prompt.text, 70)}"`
            : `${prompt.label} ${s.dim('your words:')} "${clip(prompt.text, 90)}"`
      }`,
    );
  }
  if (!call.observed) lines.push(`         ${s.dim('the write was expected from the command, not reported by Claude Code')}`);
  if (call.explanation && g) {
    const detail = trailDetail(call.explanation, new Map(g.inputs.map(i => [i.id, i])), s);
    if (detail) lines.push(`         ${s.dim('↳')} ${detail}`);
  } else {
    lines.push(`         ${s.dim(`trail not loaded here (too many calls); run contrail why ${callId(call.id)}`)}`);
  }
  return lines;
}

/** A traced value of the call that appears in these lines and is not its headline: what these lines hold. */
function blockValue(call: BlameCall, text: string): TokenTrace | undefined {
  const e = call.explanation!;
  const head = headlineTrace(e);
  return bestPerGroup(e.traces).find(
    t => t !== head && t.token.argPath !== '$.file_path' && t.links.some(l => l.grade !== 'UNKNOWN') && findMention(text, t.token.text) >= 0,
  );
}

/**
 * One line of the file, safe to print and still readable as code: indentation kept, tabs as four
 * spaces, control characters (terminal escapes, C1 controls) and bidi overrides shown as �, and
 * backticks as ˋ so the text cannot close a code block when a report is shown inside Claude Code.
 */
export function codeLine(raw: string, max: number): string {
  const safe = raw
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '�')
    .replace(/`/g, 'ˋ')
    .trimEnd();
  const chars = [...safe];
  return chars.length <= max ? safe : `${chars.slice(0, max - 1).join('')}…`;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const lineRef = (t: { shown: string; start: number; end: number }) => `${clip(t.shown, 100)}:${t.start}${t.end === t.start ? '' : `-${t.end}`}`;

/** The line above a why report reached through file:line: which call last wrote it, and how that was matched. */
export function renderLineNote(t: { shown: string; start: number; end: number }, line: LineBlame, call: BlameCall, s: Style = PLAIN): string {
  const which = t.end === t.start ? lineRef(t) : `${lineRef(t)}: line ${line.line}`;
  const how =
    line.match === 'block'
      ? 'a blank or bracket-only line between lines this call wrote'
      : !call.observed
        ? "matched by the line's text; the shell write was expected, not reported"
        : line.unambiguous
          ? "matched by the line's text"
          : `matched by the line's text, which occurs ${line.inFile} times in the file; this call wrote it ${line.byCall === 1 ? 'once' : `${line.byCall} times`}`;
  return `${s.bold(which)} was last written by ${s.bold(callId(call.id))} ${s.dim(`(session ${call.sessionId.slice(0, 8)}, ${localTime(call.us)})`)}; ${s.grade(line.grade!, 0).trim()} — ${how} ${s.dim('[R10]')}`;
}

/** When no recorded agent write holds the line: say so, and where to look instead. */
export function noLineWriter(t: { shown: string; start: number; end: number }): string {
  const what = t.end === t.start ? `line ${lineRef(t)}` : `any of lines ${lineRef(t)}`;
  return `No recorded agent write holds ${what} as it is now (it may be yours, pre-existing, or changed since). Run contrail blame ${clip(t.shown, 100)} to see which lines are attributed.`;
}

/** The same, as data: every line, the blocks, and each credited call with its turn and headline trail. */
export function blameJson(b: Blame): unknown {
  return {
    file: b.path,
    lines: b.lines.length,
    attributed: b.lines.filter(l => l.call).length,
    calls: b.calls.length,
    sessions: new Set(b.calls.map(c => c.sessionId)).size,
    writes: { recorded: b.writes, read: b.read },
    session: b.session,
    blocks: blameBlocks(b.lines).map(x => ({ ...x, rule: x.call ? 'R10' : null })),
    lineDetail: b.lines.map(l => ({
      line: l.line,
      call: l.call,
      grade: l.grade,
      rule: l.call ? 'R10' : null,
      match: l.match,
      trivial: l.trivial,
      unambiguous: l.unambiguous,
      writers: l.writers,
      inFile: l.inFile,
      byCall: l.byCall,
    })),
    writers: b.calls.map(c => {
      const inputs = new Map<string, Input>(c.graph?.inputs.map(i => [i.id, i]) ?? []);
      const prompt = c.action && c.graph ? c.graph.prompts.find(p => p.promptId === c.action!.promptId) : undefined;
      const head = c.explanation ? headlineTrace(c.explanation) : undefined;
      const link = head?.links.find(l => l.grade !== 'UNKNOWN');
      const src = link?.to ? inputs.get(link.to) : undefined;
      return {
        call: c.id,
        session: c.sessionId,
        tool: c.tool,
        at: new Date(Math.floor(c.us / 1000)).toISOString(),
        file: c.observed ? { grade: 'DIRECT', rule: 'R1' } : { grade: 'POSSIBLE', rule: 'R6' },
        agent: c.action?.scope.agentId ?? null,
        turn: prompt ? { label: prompt.label, from: prompt.from, text: prompt.text } : null,
        requested: c.explanation?.requested.verdict ?? null,
        trail:
          head && link && src
            ? { token: head.token.text, grade: link.grade, rule: link.rule, source: src.label, trust: src.trust, origin: src.origin, line: link.quote?.line ?? null }
            : null,
        chainGrade: c.explanation?.chainGrade ?? null,
      };
    }),
  };
}
