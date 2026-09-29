import type { Action, Effect, Explanation, Graph, Input, Link, TokenTrace } from '../engine/types.ts';
import { clip, displayPath, str } from '../util.ts';

/**
 * All of Contrail's wording lives here. Two rules hold everywhere:
 * it reports where values came from, never why the agent decided; and it
 * never uses causal or accusatory words about the agent (a test enforces this).
 */

export const HEADING = "Where the values came from (data provenance, not the agent's reasons)";
export const FOOTER = [
  'LIKELY means "this value first appeared in the agent\'s context from this source", not "this source made the agent act".',
  "Not observable: the agent's reasons for this action.",
];

const grade = (g: string) => g.padEnd(9);

export function renderWhy(e: Explanation, g: Graph, note?: string): string {
  const out: string[] = [];
  const a = e.action;
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const prompt = g.prompts.find(p => p.promptId === a.promptId);

  out.push(`${a.tool}  ${describe(a, g)}`);
  out.push(
    `  session ${a.scope.sessionId.slice(0, 8)} · ${prompt ? `turn ${prompt.label}` : 'turn not recorded'} · ${a.id} · seq ${a.preSeq}` +
      ` · ${a.scope.agentId ? `subagent ${a.scope.agentId}` : 'main agent'}${a.status === 'ok' ? '' : ` · ${a.status.toUpperCase()}`}`,
  );
  if (note) out.push(`  ${note}`);
  out.push('');

  out.push(...requestedLines(e));
  out.push(
    prompt
      ? `Turn        ${grade('DIRECT')}ran while answering ${prompt.label}: "${clip(prompt.text, 70)}"  [R1]`
      : `Turn        ${grade('UNKNOWN')}no prompt was recorded for this action`,
  );
  out.push('', HEADING);

  const found = e.traces.filter(t => t.links.some(l => l.grade !== 'UNKNOWN'));
  const unfound = e.traces.filter(t => !found.includes(t));
  for (const t of found) trace(t, 1, out, inputs);
  if (unfound.length) out.push(`  ${grade('UNKNOWN')}no observed source for: ${unfound.map(t => t.token.text).join(', ')}  [R4]`);
  if (!e.traces.length) out.push('  nothing distinctive in this action to trace');
  const searched = e.traces[0]?.searched;
  if (searched) {
    out.push(`  (searched ${searched.count} input${searched.count === 1 ? '' : 's'} in this agent's context before seq ${searched.beforeSeq})`);
  }
  out.push('');

  if (e.effects.length) {
    out.push('Effects');
    const shown = e.effects.map(l => ({ l, fx: g.effects.find(x => x.id === l.to) })).filter(x => x.fx);
    const width = Math.max(...shown.map(x => x.fx!.target.length));
    for (const { l, fx } of shown) {
      if (!fx) continue;
      out.push(`  ${grade(l.grade)}${fx.target.padEnd(width)}  ${effectWording(fx)}  [R1 ${fx.evidence}]`);
      for (const line of fx.patch.slice(0, 6)) out.push(`      ${clip(line, 100)}`);
    }
    out.push('');
  }

  out.push(`Weakest link on this trail: ${e.chainGrade}`);
  out.push(...FOOTER);
  const said = a.scope.agentId ? g.agentSaid.byAgent[a.scope.agentId] : a.promptId ? g.agentSaid.byPrompt[a.promptId] : undefined;
  if (said) out.push(`Agent said (shown for context, never used as evidence): "${clip(said, 220)}"`);
  out.push(`Blind spots: ${e.blindSpots.join('; ')}. No observed source is not the same as no source.`);
  return `${out.join('\n')}\n`;
}

function trace(t: TokenTrace, depth: number, out: string[], inputs: Map<string, Input>): void {
  const pad = '  '.repeat(depth);
  const firstUse = t.firstUse ? `, first used in ${t.firstUse.actionId} at seq ${t.firstUse.preSeq}` : '';
  out.push(`${pad}${t.token.text}  (${t.token.argPath}${firstUse})`);

  for (const l of t.links) {
    if (!l.to) {
      out.push(`${pad}  ${grade(l.grade)}${l.note}  [${l.rule}]`);
      continue;
    }
    const src = inputs.get(l.to);
    if (!src) continue;
    const where = l.quote?.line != null ? `${src.label}:${l.quote.line}` : src.label;
    out.push(`${pad}  ${grade(l.grade)}${sourceWording(l, where)}  [${l.rule}]`);
    if (l.quote?.text) out.push(`${pad}           ${l.quote.line != null ? `${l.quote.line}│ ` : '│ '}${clip(l.quote.text, 100)}`);
    out.push(`${pad}           ${originWording(src)}${src.producedBy ? ` · returned by ${src.producedBy} (seq ${src.availableAt})` : ''}`);
  }
  if (t.links.every(l => l.grade === 'UNKNOWN') && depth > 1) out.push(`${pad}  the trail starts here: the reason is not observable`);

  if (t.upstream) {
    out.push(`${pad}  how the agent came to call ${t.upstream.via.tool} ${t.upstream.via.id}:`);
    trace(t.upstream.trace, depth + 2, out, inputs);
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

function originWording(i: Input): string {
  if (i.origin === 'instructions') {
    return i.trust === 'local' ? 'repo instructions (repo content, not you)' : 'your instructions (user-level)';
  }
  return `${ORIGIN_WORDING[i.origin]} (${i.trust})`;
}

function requestedLines(e: Explanation): string[] {
  const r = e.requested;
  const quoted = r.sentence ? `"${clip(r.sentence.text, 80)}"` : '';
  switch (r.verdict) {
    case 'NAMED':
      return [
        `Requested?  NAMED  ${quoted}  [R8 ${r.grade}]`,
        '            "Named" means your words contain it. It is not a judgment of intent or permission.',
      ];
    case 'NAMED_NEGATED':
      return [`Requested?  NAMED, BUT YOUR LATEST MENTION IS NEGATED: ${quoted}  [R8 ${r.grade}]`];
    case 'PARTLY_NAMED':
      return [`Requested?  PARTLY NAMED  ${quoted} names ${r.matched}, not everything this action targets  [R8 ${r.grade}]`];
    case 'NOT_NAMED': {
      const yours = r.searched === 1 ? 'Your 1 sentence this session does not' : `None of your ${r.searched} sentences this session`;
      return [`Requested?  NOT NAMED (the agent chose this). ${yours} name it.  [R8]`];
    }
    case 'NOTHING_TO_MATCH':
      return ['Requested?  nothing specific in this action to match against your words  [R8]'];
  }
}

function describe(a: Action, g: Graph): string {
  const path = str(a.input, 'file_path') ?? str(a.input, 'notebook_path');
  if (path) return displayPath(path, g.env.cwd, g.env.home);
  if (a.tool === 'Bash') return clip(str(a.input, 'command') ?? '', 90);
  if (a.tool === 'WebFetch') return str(a.input, 'url') ?? '';
  return clip(JSON.stringify(a.input), 90);
}

function effectWording(fx: Effect): string {
  if (fx.evidence === 'filePath') return 'written by this call';
  if (fx.evidence === 'bashEditDiff') return 'changed while this command ran';
  return 'request made and answered';
}
