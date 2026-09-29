import { stringLeaves } from '../util.ts';
import { sameScope } from './scope.ts';
import { hashNeedle } from './hashed.ts';
import { findNormalized, normalize } from './text.ts';
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
  const needle = normalize(token.text);
  let first = action;
  for (const a of scopeActions) {
    if (a.preSeq >= first.preSeq || !sameScope(a.scope, action.scope)) continue;
    if (findNormalized(normalizedInput(a), needle) >= 0) first = a;
  }
  return first;
}

const inputCache = new WeakMap<Action, string>();
const textCache = new WeakMap<Input, string>();

/** An action's arguments, normalized once. Leaves are joined by newlines, which are always a word boundary. */
function normalizedInput(a: Action): string {
  let n = inputCache.get(a);
  if (n === undefined) {
    n = stringLeaves(a.input).map(l => normalize(l.value)).join('\n');
    inputCache.set(a, n);
  }
  return n;
}

/** An input's text, normalized once. */
export function normalizedText(i: Input): string {
  let n = textCache.get(i);
  if (n === undefined) {
    n = normalize(i.text);
    textCache.set(i, n);
  }
  return n;
}

const wordCache = new WeakMap<Input, Set<string>>();
const WORD_RUN = /[a-z0-9_-]{1,256}/g;

/**
 * Index of the token in an input's normalized text, as findNormalized, or -1.
 * A whole-token match starts and ends on a word boundary, so every complete word inside the
 * needle is a complete word of the text. Checking a per-input word set first skips the full
 * scan for almost every input that cannot match; the scan still decides every match.
 */
export function findInInput(i: Input, needle: string, hashToken?: (span: string) => string): number {
  if (i.hashed) {
    // The text is hashes of spans: look for the hash of the value instead.
    const hashedNeedle = hashToken ? hashNeedle(needle, hashToken) : null;
    if (hashedNeedle === null) return -1;
    needle = hashedNeedle;
  }
  let words = wordCache.get(i);
  if (!words) {
    words = new Set(normalizedText(i).match(WORD_RUN) ?? []);
    wordCache.set(i, words);
  }
  for (const w of needle.match(WORD_RUN) ?? []) {
    if (w.length < 256 && !words.has(w)) return -1;
  }
  return findNormalized(normalizedText(i), needle);
}
