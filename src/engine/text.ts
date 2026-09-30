const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
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
    // Outside the text charCodeAt is NaN, which is not a word character: the start and end are boundaries.
    if (!isWordCode(hay.charCodeAt(i - 1)) && !isWordCode(hay.charCodeAt(i + needle.length))) return i;
  }
  return -1;
}

/** One UTF-16 code unit of [a-z0-9_-], the word characters of a normalized text. */
export function isWordCode(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 45;
}

/** A match that starts further into its line than this is quoted from just before it. */
const QUOTE_FROM_START = 60;
const QUOTE_LEAD = 30;

/**
 * The line a match sits on, for quoting. Uses Read's "  83→" / "    83\t" prefix when present,
 * else the 1-based line in the text; single-line text has no line number. `index` is in the
 * normalized text, which a caller that already has it passes as `normalized`.
 * On a long line (a JSON result, WebSearch's one-line list of links) the quote starts just
 * before the match, so a clipped quote still shows the value.
 */
export function lineOf(text: string, index: number, normalized = normalize(text)): { line: number | null; text: string } {
  // Which line: the newlines before the match in the normalized text.
  const end = Math.min(Math.max(0, index), normalized.length);
  let lineIndex = 0;
  let lineStart = 0;
  for (let k = normalized.indexOf('\n'); k !== -1 && k < end; k = normalized.indexOf('\n', k + 1)) {
    lineIndex++;
    lineStart = k + 1;
  }
  // Column in the normalized text; normalizing rarely changes length, and the lead absorbs that.
  const column = end - lineStart;
  // That line of the text as stored, or nothing when the text has fewer lines.
  let start = 0;
  for (let n = 0; n < lineIndex && start !== -1; n++) {
    const next = text.indexOf('\n', start);
    start = next === -1 ? -1 : next + 1;
  }
  const stop = start === -1 ? -1 : text.indexOf('\n', start);
  const raw = start === -1 ? '' : text.slice(start, stop === -1 ? text.length : stop);
  const prefixed = READ_PREFIX.exec(raw);
  const body = prefixed ? prefixed[2]! : raw;
  const line = prefixed ? Number(prefixed[1]) : text.includes('\n') ? lineIndex + 1 : null;
  return { line, text: around(body, column - (raw.length - body.length)) };
}

function around(body: string, column: number): string {
  const text = body.trim();
  const at = column - (body.length - body.trimStart().length);
  if (at <= QUOTE_FROM_START) return text;
  return `…${text.slice(at - QUOTE_LEAD).trimStart()}`;
}
