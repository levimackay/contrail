import { stringLeaves } from '../util.ts';
import { sameScope } from './scope.ts';
import { findMention } from './text.ts';
import type { Action, Input, Scope, Token } from './types.ts';

/**
 * The inputs an agent could see at a moment: same context window, arrived before it,
 * and not hidden by a later compaction (the compaction summary itself stays visible).
 * `compactSeqs` are the compaction points of this scope.
 */
export function availableTo(probe: { scope: Scope; seq: number }, inputs: Input[], compactSeqs: number[]): Input[] {
  const boundary = Math.max(0, ...compactSeqs.filter(s => s < probe.seq));
  return inputs.filter(i => sameScope(i.scope, probe.scope) && i.availableAt < probe.seq && i.availableAt >= boundary);
}

/**
 * The earliest call in the same scope whose arguments already contain the token.
 * Sources are searched before that point, so the agent's own echoes (a grep for the
 * name, a search result for it) are never credited as the origin.
 */
export function firstUse(token: Token, action: Action, scopeActions: Action[]): Action {
  let first = action;
  for (const a of scopeActions) {
    if (a.preSeq >= first.preSeq || !sameScope(a.scope, action.scope)) continue;
    if (stringLeaves(a.input).some(leaf => findMention(leaf.value, token.text) >= 0)) first = a;
  }
  return first;
}
