import type { Action, Effect, Explanation, Graph, Input, Link, TokenTrace } from '../engine/types.ts';
import { bestPerGroup } from '../engine/explain.ts';
import { clip, displayPath, str } from '../util.ts';
import { callId, PLAIN, type Style } from './style.ts';

/**
 * All of Contrail's wording lives in render/. Two rules hold everywhere: it reports where
 * values came from, never why the agent decided; and it never uses causal or accusatory
 * words about the agent (a test enforces this).
 */

export const HEADING = "Where the values came from (data provenance, not the agent's reasons)";
export const FOOTER = [
  'LIKELY means "this value first appeared in the agent\'s context from this source", not "this source made the agent act".',
  "Not observable: the agent's reasons for this action.",
];

export function renderWhy(e: Explanation, g: Graph, note?: string, s: Style = PLAIN): string {
  const out: string[] = [];
  const a = e.action;
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const prompt = g.prompts.find(p => p.promptId === a.promptId);

  out.push(`${s.bold(a.tool)}  ${s.bold(describe(a, g))}`);
  out.push(
    s.dim(
      `  session ${a.scope.sessionId.slice(0, 8)} · ${prompt ? `turn ${prompt.label}` : 'turn not recorded'} · ${callId(a.id)} · seq ${a.preSeq}` +
        ` · ${a.scope.agentId ? `subagent ${a.scope.agentId}` : 'main agent'}${a.status === 'ok' ? '' : ` · ${a.status.toUpperCase()}`}`,
    ),
  );
  if (note) out.push(s.dim(`  ${note}`));
  out.push('');

  out.push(...requestedLines(e, s));
  out.push(
    prompt
      ? `Turn        ${s.grade('DIRECT')}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  ${s.dim('[R1]')}`
      : `Turn        ${s.grade('UNKNOWN')}no prompt was recorded for this action`,
  );
  out.push('', s.bold(HEADING));

  // A path, its basename and its stem are alternatives for one target: show only the best of each group.
  const shown = bestPerGroup(e.traces);
  const found = shown.filter(t => t.links.some(l => l.grade !== 'UNKNOWN'));
  const unfound = shown.filter(t => !found.includes(t));
  for (const t of found) trace(t, 1, out, inputs, s);
  if (unfound.length) {
    out.push(`  ${s.grade('UNKNOWN')}no observed source for: ${unfound.map(t => t.token.text).join(', ')}  ${s.dim('[R4]')}`);
  }
  if (!e.traces.length) out.push(s.dim('  nothing distinctive in this action to trace'));
  const searched = e.traces[0]?.searched;
  if (searched) {
    out.push(s.dim(`  (searched ${searched.count} input${searched.count === 1 ? '' : 's'} in this agent's context before seq ${searched.beforeSeq})`));
  }
  out.push('');

  const effects = e.effects.map(l => ({ l, fx: g.effects.find(x => x.id === l.to) })).filter((x): x is { l: Link; fx: Effect } => !!x.fx);
  if (effects.length) {
    out.push(s.bold('Effects'));
    const width = Math.max(...effects.map(x => x.fx.target.length));
    for (const { l, fx } of effects) {
      out.push(`  ${s.grade(l.grade)}${fx.target.padEnd(width)}  ${effectWording(fx)}  ${s.dim(`[${l.rule} ${fx.evidence}]`)}`);
      for (const line of fx.patch.slice(0, 6)) out.push(s.dim(`      ${clip(line, 100)}`));
    }
    out.push('');
  }

  out.push(`${s.bold('Weakest link on this trail:')} ${s.grade(e.chainGrade, 0).trim()}`);
  for (const line of FOOTER) out.push(s.dim(line));
  const said = a.scope.agentId ? g.agentSaid.byAgent[a.scope.agentId] : a.promptId ? g.agentSaid.byPrompt[a.promptId] : undefined;
  if (said) out.push(s.dim(`Agent said (shown for context, never used as evidence): "${clip(said, 220)}"`));
  out.push(s.dim(`Blind spots: ${e.blindSpots.join('; ')}. No observed source is not the same as no source.`));
  return `${out.join('\n')}\n`;
}

function trace(t: TokenTrace, depth: number, out: string[], inputs: Map<string, Input>, s: Style): void {
  const pad = '  '.repeat(depth);
  const firstUse = t.firstUse ? `, first used in ${callId(t.firstUse.actionId)} at seq ${t.firstUse.preSeq}` : '';
  out.push(`${pad}${s.accent(t.token.text)}  ${s.dim(`(${t.token.argPath}${firstUse})`)}`);

  for (const l of t.links) {
    if (!l.to) {
      out.push(`${pad}  ${s.grade(l.grade)}${l.note}  ${s.dim(`[${l.rule}]`)}`);
      continue;
    }
    const src = inputs.get(l.to);
    if (!src) continue;
    const where = l.quote?.line != null ? `${src.label}:${l.quote.line}` : src.label;
    out.push(`${pad}  ${s.grade(l.grade)}${sourceWording(l, where)}  ${s.dim(`[${l.rule}]`)}`);
    if (l.quote?.text) out.push(`${pad}           ${s.dim(l.quote.line != null ? `${l.quote.line}│` : '│')} ${clip(l.quote.text, 100)}`);
    const origin = originWording(src);
    out.push(`${pad}           ${src.trust === 'external' ? s.flag(origin) : s.dim(origin)}${s.dim(src.producedBy ? ` · returned by ${callId(src.producedBy)} (seq ${src.availableAt})` : '')}`);
  }
  if (t.links.every(l => l.grade === 'UNKNOWN') && depth > 1) out.push(s.dim(`${pad}  the trail starts here: the reason is not observable`));

  if (t.upstream) {
    const u = t.upstream;
    const heading =
      u.kind === 'call'
        ? `how the agent came to call ${u.via?.tool} ${callId(u.via?.id ?? '')}:`
        : u.kind === 'conduit'
          ? `that text was written by the agent (${u.via?.tool} ${callId(u.via?.id ?? '')}); following the same value back:`
          : 'a compaction summary is agent-written; the same value before the compaction:';
    out.push(s.dim(`${pad}  ${heading}`));
    trace(u.trace, depth + 2, out, inputs, s);
  }
}

function sourceWording(l: Link, where: string): string {
  if (l.note === 'you supplied it') return `you supplied it: ${where}`;
  if (l.note === 'also in') return `also in ${where}`;
  if (l.grade === 'LIKELY') return `only observed in ${where}`;
  if (l.firstSeen) return `could be from ${where} (seen first)`;
  if (l.note) return `${where} (${l.note})`;
  return `could be from ${where}`;
}

const ORIGIN_WORDING: Record<Input['origin'], string> = {
  prompt: 'your words',
  template: 'slash-command template',
  instructions: 'instructions file',
  file: 'repo file',
  dependency_file: 'dependency file, written by a third party',
  search: 'search output',
  shell: 'shell output',
  web: "web page, as a model's extraction of it, not the page itself",
  web_search: 'web search results',
  mcp: 'MCP server result',
  skill: 'skill',
  subagent_prompt: 'agent-written instructions to a subagent',
  subagent_result: 'agent-written subagent report',
  compaction: 'agent-written compaction summary',
  tool_output: 'tool output',
};

export function originWording(i: Input): string {
  if (i.origin === 'instructions') {
    return i.trust === 'local' ? 'repo instructions (repo content, not you)' : 'your instructions (user-level)';
  }
  return `${ORIGIN_WORDING[i.origin]} (${i.trust})`;
}

function requestedLines(e: Explanation, s: Style): string[] {
  const r = e.requested;
  const quoted = r.sentence ? `"${clip(r.sentence.text, 80)}"` : '';
  const tag = (t: string) => s.dim(`[${t}]`);
  switch (r.verdict) {
    case 'NAMED':
      return [
        `Requested?  ${s.bold('NAMED')}  ${quoted}  ${tag(`R8 ${r.grade}`)}`,
        s.dim('            "Named" means your words contain it. It is not a judgment of intent or permission.'),
      ];
    case 'NAMED_NEGATED':
      return [`Requested?  ${s.flag('NAMED, BUT YOUR LATEST MENTION IS NEGATED:')} ${quoted}  ${tag(`R8 ${r.grade}`)}`];
    case 'PARTLY_NAMED':
      return [`Requested?  ${s.bold('PARTLY NAMED')}  ${quoted} names ${r.matched}, not everything this action targets  ${tag(`R8 ${r.grade}`)}`];
    case 'NOT_NAMED': {
      const yours = r.searched === 1 ? 'Your 1 sentence this session does not' : `None of your ${r.searched} sentences this session`;
      return [`Requested?  ${s.flag('NOT NAMED')} (the agent chose this). ${yours} name it.  ${tag('R8')}`];
    }
    case 'NOTHING_TO_MATCH':
      return [`Requested?  nothing specific in this action to match against your words  ${tag('R8')}`];
  }
}

export function describe(a: Action, g: Graph): string {
  const path = str(a.input, 'file_path') ?? str(a.input, 'notebook_path');
  if (path) return displayPath(path, g.env.cwd, g.env.home);
  if (a.tool === 'Bash') return clip(str(a.input, 'command') ?? '', 90);
  if (a.tool === 'WebFetch') return clip(str(a.input, 'url') ?? '', 90);
  if (a.tool === 'Agent' || a.tool === 'Task') return clip(str(a.input, 'description') ?? str(a.input, 'prompt') ?? '', 90);
  if (a.tool === 'Grep' || a.tool === 'Glob') {
    const where = str(a.input, 'path');
    return clip(`${JSON.stringify(str(a.input, 'pattern') ?? '')}${where ? ` in ${displayPath(where, g.env.cwd, g.env.home)}` : ''}`, 90);
  }
  if (a.tool === 'WebSearch') return clip(JSON.stringify(str(a.input, 'query') ?? ''), 90);
  if (a.tool === 'Skill') return str(a.input, 'skill') ?? '';
  if (a.tool.startsWith('mcp__')) return clip(`${a.tool.slice(5).replace('__', '/')} ${JSON.stringify(a.input)}`, 90);
  return clip(JSON.stringify(a.input), 90);
}

export function effectWording(fx: Effect): string {
  if (fx.evidence === 'filePath') return 'written by this call';
  if (fx.evidence === 'bashEditDiff') return 'changed while this command ran';
  if (fx.evidence === 'commit_stdout') return 'commit made by this command';
  if (fx.evidence === 'expected') return fx.kind === 'network' ? 'the command names this host; the request itself was not observed' : 'expected for this kind of command, not observed';
  return 'request made and answered';
}
