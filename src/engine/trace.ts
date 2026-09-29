import { availableTo, firstUse } from './context.ts';
import { gradeSources } from './grade.ts';
import { sameScope, scopeKey } from './scope.ts';
import { findMention } from './text.ts';
import { extractTokens } from './tokens.ts';
import type { Action, Graph, Token, TokenTrace } from './types.ts';

export const MAX_DEPTH = 3;

/**
 * Where one token's value came from, then (R5) how the agent came to call the tool
 * that returned that source, up to MAX_DEPTH hops.
 */
export function traceToken(token: Token, action: Action, g: Graph, depth = 0, visited = new Set([action.id])): TokenTrace {
  const scopeActions = g.actions.filter(a => sameScope(a.scope, action.scope));
  const first = firstUse(token, action, scopeActions);
  const available = availableTo({ scope: action.scope, seq: first.preSeq }, g.inputs, g.compactSeqs[scopeKey(action.scope)] ?? []);
  const candidates = available.filter(i => findMention(i.text, token.text) >= 0);
  const links = gradeSources(token, candidates, action.id);

  const trace: TokenTrace = {
    token,
    firstUse: first === action ? null : { actionId: first.id, preSeq: first.preSeq },
    searched: { count: available.length, beforeSeq: first.preSeq },
    links,
    upstream: null,
  };
  if (depth >= MAX_DEPTH) return trace;

  const best = links.find(l => l.grade === 'LIKELY') ?? links.find(l => l.firstSeen);
  const source = best?.to ? g.inputs.find(i => i.id === best.to) : undefined;
  const producer = source?.producedBy ? g.actions.find(a => a.id === source.producedBy) : undefined;
  if (!source || !producer || visited.has(producer.id)) return trace;
  visited.add(producer.id);

  // Agent-written text (a subagent's instructions, a report) is a conduit, never an origin:
  // follow the same name further back. Any other source: ask why the agent called that tool.
  const next = source.trust === 'agent' ? traceToken(token, producer, g, depth + 1, visited) : headline(producer, g, depth + 1, visited);
  if (next) trace.upstream = { via: producer, trace: next };
  return trace;
}

/** The most telling trace for an action: a target with a found source, else any found, else its first token. */
export function headline(action: Action, g: Graph, depth: number, visited: Set<string>): TokenTrace | null {
  const traces = extractTokens(action, g.env).map(t => traceToken(t, action, g, depth, visited));
  const found = (t: TokenTrace) => t.links.some(l => l.grade !== 'UNKNOWN');
  return traces.find(t => t.token.role === 'target' && found(t)) ?? traces.find(found) ?? traces[0] ?? null;
}
