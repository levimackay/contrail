import { stringLeaves } from '../util.ts';
import { availableTo, firstUse, normalizedText } from './context.ts';
import { gradeSources } from './grade.ts';
import { sameScope, scopeKey } from './scope.ts';
import { findMention, findNormalized, normalize } from './text.ts';
import { extractTokens } from './tokens.ts';
import type { Action, Graph, Input, Scope, Token, TokenTrace } from './types.ts';

export const MAX_DEPTH = 3;

/** How many of an upstream action's tokens are traced, targets first. Bounds the work per hop. */
const UPSTREAM_TOKENS = 8;

/**
 * Where one token's value came from: the inputs the agent could see before it first
 * used the token, graded (R2–R4), then one step further back (R5), up to MAX_DEPTH hops.
 */
export function traceToken(token: Token, action: Action, g: Graph, depth = 0, visited = new Set([action.id])): TokenTrace {
  const first = firstUse(token, action, g.actions.filter(a => sameScope(a.scope, action.scope)));
  const firstUseInfo = first === action ? null : { actionId: first.id, preSeq: first.preSeq };
  return traceAt(token, { scope: action.scope, seq: first.preSeq }, action.id, firstUseInfo, g, depth, visited);
}

function traceAt(
  token: Token,
  probe: { scope: Scope; seq: number },
  fromId: string,
  firstUseInfo: TokenTrace['firstUse'],
  g: Graph,
  depth: number,
  visited: Set<string>,
): TokenTrace {
  const available = availableTo(probe, g.inputs, g.compactSeqs[scopeKey(probe.scope)] ?? []);
  const needle = normalize(token.text);
  const candidates = available.filter(i => findNormalized(normalizedText(i), needle) >= 0);
  const links = gradeSources(token, candidates, fromId);
  const trace: TokenTrace = {
    token,
    firstUse: firstUseInfo,
    searched: { count: available.length, beforeSeq: probe.seq },
    links,
    upstream: null,
  };
  if (depth >= MAX_DEPTH) return trace;

  const best = links.find(l => l.grade === 'LIKELY') ?? links.find(l => l.firstSeen);
  const source = best?.to ? g.inputs.find(i => i.id === best.to) : undefined;
  if (source) trace.upstream = followSource(token, source, g, depth + 1, visited);
  return trace;
}

/**
 * R5, one step back from a credited source. Agent-written text is a conduit, never an origin:
 *  - a compaction summary: look for the same name before the compaction
 *  - a file the agent wrote earlier and then read: follow the same name into that write
 *  - a subagent's instructions or report: follow the same name into the call that carried it
 * Any other source: ask how the agent came to call the tool that returned it.
 */
function followSource(token: Token, source: Input, g: Graph, depth: number, visited: Set<string>): TokenTrace['upstream'] {
  if (source.origin === 'compaction') {
    if (visited.has(source.id)) return null;
    visited.add(source.id);
    const before = traceAt(token, { scope: source.scope, seq: source.availableAt }, source.id, null, g, depth, visited);
    return { kind: 'compaction', via: null, trace: before };
  }

  // A subagent's report: look for the same value inside the subagent's own context.
  if (source.relays) {
    const via = source.producedBy ? g.actions.find(a => a.id === source.producedBy) : undefined;
    const key = `relay:${source.id}`;
    if (!via || visited.has(key)) return null;
    visited.add(key);
    return { kind: 'conduit', via, trace: traceAt(token, { scope: source.relays, seq: source.availableAt }, source.id, null, g, depth, visited) };
  }

  const writer = source.origin === 'file' ? agentWriter(token, source, g) : undefined;
  if (writer && !visited.has(writer.id)) {
    visited.add(writer.id);
    return { kind: 'conduit', via: writer, trace: traceToken(token, writer, g, depth, visited) };
  }

  const producer = source.producedBy ? g.actions.find(a => a.id === source.producedBy) : undefined;
  if (!producer || visited.has(producer.id)) return null;
  visited.add(producer.id);
  if (source.trust === 'agent') return { kind: 'conduit', via: producer, trace: traceToken(token, producer, g, depth, visited) };
  const next = headline(producer, g, depth, visited);
  return next ? { kind: 'call', via: producer, trace: next } : null;
}

/** The latest earlier call in which the agent itself wrote this token into the file it later read. */
function agentWriter(token: Token, source: Input, g: Graph): Action | undefined {
  const read = g.actions.find(a => a.id === source.producedBy);
  const path = read ? (read.input.file_path as string | undefined) : undefined;
  if (!path) return undefined;
  const writes = g.effects
    .filter(e => e.kind === 'file' && e.path === path && e.evidence !== 'expected')
    .map(e => g.actions.find(a => a.id === e.actionId))
    .filter((a): a is Action => !!a && a.preSeq < source.availableAt)
    .filter(a => stringLeaves(a.input).some(l => findMention(l.value, token.text) >= 0));
  return writes.sort((a, b) => b.preSeq - a.preSeq)[0];
}

/** The most telling trace for an action: a target with a found source, else any found, else its first token. */
export function headline(action: Action, g: Graph, depth: number, visited: Set<string>): TokenTrace | null {
  const tokens = extractTokens(action, g.env)
    .sort((a, b) => Number(a.role === 'hint') - Number(b.role === 'hint'))
    .slice(0, UPSTREAM_TOKENS);
  // Each token gets its own copy of the path so far: siblings don't hide each other's upstream.
  const traces = tokens.map(t => traceToken(t, action, g, depth, new Set(visited)));
  const found = (t: TokenTrace) => t.links.some(l => l.grade !== 'UNKNOWN');
  return traces.find(t => t.token.role === 'target' && found(t)) ?? traces.find(found) ?? traces[0] ?? null;
}
