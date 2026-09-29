/**
 * npm run svg: renders Contrail's colored terminal output as SVG "terminal windows" for the README.
 *
 *   node scripts/svg.ts                      build the demo and write every docs/*.svg
 *   cmd | node scripts/svg.ts --title T      convert ANSI text on stdin to one SVG on stdout
 *
 * The palette maps the SGR codes that src/render/style.ts emits. Nothing else is interpreted:
 * any other escape sequence is dropped.
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const FONT_SIZE = 13;
const CHAR_WIDTH = 7.8; // advance of a 13px monospace glyph
const LINE_HEIGHT = 18;
const PAD_X = 18;
const TITLE_BAR = 36;
const PAD_BOTTOM = 16;
const MAX_COLS = 120;

const BACKGROUND = '#0d1117';
const TITLE_BACKGROUND = '#161b22';
const BORDER = '#30363d';
const FOREGROUND = '#c9d1d9';
const DIM = '#7d8590';
const DOTS = ['#ff5f57', '#febc2e', '#28c840'];

/** SGR foreground codes used by style.ts: 32 DIRECT, 36 LIKELY and accents, 33 POSSIBLE, 90 UNKNOWN, 35 flags. */
const COLORS: Record<number, string> = {
  32: '#3fb950',
  33: '#d29922',
  35: '#d2a8ff',
  36: '#56d4dd',
  90: '#6e7681',
};

interface Pen {
  bold: boolean;
  dim: boolean;
  color: string | null;
}

interface Run extends Pen {
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
    for (const part of raw.split(/(\x1b\[[0-9;]{0,32}[A-Za-z])/)) {
      const sgr = /^\x1b\[([0-9;]{0,32})m$/.exec(part);
      if (sgr) pen = applySgr(pen, sgr[1]!);
      else if (!part.startsWith('\x1b')) for (const ch of part) cells.push({ ch, pen });
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

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tspan(run: Run): string {
  const attrs = [`x="${(PAD_X + run.col * CHAR_WIDTH).toFixed(1)}"`];
  const fill = run.color ?? (run.dim ? DIM : null);
  if (fill) attrs.push(`fill="${fill}"`);
  if (run.dim && run.color) attrs.push('fill-opacity="0.7"');
  if (run.bold) attrs.push('font-weight="bold"');
  return `<tspan ${attrs.join(' ')}>${escapeXml(run.text)}</tspan>`;
}

/** A dark terminal window holding the given ANSI output. */
export function ansiToSvg(ansi: string, title = '', cols = MAX_COLS): string {
  const lines = parseAnsi(ansi, cols);
  const used = Math.max(60, ...lines.map(l => (l.length ? l.at(-1)!.col + [...l.at(-1)!.text].length : 0)));
  const width = Math.ceil(PAD_X * 2 + used * CHAR_WIDTH);
  const height = TITLE_BAR + 12 + lines.length * LINE_HEIGHT + PAD_BOTTOM;
  const body = lines
    .map((line, i) => {
      const y = TITLE_BAR + 12 + (i + 1) * LINE_HEIGHT - 5;
      return line.length ? `    <text y="${y}" style="white-space: pre">${line.map(tspan).join('')}</text>` : '';
    })
    .filter(Boolean)
    .join('\n');
  const dots = DOTS.map((c, i) => `<circle cx="${20 + i * 20}" cy="${TITLE_BAR / 2}" r="6" fill="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title || 'terminal output')}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${BACKGROUND}" stroke="${BORDER}"/>
  <path d="M0.5 ${TITLE_BAR} V10.5 A10 10 0 0 1 10.5 0.5 H${width - 10.5} A10 10 0 0 1 ${width - 0.5} 10.5 V${TITLE_BAR} Z" fill="${TITLE_BACKGROUND}"/>
  <line x1="0.5" y1="${TITLE_BAR}" x2="${width - 0.5}" y2="${TITLE_BAR}" stroke="${BORDER}"/>
  ${dots}
  <text x="${width / 2}" y="${TITLE_BAR / 2 + 4}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="12" fill="${DIM}">${escapeXml(title)}</text>
  <g font-family="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT_SIZE}" fill="${FOREGROUND}" style="white-space: pre" xml:space="preserve">
${body}
  </g>
</svg>
`;
}

/** The demo views shown in the README, as `contrail <args>`. `{sha}` is the demo commit. */
const VIEWS: Array<{ file: string; args: string[]; cols?: number }> = [
  { file: 'why.svg', args: ['why', 'npm install jwt-decode'] },
  { file: 'risks.svg', args: ['risks'] },
  { file: 'trace.svg', args: ['trace', '--session', '4f2a'] },
  { file: 'trace-tree.svg', args: ['trace', '--session', '9c1e', '--tree'], cols: 146 },
  { file: 'why-commit.svg', args: ['why', 'commit', '{sha}'] },
  { file: 'sessions.svg', args: ['sessions'], cols: 150 },
];

const shellQuote = (a: string) => (/^[\w./@:-]+$/.test(a) ? a : `"${a}"`);

async function renderDocs(): Promise<void> {
  const { buildDemo } = await import('../test/fixtures/demo.ts');
  const { main } = await import('../src/cli.ts');
  const root = join(realpathSync(tmpdir()), 'contrail-demo');
  rmSync(root, { recursive: true, force: true });
  const { repo, data, sha } = buildDemo(root);
  const docs = join(import.meta.dirname, '..', 'docs');
  mkdirSync(docs, { recursive: true });
  for (const view of VIEWS) {
    const args = view.args.map(a => a.replace('{sha}', sha.slice(0, 7)));
    let out = '';
    let err = '';
    const code = await main([...args, '--data', data], { out: s => (out += s), err: s => (err += s), cwd: repo, env: { FORCE_COLOR: '1' }, home: '/Users/dev' });
    if (code !== 0) throw new Error(`contrail ${args.join(' ')} exited ${code}: ${err}`);
    const command = `contrail ${args.map(shellQuote).join(' ')}`;
    writeFileSync(join(docs, view.file), ansiToSvg(`\x1b[2m$\x1b[0m \x1b[1m${command}\x1b[0m\n${out}`, command, view.cols));
    console.log(`docs/${view.file}  ${command}`);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { title: { type: 'string' } } });
  if (values.title !== undefined) process.stdout.write(ansiToSvg(readFileSync(0, 'utf8'), values.title));
  else await renderDocs();
}
