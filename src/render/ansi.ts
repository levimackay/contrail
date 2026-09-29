/**
 * Contrail's colored terminal output, parsed back into styled runs, for renderers that are not a
 * terminal (the README's SVGs, the HTML report). Only the SGR codes src/render/style.ts emits are
 * interpreted; every other escape sequence and control character is dropped.
 */

export const MAX_COLS = 120;

/** SGR foreground codes used by style.ts: 32 DIRECT, 36 LIKELY and accents, 33 POSSIBLE, 90 UNKNOWN, 35 flags. */
export const COLORS: Record<number, string> = {
  32: '#3fb950',
  33: '#d29922',
  35: '#d2a8ff',
  36: '#56d4dd',
  90: '#6e7681',
};

export interface Pen {
  bold: boolean;
  dim: boolean;
  color: string | null;
}

export interface Run extends Pen {
  col: number;
  text: string;
}

const PLAIN_PEN: Pen = { bold: false, dim: false, color: null };

function applySgr(pen: Pen, params: string): Pen {
  const next = { ...pen };
  for (const code of (params || '0').split(';').map(Number)) {
    if (code === 0) Object.assign(next, PLAIN_PEN);
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 22) next.bold = next.dim = false;
    else if (code === 39) next.color = null;
    else if (COLORS[code]) next.color = COLORS[code]!;
  }
  return next;
}

/** Splits ANSI text into lines of styled runs, wrapping long lines at a space as `fold -s` would. */
export function parseAnsi(ansi: string, cols = MAX_COLS): Run[][] {
  const lines: Run[][] = [];
  let pen = PLAIN_PEN;
  for (const raw of ansi.replace(/\r/g, '').replace(/\n$/, '').split('\n')) {
    let cells: Array<{ ch: string; pen: Pen }> = [];
    // OSC sequences (titles, hyperlinks) go first; then every CSI; then any other escape and control character.
    const line = raw.replace(/\x1b\][^\x07\x1b]{0,2048}(?:\x07|\x1b\\)?/g, '');
    for (const part of line.split(/(\x1b\[[0-9;?]{0,32}[@-~])/)) {
      const sgr = /^\x1b\[([0-9;]{0,32})m$/.exec(part);
      if (sgr) pen = applySgr(pen, sgr[1]!);
      else if (!part.startsWith('\x1b[')) for (const ch of part.replace(/\x1b[@-_]?|[\x00-\x08\x0b-\x1f\x7f]/g, '')) cells.push({ ch, pen });
    }
    while (cells.length > cols) {
      const space = cells.slice(0, cols + 1).findLastIndex(c => c.ch === ' ');
      const cut = space > cols / 2 ? space : cols;
      lines.push(toRuns(cells.slice(0, cut)));
      cells = cells.slice(cut === space ? cut + 1 : cut);
    }
    lines.push(toRuns(cells));
  }
  return lines;
}

function toRuns(cells: Array<{ ch: string; pen: Pen }>): Run[] {
  const runs: Run[] = [];
  cells.forEach(({ ch, pen }, col) => {
    const last = runs.at(-1);
    if (last && last.bold === pen.bold && last.dim === pen.dim && last.color === pen.color) last.text += ch;
    else runs.push({ ...pen, col, text: ch });
  });
  return runs;
}

