const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
const WORD_CHAR = /[a-z0-9_-]/;
const READ_PREFIX = /^\s*(\d+)(?:→|\t)(.*)$/;

/** NFKC, invisible and bidi characters removed, lowercase. Both sides of every match go through this. */
export function normalize(s: string): string {
  return s.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
}

/** Name-like: punctuation, a digit, or a camelCase hump. One source for a name-like token means something. */
export function isShaped(raw: string): boolean {
  return /[-_./@:]|\d|[a-z][A-Z]/.test(raw);
}

/**
 * Index of the first whole-token occurrence of `token` in normalize(text), or -1.
 * "foo-auth-helper" does not match inside "foo-auth-helper-v2".
 */
export function findMention(text: string, token: string): number {
  return findNormalized(normalize(text), normalize(token));
}

/** findMention over text that is already normalized: callers that search the same text for many tokens cache it. */
export function findNormalized(hay: string, needle: string): number {
  if (!needle) return -1;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const before = hay[i - 1];
    const after = hay[i + needle.length];
    if ((before === undefined || !WORD_CHAR.test(before)) && (after === undefined || !WORD_CHAR.test(after))) return i;
  }
  return -1;
}

/** A match that starts further into its line than this is quoted from just before it. */
const QUOTE_FROM_START = 60;
const QUOTE_LEAD = 30;

/**
 * The line a match sits on, for quoting. Uses Read's "  83→" / "    83\t" prefix when present,
 * else the 1-based line in the text; single-line text has no line number.
 * On a long line (a JSON result, WebSearch's one-line list of links) the quote starts just
 * before the match, so a clipped quote still shows the value.
 */
export function lineOf(text: string, index: number): { line: number | null; text: string } {
  const before = normalize(text).slice(0, Math.max(0, index));
  const lineIndex = before.split('\n').length - 1;
  // Column in the normalized text; normalizing rarely changes length, and the lead absorbs that.
  const column = before.length - (before.lastIndexOf('\n') + 1);
  const lines = text.split('\n');
  const raw = lines[lineIndex] ?? '';
  const prefixed = READ_PREFIX.exec(raw);
  const body = prefixed ? prefixed[2]! : raw;
  const line = prefixed ? Number(prefixed[1]) : lines.length > 1 ? lineIndex + 1 : null;
  return { line, text: around(body, column - (raw.length - body.length)) };
}

function around(body: string, column: number): string {
  const text = body.trim();
  const at = column - (body.length - body.trimStart().length);
  if (at <= QUOTE_FROM_START) return text;
  return `…${text.slice(at - QUOTE_LEAD).trimStart()}`;
}
