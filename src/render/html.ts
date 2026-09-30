import type { Finding } from '../engine/risks.ts';
import type { TreeRoot } from '../engine/tree.ts';
import type { Explanation, Graph, Grade } from '../engine/types.ts';
import { callId, clip } from '../util.ts';
import { parseAnsi } from './ansi.ts';
import { kindOf, renderRisks, renderTree, summary } from './session.ts';
import { COLOR } from './style.ts';
import { originWording, renderWhy, sourceNote } from './why.ts';

/**
 * contrail report: one session as a single HTML file. The page loads nothing and runs no
 * script (a Content-Security-Policy forbids both), so it opens the same way anywhere, offline.
 * Every report inside it is the terminal report itself, colored the same way, so the wording
 * rules of src/render apply unchanged. All recorded text is escaped.
 */

export interface ReportInput {
  graph: Graph;
  explanations: Map<string, Explanation>;
  findings: Finding[];
  forest: TreeRoot[];
  omitted: number;
  version: string;
  generatedAt: Date;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** style.ts's SGR colors, by meaning. */
const CLASS_OF_COLOR: Record<string, string> = {
  '#3fb950': 'direct',
  '#56d4dd': 'likely',
  '#d29922': 'possible',
  '#6e7681': 'unknown',
  '#d2a8ff': 'flag',
};

/** Colored terminal output as HTML: the same text, with its styles as classes. */
export function ansiToHtml(ansi: string): string {
  return parseAnsi(ansi, Number.MAX_SAFE_INTEGER)
    .map(line =>
      line
        .map(run => {
          const classes = [run.color ? CLASS_OF_COLOR[run.color] : '', run.bold ? 'b' : '', run.dim ? 'd' : ''].filter(Boolean);
          const text = escapeHtml(run.text);
          return classes.length ? `<span class="${classes.join(' ')}">${text}</span>` : text;
        })
        .join(''),
    )
    .join('\n');
}

const gradeClass = (g: Grade) => g.toLowerCase();
const time = (us: number | undefined) => (us ? new Date(Math.floor(us / 1000)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '');

export function renderReport(r: ReportInput): string {
  const g = r.graph;
  const sessionId = g.sessionId;
  const anchor = (id: string) => `a-${id.replace(/[^\w-]/g, '_')}`;
  const byAction = new Map(r.findings.map(f => [f.action.id, f]));
  const external = r.findings.filter(f => f.externalUpstream).length;
  const fileEffects = g.effects.filter(e => e.kind === 'file').length;
  const first = g.timeUs.length ? Math.min(...g.timeUs) : 0;
  const last = g.timeUs.length ? Math.max(...g.timeUs) : 0;

  const card = (value: number, label: string, tone = '') => `<div class="card ${tone}"><div class="num">${value}</div><div class="label">${label}</div></div>`;

  const risks = r.findings.length
    ? r.findings
        .map(f => {
          const mark = f.externalUpstream ? '▲' : f.requested === 'NOT_NAMED' ? '△' : '·';
          const asked = f.requested === 'NAMED' ? 'named by you' : f.requested === 'NOT_NAMED' ? 'not named by you' : f.requested.toLowerCase().replace(/_/g, ' ');
          return `<a class="finding${f.externalUpstream ? ' ext' : ''}" href="#${anchor(f.action.id)}"><span class="mark">${mark}</span><code>${escapeHtml(clip(summary(f.action, g), 140))}</code><span class="kinds">${escapeHtml(f.kinds.join(' · '))}</span><span class="pill${f.requested === 'NOT_NAMED' ? ' flag' : ''}">${asked}</span>${f.externalUpstream ? '<span class="pill ext">traces to external content</span>' : ''}</a>`;
        })
        .join('\n')
    : '<p class="muted">None found in this session.</p>';

  // The timeline: turns, instruction loads and calls in the order they happened.
  const items: Array<{ seq: number; html: string }> = [];
  for (const p of g.prompts) {
    const who = p.from === 'task' ? '<span class="pill">background task report, not your words</span>' : '<span class="pill you">your prompt</span>';
    items.push({ seq: p.seq, html: `<h3 class="turn"><span class="label">${escapeHtml(p.label)}</span>${who}<span class="prompt">${escapeHtml(clip(p.text, 240))}</span></h3>` });
  }
  for (const i of g.inputs.filter(x => x.origin === 'instructions')) {
    items.push({ seq: i.availableAt, html: `<div class="row loaded"><span class="seq">${i.availableAt}</span><span class="kind">LOADED</span><code>${escapeHtml(clip(i.label, 140))}</code><span class="muted">${escapeHtml(originWording(i))}</span></div>` });
  }
  for (const a of g.actions) {
    const e = r.explanations.get(a.id);
    const f = byAction.get(a.id);
    const tone = [f ? 'sensitive' : '', f?.externalUpstream ? 'ext' : '', a.status === 'failed' || a.status === 'interrupted' || a.status === 'denied' ? 'failed' : ''].filter(Boolean).join(' ');
    const pills = [
      e ? `<span class="grade ${gradeClass(e.chainGrade)}">${e.chainGrade}</span>` : '',
      e?.requested.verdict === 'NOT_NAMED' ? '<span class="pill flag">not named by you</span>' : e?.requested.verdict === 'NAMED' ? '<span class="pill">named by you</span>' : '',
      f ? `<span class="pill ${f.externalUpstream ? 'ext' : 'flag'}">${escapeHtml(f.kinds.join(' · '))}</span>` : '',
      a.scope.agentId ? `<span class="pill">subagent ${escapeHtml(callId(a.scope.agentId))}</span>` : '',
      a.status === 'failed' || a.status === 'interrupted' || a.status === 'denied' ? `<span class="pill flag">${a.status}</span>` : '',
    ].join('');
    const head = `<span class="seq">${a.preSeq}</span><span class="kind">${escapeHtml(kindOf(a))}</span><code>${escapeHtml(clip(summary(a, g), 140))}</code>${pills}`;
    items.push({
      seq: a.preSeq,
      html: e
        ? `<details class="${['row', tone].filter(Boolean).join(' ')}" id="${anchor(a.id)}"><summary>${head}</summary><pre class="term">${ansiToHtml(renderWhy(e, g, undefined, COLOR))}</pre></details>`
        : `<div class="${['row', tone].filter(Boolean).join(' ')}" id="${anchor(a.id)}">${head}</div>`,
    });
  }
  items.sort((x, y) => x.seq - y.seq);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Contrail ${escapeHtml(r.version)}">
<title>Contrail report · session ${escapeHtml(sessionId.slice(0, 8))}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <div class="brand">${LOGO_MARK}<span>contrail</span></div>
  <h1>Session ${escapeHtml(sessionId.slice(0, 8))}</h1>
  <p class="meta"><code>${escapeHtml(clip(g.env.cwd, 160))}</code> · ${escapeHtml(time(first))} to ${escapeHtml(time(last))}</p>${sourceNote(g) ? `\n  <p class="meta"><b>${escapeHtml(sourceNote(g)!)}</b></p>` : ''}
  <nav><a href="#risks">Sensitive actions</a><a href="#timeline">Timeline</a><a href="#trails">Trails</a></nav>
</header>
<main>
<section class="cards">
  ${card(g.prompts.length, 'turns')}
  ${card(g.actions.length, 'tool calls')}
  ${card(fileEffects, 'file changes')}
  ${card(r.findings.length, 'sensitive actions', r.findings.length ? 'warn' : '')}
  ${card(external, 'trace to external content', external ? 'alert' : '')}
</section>

<section id="risks">
  <h2>Sensitive actions</h2>
  <div class="findings">${risks}</div>
  <details class="full"><summary>Full risks report</summary><pre class="term">${ansiToHtml(renderRisks(r.findings, { actions: g.actions.length, sessions: 1 }, new Map([[sessionId, g]]), COLOR))}</pre></details>
</section>

<section id="timeline">
  <h2>Timeline</h2>
  <p class="muted">Open any call for its full trail: where each value in it first appeared, who wrote that source, and how strong each link is.</p>
  ${items.map(i => i.html).join('\n  ')}
</section>

<section id="trails">
  <h2>Trails</h2>
  <p class="muted">Each call sits under the call whose output first held its headline value.</p>
  <pre class="term">${ansiToHtml(renderTree(g, r.forest, r.omitted, COLOR))}</pre>
</section>
</main>
<footer>
  <p><b>Data provenance, not the agent's reasons.</b> A grade says where a value first appeared in the agent's context, not what the agent intended. Every report lists what Contrail could not see.</p>
  <p>Generated by Contrail ${escapeHtml(r.version)} on ${escapeHtml(r.generatedAt.toISOString().slice(0, 10))} from local data. This file loads nothing and makes no network requests.</p>
</footer>
</body>
</html>
`;
}

const LOGO_MARK = `<svg width="64" height="22" viewBox="0 0 64 22" aria-hidden="true"><g stroke-linecap="round" fill="none"><line x1="2" y1="17" x2="11" y2="15.5" stroke="#6e7681" stroke-width="2.5"/><line x1="15" y1="14.8" x2="24" y2="13.3" stroke="#d29922" stroke-width="3"/><line x1="28" y1="12.6" x2="37" y2="11.1" stroke="#56d4dd" stroke-width="3.5"/><line x1="41" y1="10.4" x2="49" y2="9" stroke="#3fb950" stroke-width="4"/></g><circle cx="56" cy="7.8" r="4.5" fill="#3fb950"/></svg>`;

const CSS = `
:root { --bg: #ffffff; --panel: #f6f8fa; --border: #d0d7de; --fg: #1f2328; --muted: #59636e; --term-bg: #0d1117; --term-fg: #c9d1d9;
  --direct: #1a7f37; --likely: #0a7d86; --possible: #9a6700; --unknown: #6e7781; --flag: #8250df; --alert: #cf222e; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --panel: #161b22; --border: #30363d; --fg: #e6edf3; --muted: #8d96a0;
  --direct: #3fb950; --likely: #56d4dd; --possible: #d29922; --unknown: #8b949e; --flag: #d2a8ff; --alert: #f85149; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
header, main, footer { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
header { padding-top: 28px; }
.brand { display: flex; align-items: center; gap: 10px; font: 700 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
h1 { margin: 14px 0 2px; font-size: 26px; }
h2 { margin: 36px 0 12px; font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.meta, .muted { color: var(--muted); }
nav { display: flex; gap: 18px; margin: 10px 0 0; }
nav a, a { color: var(--likely); text-decoration: none; }
code, .kind, .seq, .grade { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 22px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.card .num { font-size: 28px; font-weight: 700; }
.card .label { color: var(--muted); font-size: 13px; }
.card.warn .num { color: var(--possible); }
.card.alert .num { color: var(--alert); }
.findings { display: grid; gap: 8px; }
.finding { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; color: var(--fg); background: var(--panel); }
.finding.ext { border-color: var(--flag); }
.finding .mark { color: var(--flag); font-weight: 700; }
.finding .kinds { color: var(--likely); font-weight: 600; font-size: 13px; }
.pill { display: inline-block; font-size: 12px; padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); white-space: nowrap; }
.pill.flag { color: var(--flag); border-color: var(--flag); }
.pill.ext { color: var(--alert); border-color: var(--alert); }
.pill.you { color: var(--direct); border-color: var(--direct); }
.grade { font-weight: 700; padding: 0 6px; border-radius: 4px; }
.grade.direct { color: var(--direct); } .grade.likely { color: var(--likely); } .grade.possible { color: var(--possible); } .grade.unknown { color: var(--unknown); }
.turn { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 26px 0 8px; font-size: 16px; }
.turn .label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.turn .prompt { font-weight: 600; }
.row { border: 1px solid var(--border); border-radius: 8px; margin: 6px 0; background: var(--bg); }
.row > summary, div.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; list-style: none; }
div.row { cursor: default; }
.row > summary::-webkit-details-marker { display: none; }
.row > summary::before { content: '▸'; color: var(--muted); }
.row[open] > summary::before { content: '▾'; }
.row.loaded { opacity: 0.8; }
.row.sensitive { border-left: 3px solid var(--possible); }
.row.ext { border-left: 3px solid var(--alert); }
.row.failed code { text-decoration: line-through; opacity: 0.7; }
.row:target { outline: 2px solid var(--likely); }
.seq { color: var(--muted); min-width: 2.5em; }
.kind { font-weight: 700; min-width: 5.5em; }
.row code { word-break: break-all; }
pre.term { margin: 0; padding: 14px 16px; background: var(--term-bg); color: var(--term-fg); border-radius: 0 0 8px 8px; overflow-x: auto; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }
#trails pre.term, details.full pre.term { border-radius: 8px; }
details.full { margin-top: 12px; }
details.full > summary { cursor: pointer; color: var(--muted); }
.term .b { font-weight: 700; } .term .d { opacity: 0.65; }
.term .direct { color: #3fb950; } .term .likely { color: #56d4dd; } .term .possible { color: #d29922; } .term .unknown { color: #6e7681; } .term .flag { color: #d2a8ff; }
footer { margin: 48px auto 40px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
`;
