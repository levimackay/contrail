/** Terminal styling. Every renderer takes a Style, so plain text and color share one code path. */
export interface Style {
  on: boolean;
  /** a grade padded to a fixed width, colored by strength */
  grade(g: string, width?: number): string;
  bold(s: string): string;
  dim(s: string): string;
  /** facts that deserve attention: NOT NAMED, an external source */
  flag(s: string): string;
  accent(s: string): string;
}

const sgr = (code: string) => (s: string) => (s ? `\x1b[${code}m${s}\x1b[0m` : s);
const GRADE_COLOR: Record<string, (s: string) => string> = {
  DIRECT: sgr('1;32'),
  LIKELY: sgr('1;36'),
  POSSIBLE: sgr('33'),
  UNKNOWN: sgr('90'),
};

const pad = (g: string, width: number) => ' '.repeat(Math.max(1, width - g.length));

export const PLAIN: Style = {
  on: false,
  grade: (g, width = 9) => g + pad(g, width),
  bold: s => s,
  dim: s => s,
  flag: s => s,
  accent: s => s,
};

export const COLOR: Style = {
  on: true,
  grade: (g, width = 9) => (GRADE_COLOR[g]?.(g) ?? g) + pad(g, width),
  bold: sgr('1'),
  dim: sgr('2'),
  flag: sgr('1;35'),
  accent: sgr('1;36'),
};

/** NO_COLOR wins, then FORCE_COLOR, then whether stdout is a terminal. */
export function styleFor(env: NodeJS.ProcessEnv, isTTY: boolean): Style {
  if (env.NO_COLOR) return PLAIN;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return COLOR;
  return isTTY ? COLOR : PLAIN;
}
