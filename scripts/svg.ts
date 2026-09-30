/**
 * npm run svg: renders Contrail's colored terminal output as SVG "terminal windows" for the README.
 *
 *   node scripts/svg.ts                      build the demo and write every docs/*.svg and docs/*.md view
 *   node scripts/svg.ts review.svg ...       only the named views
 *   cmd | node scripts/svg.ts --title T      convert ANSI text on stdin to one SVG on stdout
 *
 * The palette maps the SGR codes that src/render/style.ts emits. Nothing else is interpreted:
 * any other escape sequence is dropped.
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { MAX_COLS, parseAnsi, type Run } from '../src/render/ansi.ts';

export { parseAnsi };

const FONT_SIZE = 13;
const CHAR_WIDTH = 7.8; // advance of a 13px monospace glyph
const LINE_HEIGHT = 18;
const PAD_X = 18;
const TITLE_BAR = 36;
const PAD_BOTTOM = 16;

const BACKGROUND = '#0d1117';
const TITLE_BACKGROUND = '#161b22';
const BORDER = '#30363d';
const FOREGROUND = '#c9d1d9';
const DIM = '#7d8590';
const DOTS = ['#ff5f57', '#febc2e', '#28c840'];

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
const VIEWS: Array<{ file: string; args: string[]; cols?: number; lines?: number }> = [
  // The README's first image: the answer at the top of a report, cut before the evidence.
  { file: 'hero.svg', args: ['why', 'cat ~/.aws/credentials'], lines: 13 },
  { file: 'why.svg', args: ['why', 'npm install jwt-decode'] },
  { file: 'risks.svg', args: ['risks'] },
  { file: 'trace.svg', args: ['trace', '--session', '4f2a'] },
  { file: 'trace-tree.svg', args: ['trace', '--session', '9c1e', '--tree'], cols: 146 },
  { file: 'why-commit.svg', args: ['why', 'commit', '{sha}'] },
  { file: 'blame.svg', args: ['blame', 'auth-service/src/session.ts'] },
  { file: 'find.svg', args: ['find', 'collect.telemetry.example'], cols: 146 },
  { file: 'sessions.svg', args: ['sessions'], cols: 150 },
  { file: 'review.svg', args: ['review'] },
  // Not a picture: the markdown a reviewer would paste into a pull request, kept as is.
  { file: 'review-example.md', args: ['review', '--markdown'] },
];

const shellQuote = (a: string) => (/^[\w./@:-]+$/.test(a) ? a : `"${a}"`);

async function renderDocs(only: string[]): Promise<void> {
  const unknown = only.filter(f => !VIEWS.some(v => v.file === f));
  if (unknown.length) throw new Error(`No view named ${unknown.join(', ')}. Views: ${VIEWS.map(v => v.file).join(', ')}`);
  const { buildDemo } = await import('../test/fixtures/demo.ts');
  const { main } = await import('../src/cli.ts');
  const root = join(realpathSync(tmpdir()), 'contrail-demo');
  rmSync(root, { recursive: true, force: true });
  const { repo, data, sha } = buildDemo(root);
  const docs = join(import.meta.dirname, '..', 'docs');
  mkdirSync(docs, { recursive: true });
  for (const view of VIEWS.filter(v => !only.length || only.includes(v.file))) {
    const args = view.args.map(a => a.replace('{sha}', sha.slice(0, 7)));
    let out = '';
    let err = '';
    const code = await main([...args, '--data', data], { out: s => (out += s), err: s => (err += s), cwd: repo, env: { FORCE_COLOR: '1' }, home: '/Users/dev' });
    if (code !== 0) throw new Error(`contrail ${args.join(' ')} exited ${code}: ${err}`);
    if (view.lines) out = `${out.split('\n').slice(0, view.lines).join('\n')}\n\x1b[2m…  the full evidence follows: every value, its quoted source line, and the blind spots\x1b[0m\n`;
    const command = `contrail ${args.map(shellQuote).join(' ')}`;
    if (view.file.endsWith('.md')) writeFileSync(join(docs, view.file), out);
    else writeFileSync(join(docs, view.file), ansiToSvg(`\x1b[2m$\x1b[0m \x1b[1m${command}\x1b[0m\n${out}`, command, view.cols));
    console.log(`docs/${view.file}  ${command}`);
  }
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ options: { title: { type: 'string' } }, allowPositionals: true });
  if (values.title !== undefined) process.stdout.write(ansiToSvg(readFileSync(0, 'utf8'), values.title));
  else await renderDocs(positionals);
}
