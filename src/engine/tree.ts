import type { Action, Explanation, Graph, Input, Link, TokenTrace } from './types.ts';

export interface TreeNode {
  action: Action;
  /** the headline value and the link that placed this action here; null at a root without a source */
  token: string | null;
  link: Link | null;
  /** the input that held the value */
  source: Input | null;
  children: TreeNode[];
}

export interface TreeRoot {
  /** source: an input no recorded call produced (your prompt, an instructions file). unknown: no observed source. nothing: no values to trace. */
  kind: 'source' | 'unknown' | 'nothing';
  source: Input | null;
  children: TreeNode[];
}

/** The most telling trace of an explanation: a target with a found source, else any found. */
export function headlineTrace(e: Explanation): TokenTrace | undefined {
  const found = (t: TokenTrace) => t.links.some(l => l.grade !== 'UNKNOWN');
  return e.traces.find(t => t.token.role === 'target' && found(t)) ?? e.traces.find(found);
}

/**
 * A session as a forest: each action sits under the call whose output first held its
 * headline value (that call's own place in the tree says where it came from, and so on up).
 * An action whose value came from something no call produced, such as your prompt or an
 * instructions file, starts a tree under that source. Producers always come earlier, so
 * there are no cycles. Placement follows data only; it says nothing about the agent's reasons.
 */
export function trailForest(g: Graph, explanations: Map<string, Explanation>): TreeRoot[] {
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const nodes = new Map<string, TreeNode>();
  const roots = new Map<string, TreeRoot>();
  const rootFor = (key: string, make: () => TreeRoot) => roots.get(key) ?? roots.set(key, make()).get(key)!;

  for (const action of [...g.actions].sort((a, b) => a.preSeq - b.preSeq)) {
    const e = explanations.get(action.id);
    if (!e) continue;
    const head = headlineTrace(e);
    const link = head?.links.find(l => l.grade !== 'UNKNOWN') ?? null;
    const source = link?.to ? inputs.get(link.to) : undefined;
    const node: TreeNode = { action, token: head?.token.text ?? null, link, source: source ?? null, children: [] };
    nodes.set(action.id, node);

    const parent = source?.producedBy && source.producedBy !== action.id ? nodes.get(source.producedBy) : undefined;
    if (parent) parent.children.push(node);
    else if (source) rootFor(source.id, () => ({ kind: 'source', source, children: [] })).children.push(node);
    else if (e.traces.length) rootFor('unknown', () => ({ kind: 'unknown', source: null, children: [] })).children.push(node);
    else rootFor('nothing', () => ({ kind: 'nothing', source: null, children: [] })).children.push(node);
  }

  const order = (r: TreeRoot) => (r.kind === 'source' ? (r.source?.availableAt ?? 0) : r.kind === 'unknown' ? 1e12 : 1e12 + 1);
  return [...roots.values()].sort((a, b) => order(a) - order(b));
}
