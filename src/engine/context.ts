import { stringLeaves } from '../util.ts';
import { sameScope } from './scope.ts';
import { hashNeedle } from './hashed.ts';
import { findNormalized, isWordCode, normalize } from './text.ts';
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

/**
 * Index of the token in an input's normalized text, as findNormalized, or -1.
 * A whole-token match starts and ends on a word boundary, so every complete word inside the
 * needle is a complete word of the text. Once an input has been searched a few times, a filter
 * of the text's words is checked first, which skips the scan for almost every input that cannot
 * match; the scan still decides every match. The answer is kept per input and needle: traces of
 * one value from different calls, and the same upstream call's values, ask again and again.
 */
export function findInInput(i: Input, needle: string, hashToken?: (span: string) => string): number {
  if (i.hashed) {
    // The text is hashes of spans: look for the hash of the value instead.
    const hashedNeedle = hashToken ? hashNeedle(needle, hashToken) : null;
    if (hashedNeedle === null) return -1;
    needle = hashedNeedle;
  }
  let found = foundCache.get(i);
  if (!found) {
    found = new Map();
    foundCache.set(i, found);
  }
  let index = found.get(needle);
  if (index === undefined) {
    index = search(i, needle);
    found.set(needle, index);
  }
  return index;
}

/** Inputs never change once the graph is built, so a needle's index in one never does either. */
const foundCache = new WeakMap<Input, Map<string, number>>();

function search(i: Input, needle: string): number {
  let bits = wordFilterCache.get(i);
  if (!bits) {
    const searches = (searchCount.get(i) ?? 0) + 1;
    if (searches <= SCANS_BEFORE_FILTER) {
      searchCount.set(i, searches);
      return findNormalized(normalizedText(i), needle);
    }
    bits = wordFilter(normalizedText(i));
    wordFilterCache.set(i, bits);
  }
  if (!mayHoldWords(bits, needleWords(needle))) return -1;
  return findNormalized(normalizedText(i), needle);
}

/*
 * The word filter: a bit set with two bits per whole word of a text (a maximal run of the
 * characters findNormalized treats as word characters), set from a hash of the word. A word
 * that is in the text always has both bits set, so a clear bit proves a needle's word is not
 * there; a set bit proves nothing, and the scan decides. Building it is one pass over the text
 * with no strings made, but that pass costs about as much as ten plain scans (indexOf is fast),
 * so a query that searches each input only a few times, like the statusline or the tripwire,
 * never builds it, and one that explains every call does.
 */

const SCANS_BEFORE_FILTER = 8;
const searchCount = new WeakMap<Input, number>();
const wordFilterCache = new WeakMap<Input, Uint32Array>();
const needleWordCache = new Map<string, number[]>();
const MAX_NEEDLES_CACHED = 10_000;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** A second hash from the first, so the two bits of a word are independent. */
function rehash(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return h ^ (h >>> 13);
}

/** The FNV-1a hash of every whole word in a normalized text, in order. */
function wordHashes(text: string): number[] {
  const out: number[] = [];
  let h = FNV_OFFSET;
  let inWord = false;
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    if (isWordCode(c)) {
      h = Math.imul(h ^ c, FNV_PRIME);
      inWord = true;
    } else if (inWord) {
      out.push(h);
      h = FNV_OFFSET;
      inWord = false;
    }
  }
  if (inWord) out.push(h);
  return out;
}

function wordFilter(text: string): Uint32Array {
  // About one bit per character: a word takes at least two characters with its separator.
  let size = 1024;
  while (size < text.length && size < 1 << 26) size *= 2;
  const bits = new Uint32Array(size / 32);
  const mask = size - 1;
  let h = FNV_OFFSET;
  let inWord = false;
  for (let k = 0; k <= text.length; k++) {
    const c = k < text.length ? text.charCodeAt(k) : -1;
    if (isWordCode(c)) {
      h = Math.imul(h ^ c, FNV_PRIME);
      inWord = true;
    } else if (inWord) {
      const a = h & mask;
      const b = rehash(h) & mask;
      bits[a >>> 5]! |= 1 << (a & 31);
      bits[b >>> 5]! |= 1 << (b & 31);
      h = FNV_OFFSET;
      inWord = false;
    }
  }
  return bits;
}

function needleWords(needle: string): number[] {
  let hashes = needleWordCache.get(needle);
  if (!hashes) {
    if (needleWordCache.size >= MAX_NEEDLES_CACHED) needleWordCache.clear();
    hashes = wordHashes(needle);
    needleWordCache.set(needle, hashes);
  }
  return hashes;
}

function mayHoldWords(bits: Uint32Array, hashes: number[]): boolean {
  const mask = bits.length * 32 - 1;
  for (const h of hashes) {
    const a = h & mask;
    const b = rehash(h) & mask;
    if (!(bits[a >>> 5]! & (1 << (a & 31))) || !(bits[b >>> 5]! & (1 << (b & 31)))) return false;
  }
  return true;
}
