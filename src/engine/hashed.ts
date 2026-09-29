import { normalize } from './text.ts';

/**
 * store_content: false. Text the agent read is stored as keyed hashes of the spans a traced
 * value could match, never as text. A hashed text stays ordinary text: hex words separated by
 * spaces, on the lines they came from, so whole-token search and line numbers keep working, and
 * a value is found by hashing it with the same key. Nothing here can recover the text.
 */

/** Starts every hashed string, so the graph knows to hash a value before looking for it. */
export const HASHED = '⟦contrail:hashed⟧';

const READ_PREFIX = /^(\s{0,12}\d{1,9}(?:→|\t))/;
/** A run: the longest stretch a single traced value can span (a path, URL, package or name). */
const RUN = /[^\s"'`<>()[\]{},;|]{1,256}/g;
const WORD = /[a-z0-9_-]/;
const MAX_BOUNDS = 32;

/**
 * The spans of a run that a whole-token search could match: each starts where a word starts
 * (or right after a slash, for paths like /.aws) and ends where a word ends, and has a word
 * character in it. Bounded: at most MAX_BOUNDS starts and ends per run.
 */
export function spansOf(run: string): string[] {
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < run.length; i++) {
    const here = WORD.test(run[i]!);
    const before = i > 0 && WORD.test(run[i - 1]!);
    if (starts.length < MAX_BOUNDS && (i === 0 || (here && !before) || (!here && run[i - 1] === '/'))) starts.push(i);
    const after = i + 1 < run.length && WORD.test(run[i + 1]!);
    if (ends.length < MAX_BOUNDS && (i + 1 === run.length || (here && !after))) ends.push(i + 1);
  }
  const spans: string[] = [];
  for (const s of starts) {
    for (const e of ends) {
      if (e <= s) continue;
      const span = run.slice(s, e);
      if (/[a-z0-9]/.test(span)) spans.push(span);
    }
  }
  return spans;
}

/**
 * The hashed form of a text: per line, the hashes of every span not already hashed on an
 * earlier line (the first occurrence is the one a quote points at). A Read tool's
 * "  83→" line prefix is kept, so quoted line numbers stay right.
 */
export function hashText(text: string, hmac: (span: string) => string): string {
  // Spans and whole runs repeat a lot in real output; hash each distinct one once.
  const seenSpans = new Set<string>();
  const seenRuns = new Set<string>();
  const lines = text.split('\n').map(raw => {
    const prefix = READ_PREFIX.exec(raw)?.[1] ?? '';
    const words: string[] = [];
    for (const run of normalize(raw.slice(prefix.length)).match(RUN) ?? []) {
      if (seenRuns.has(run)) continue;
      seenRuns.add(run);
      for (const span of spansOf(run)) {
        if (seenSpans.has(span)) continue;
        seenSpans.add(span);
        words.push(hmac(span));
      }
    }
    return prefix + words.join(' ');
  });
  return `${HASHED} ${lines.join('\n')}`;
}

/** The needle to look for in hashed text, or null when it cannot be there (it spans whitespace). */
export function hashNeedle(needle: string, hmac: (span: string) => string): string | null {
  return needle && !/\s/.test(needle) ? hmac(needle) : null;
}
