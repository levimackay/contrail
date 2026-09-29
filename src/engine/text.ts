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
  const needle = normalize(token);
  if (!needle) return -1;
  const hay = normalize(text);
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const before = hay[i - 1];
    const after = hay[i + needle.length];
    if ((before === undefined || !WORD_CHAR.test(before)) && (after === undefined || !WORD_CHAR.test(after))) return i;
  }
  return -1;
}

/**
 * The line a match sits on, for quoting. Uses Read's "  83→" / "    83\t" prefix when present,
 * else the 1-based line in the text; single-line text has no line number.
 */
export function lineOf(text: string, index: number): { line: number | null; text: string } {
  const lineIndex = normalize(text).slice(0, Math.max(0, index)).split('\n').length - 1;
  const lines = text.split('\n');
  const raw = lines[lineIndex] ?? '';
  const prefixed = READ_PREFIX.exec(raw);
  if (prefixed) return { line: Number(prefixed[1]), text: prefixed[2]!.trim() };
  return { line: lines.length > 1 ? lineIndex + 1 : null, text: raw.trim() };
}
