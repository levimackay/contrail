import { str } from '../util.ts';
import { maxGrade, minGrade } from './grade.ts';
import { requested, splitSentences } from './requested.ts';
import { sameScope, scopeKey } from './scope.ts';
import { extractTokens } from './tokens.ts';
import { traceToken } from './trace.ts';
import type { Action, Explanation, Grade, Graph, Link, TokenTrace } from './types.ts';

export const BASE_BLIND_SPOTS = [
  'model knowledge and reasoning',
  'system prompt',
  'AGENTS.md',
  'context injected by other hooks',
];

/**
 * Everything Contrail can observe about one action. Pure: reads the graph, never
 * the agent's own narration, so what the agent says about itself cannot change a grade.
 */
export function explain(actionId: string, g: Graph): Explanation {
  const action = g.actions.find(a => a.id === actionId);
  if (!action) throw new Error(`No recorded action ${actionId}`);

  const prompt = g.prompts.find(p => p.promptId === action.promptId);
  const turn: Link | null = prompt
    ? { type: 'in_turn', from: action.id, to: `prompt:${prompt.promptId}`, grade: 'DIRECT', rule: 'R1', recorded: true }
    : null;

  const tokens = extractTokens(action, g.env);
  const sentences = g.prompts.filter(p => p.from === 'you').flatMap(p => splitSentences(p.text).map(text => ({ promptId: p.promptId, seq: p.seq, text })));
  const traces = tokens.map(t => traceToken(t, action, g, 0, new Set([action.id])));

  const effects: Link[] = g.effects
    .filter(e => e.actionId === action.id)
    .map(e =>
      e.evidence === 'expected'
        ? { type: 'changed', from: action.id, to: e.id, grade: 'POSSIBLE', rule: 'R6', recorded: false }
        : { type: 'changed', from: action.id, to: e.id, grade: 'DIRECT', rule: 'R1', recorded: true },
    );

  return {
    action,
    turn,
    requested: requested(action, tokens, sentences),
    traces,
    effects,
    chainGrade: chainGrade(traces),
    blindSpots: blindSpots(action, g),
  };
}

/** The weakest link along the headline trail, counting only hops where a source was found. */
export function chainGrade(traces: TokenTrace[]): Grade {
  const found = (t: TokenTrace) => t.links.some(l => l.grade !== 'UNKNOWN');
  const head = traces.find(t => t.token.role === 'target' && found(t)) ?? traces.find(found);
  if (!head) return 'UNKNOWN';
  const grades: Grade[] = [];
  for (let t: TokenTrace | undefined = head; t && found(t); t = t.upstream?.trace) {
    grades.push(maxGrade(t.links.map(l => l.grade)));
  }
  return minGrade(grades);
}

/** What Contrail could not see for this action. Always includes the permanent blind spots. */
export function blindSpots(action: Action, g: Graph): string[] {
  const spots = [...BASE_BLIND_SPOTS];

  const mentions = g.prompts
    .filter(p => p.from === 'you' && p.seq < action.preSeq)
    .flatMap(p => [...p.text.matchAll(/(?:^|\s)@([\w.~/-]+)/g)].map(m => m[1]!));
  if (mentions.length) spots.push(`@-mentioned: ${[...new Set(mentions)].join(', ')} (contents not observable)`);

  if (g.inputs.some(i => i.truncated && sameScope(i.scope, action.scope) && i.availableAt < action.preSeq)) {
    spots.push('some inputs were truncated when stored');
  }

  const skills = g.actions
    .filter(a => a.tool === 'Skill' && a.preSeq < action.preSeq && sameScope(a.scope, action.scope) && !g.inputs.some(i => i.id === `skillbody:${a.id}`))
    .map(a => str(a.input, 'skill') ?? 'unnamed');
  if (skills.length) spots.push(`the body of skill ${[...new Set(skills)].join(', ')} (not recorded; plugin skills are never read)`);

  const unseen = g.prompts.filter(p => p.command && !p.command.bodyObserved && p.seq < action.preSeq).map(p => p.command!.text.split(' ')[0]!);
  if (unseen.length) spots.push(`the text ${[...new Set(unseen)].join(', ')} expanded to (Claude Code records the command, not its body)`);

  const compactions = (g.compactSeqs[scopeKey(action.scope)] ?? []).filter(s => s < action.preSeq);
  if (compactions.length) {
    spots.push(`context compacted at seq ${compactions.join(', ')}; earlier inputs are only visible through the summary`);
  }

  const knownStarts = ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'InstructionsLoaded'];
  if (g.firstEvent && !knownStarts.includes(g.firstEvent)) spots.push('the start of this session was not recorded');

  return spots;
}

/** A path, its basename and its stem are alternatives for one target: keep the best trace of each group. */
export function bestPerGroup(traces: TokenTrace[]): TokenTrace[] {
  const found = (t: TokenTrace) => t.links.some(l => l.grade !== 'UNKNOWN');
  const byGroup = new Map<number, TokenTrace>();
  const out: TokenTrace[] = [];
  for (const t of traces) {
    if (t.token.group === null) {
      out.push(t);
      continue;
    }
    const current = byGroup.get(t.token.group);
    if (!current) {
      byGroup.set(t.token.group, t);
      out.push(t);
    } else if (!found(current) && found(t)) {
      byGroup.set(t.token.group, t);
      out[out.indexOf(current)] = t;
    }
  }
  return out;
}
