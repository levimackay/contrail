import { basename, isAbsolute, resolve } from 'node:path';
import { arr, str } from '../util.ts';
import { shellSegments, unwrapCommand } from './tokens.ts';

/**
 * R10: a line of a file as it is now, joined to the latest recorded agent write whose written
 * text contains it. The file join is recorded (the call's file_path, R1); the line join is a
 * text match, so it tops out at LIKELY. Pure: callers pass the file's lines and the writes.
 */

/** What one recorded call wrote into one file, as line keys (see lineKey). */
export interface WrittenText {
  /** Non-trivial lines the call put there, with how many times. Lines an Edit only carried over (in old and new) do not count. */
  added: Map<string, number>;
  /** Every line of the written text, trivial ones included: a trivial line joins a block only if its call wrote one like it. */
  all: Set<string>;
}

export interface BlameWrite {
  id: string;
  /** when the write finished, for "latest wins"; ties go to the later tiebreak */
  at: number;
  tiebreak: string;
  text: WrittenText;
  /** false for a shell write expected from the command but not reported by Claude Code (R6) */
  observed: boolean;
}

export interface LineBlame {
  /** 1-based */
  line: number;
  text: string;
  trivial: boolean;
  call: string | null;
  grade: 'LIKELY' | 'POSSIBLE' | null;
  /** text: the line's own text matched; block: a trivial line between two lines of the same call */
  match: 'text' | 'block' | null;
  /** how many recorded writes contain this line's text; the latest is credited */
  writers: number;
  /** how many times this text occurs in the file, and how many times the credited call wrote it */
  inFile: number;
  byCall: number;
  /** the credited call wrote the text at least as often as the file holds it, and the write was observed */
  unambiguous: boolean;
}

export interface BlameBlock {
  start: number;
  end: number;
  call: string | null;
  grade: 'LIKELY' | 'POSSIBLE' | null;
}

/** Words that make up a whole line of block structure, once punctuation is dropped: `} else {`, `end`, `fi`. */
const STRUCTURE_WORDS = new Set(['', 'end', 'else', 'fi', 'done', 'esac', 'then', 'do', 'try', 'finally', 'return', 'break', 'continue', 'default', 'pass', 'endif', 'begin']);

/** A file's text as lines, without the empty string after a final newline. */
export function splitLines(text: string): string[] {
  const lines = text.split('\n').map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * The form two lines are compared in: trimmed. In a notebook (.ipynb) a cell line is stored as a
 * JSON string ("  x = 1\n",), so it is decoded first, to compare with what NotebookEdit wrote.
 */
export function lineKey(raw: string, notebook = false): string {
  let line = raw.trim();
  if (notebook && line.startsWith('"')) {
    const literal = line.endsWith(',') ? line.slice(0, -1) : line;
    try {
      const decoded: unknown = JSON.parse(literal);
      if (typeof decoded === 'string') line = decoded.trim();
    } catch {
      // not a string literal: compare the line as it is
    }
  }
  return line;
}

/**
 * A line too common to attribute by its text: blank, punctuation only (`}`, `});`, `*\/`, `#`, `---`),
 * or one structure word with punctuation (`} else {`, `end`, `return;`).
 */
export function isTrivial(key: string): boolean {
  if (!key) return true;
  if (key.length > 24) return false;
  return STRUCTURE_WORDS.has(key.replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase());
}

/** Text the store cut at its size cap ends in a partial line and a marker: drop both. */
function untruncated(text: string): string {
  const cut = text.lastIndexOf('\n…[contrail: truncated');
  if (cut < 0) return text;
  const kept = text.slice(0, cut);
  const lastBreak = kept.lastIndexOf('\n');
  return lastBreak < 0 ? '' : kept.slice(0, lastBreak);
}

function keysOf(text: string, notebook: boolean): string[] {
  return splitLines(untruncated(text)).map(l => lineKey(l, notebook));
}

/** Lines in `next` beyond those already in `prev`, counted: an Edit's context lines are not its writing. */
function addText(into: WrittenText, prev: string, next: string, notebook: boolean): void {
  const before = new Map<string, number>();
  for (const k of keysOf(prev, notebook)) before.set(k, (before.get(k) ?? 0) + 1);
  for (const k of keysOf(next, notebook)) {
    into.all.add(k);
    if (isTrivial(k)) continue;
    const carried = before.get(k) ?? 0;
    if (carried > 0) before.set(k, carried - 1);
    else into.added.set(k, (into.added.get(k) ?? 0) + 1);
  }
}

/**
 * What a recorded call wrote into the file `isThisFile` accepts, or null when its recorded
 * input holds no written text for it. Edit, MultiEdit, Write and NotebookEdit carry the text
 * in their input; a shell command only through a heredoc whose body is written as it stands.
 */
export function writtenText(tool: string, input: Record<string, unknown>, isThisFile: (path: string) => boolean, cwd: string, notebook = false): WrittenText | null {
  const out: WrittenText = { added: new Map(), all: new Set() };
  if (tool === 'Edit') {
    addText(out, str(input, 'old_string') ?? '', str(input, 'new_string') ?? '', notebook);
  } else if (tool === 'MultiEdit') {
    for (const e of arr(input.edits)) addText(out, str(e, 'old_string') ?? '', str(e, 'new_string') ?? '', notebook);
  } else if (tool === 'Write') {
    addText(out, '', str(input, 'content') ?? '', notebook);
  } else if (tool === 'NotebookEdit') {
    if (str(input, 'edit_mode') === 'delete') return null;
    // A notebook cell's source sits on the disk as JSON strings; the edit's text is compared in the same decoded form.
    addText(out, '', str(input, 'new_source') ?? '', false);
  } else if (tool === 'Bash') {
    const bodies = heredocWrites(str(input, 'command') ?? '', cwd).filter(h => isThisFile(h.path));
    if (!bodies.length) return null;
    for (const h of bodies) addText(out, '', h.body, notebook);
  } else {
    return null;
  }
  return out.all.size ? out : null;
}

const HEREDOC = /<<(-?)[ \t]{0,8}(['"]?)([A-Za-z_][\w-]{0,63})\2/;

/**
 * Files a shell command writes through a heredoc (`cat > f <<'EOF'`, `cat <<EOF >> f`, `tee f <<EOF`),
 * with the body. Only bodies the shell writes as they stand: a quoted delimiter, or no $, backtick
 * or backslash in the body. After a cd, only absolute targets, since the directory is not known.
 */
export function heredocWrites(command: string, cwd: string): Array<{ path: string; body: string }> {
  const out: Array<{ path: string; body: string }> = [];
  const lines = command.split('\n');
  let moved = false;
  for (let i = 0; i < lines.length; i++) {
    const m = HEREDOC.exec(lines[i]!);
    const targets: string[] = [];
    for (const seg of shellSegments(lines[i]!)) {
      const words = unwrapCommand(seg.words);
      const prog = basename(words[0] ?? '');
      if (prog === 'cd' || prog === 'pushd' || prog === 'popd') moved = true;
      if (!m) continue;
      const found = prog === 'cat' ? seg.redirects : prog === 'tee' ? words.slice(1).filter(w => !w.startsWith('-') && w !== m[3]) : [];
      for (const t of found) {
        if (t === '/dev/null' || t.startsWith('&')) continue;
        if (isAbsolute(t)) targets.push(t);
        else if (!moved && cwd) targets.push(resolve(cwd, t));
      }
    }
    if (!m) continue;
    const [, dash, quote, delimiter] = m;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const candidate = dash ? lines[j]!.replace(/^\t{1,64}/, '') : lines[j]!;
      if (candidate === delimiter) break;
      body.push(candidate);
    }
    // Unterminated, or the shell would expand it: the written text is not in the record.
    const literal = Boolean(quote) || !body.some(l => /[$`\\]/.test(l));
    if (j < lines.length && literal) for (const path of targets) out.push({ path, body: body.join('\n') });
    i = j;
  }
  return out;
}

/**
 * Each line of the file credited to the latest write whose text contains it. A trivial line
 * joins the block around it only when the nearest non-trivial lines on both sides (or one side
 * and the edge of the file) are credited to the same call, and that call wrote such a line.
 */
export function blameLines(lines: string[], writes: BlameWrite[], notebook = false): LineBlame[] {
  const latestFirst = [...writes].sort((a, b) => b.at - a.at || (a.tiebreak < b.tiebreak ? 1 : a.tiebreak > b.tiebreak ? -1 : 0));
  const keys = lines.map(l => lineKey(l, notebook));
  const inFile = new Map<string, number>();
  for (const k of keys) inFile.set(k, (inFile.get(k) ?? 0) + 1);
  const byId = new Map(writes.map(w => [w.id, w]));

  const out: LineBlame[] = keys.map((key, i) => {
    const base = { line: i + 1, text: lines[i]!, trivial: isTrivial(key), inFile: inFile.get(key) ?? 0 };
    const writers = base.trivial ? [] : latestFirst.filter(w => w.text.added.has(key));
    const w = writers[0];
    if (!w) return { ...base, call: null, grade: null, match: null, writers: 0, byCall: 0, unambiguous: false };
    const byCall = w.text.added.get(key)!;
    const unambiguous = w.observed && byCall >= base.inFile;
    return { ...base, call: w.id, grade: unambiguous ? 'LIKELY' : 'POSSIBLE', match: 'text', writers: writers.length, byCall, unambiguous };
  });

  const neighbour = (from: number, step: number): LineBlame | 'edge' => {
    for (let j = from + step; j >= 0 && j < out.length; j += step) if (!out[j]!.trivial) return out[j]!;
    return 'edge';
  };
  for (let i = 0; i < out.length; i++) {
    const l = out[i]!;
    if (!l.trivial) continue;
    const above = neighbour(i, -1);
    const below = neighbour(i, 1);
    if (above === 'edge' && below === 'edge') continue;
    const call = above !== 'edge' ? above.call : (below as LineBlame).call;
    if (!call || (above !== 'edge' && above.call !== call) || (below !== 'edge' && below.call !== call)) continue;
    const w = byId.get(call)!;
    if (!w.text.all.has(keys[i]!)) continue;
    const weakest = [above, below].some(n => n !== 'edge' && n.grade === 'POSSIBLE') ? 'POSSIBLE' : 'LIKELY';
    out[i] = { ...l, call, grade: weakest, match: 'block', writers: 0, byCall: 0, unambiguous: weakest === 'LIKELY' };
  }
  return out;
}

/** Runs of consecutive lines credited to the same call at the same grade. */
export function blameBlocks(lines: LineBlame[]): BlameBlock[] {
  const out: BlameBlock[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.call === l.call && last.grade === l.grade) last.end = l.line;
    else out.push({ start: l.line, end: l.line, call: l.call, grade: l.grade });
  }
  return out;
}
