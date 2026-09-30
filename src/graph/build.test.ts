import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authSession, call, d, session, WHO } from '../../test/fixtures/synthetic.ts';
import { buildGraph } from './build.ts';

const trustOf = (command: string) =>
  buildGraph(session([d.prompt('go', 'p1'), ...call('b1', 'Bash', { command }, 'text')]), WHO).inputs.find(i => i.id === 'out:b1')?.trust;

test('shell output that prints a dependency directory is external, like a Read of it', () => {
  assert.equal(trustOf('cat vendor/fastlog/README.md'), 'external');
  assert.equal(trustOf('grep -rn token node_modules/some-pkg'), 'external');
  assert.equal(trustOf('cd .venv/lib/python3.12/site-packages/foo && head -40 README.md'), 'external');
  assert.equal(trustOf('curl -s https://example.com'), 'external');
  assert.equal(trustOf('cat src/app.js'), 'local');
  assert.equal(trustOf('cat src/vendors.ts'), 'local');
});

test('paths show relative to the working directory, which itself shows as .', async () => {
  const { displayPath } = await import('../util.ts');
  assert.equal(displayPath('/r', '/r', '/Users/dev'), '.');
  assert.equal(displayPath('/r/src/a.ts', '/r', '/Users/dev'), 'src/a.ts');
  assert.equal(displayPath('/Users/dev/.aws/credentials', '/r', '/Users/dev'), '~/.aws/credentials');
});

test('a tool without a kind of its own shows its name in the timeline', async () => {
  const { renderTrace } = await import('../render/session.ts');
  const g = buildGraph(session([d.prompt('go', 'p1'), ...call('x1', 'ToolSearch', { query: 'select:WebFetch' }, 'ok')]), WHO);
  assert.match(renderTrace(g, new Map(), null), / {2}\d+ +TOOL {4}ToolSearch \{"query":"select:WebFetch"\}/);
});

test('a session says where its events came from: the hooks, a transcript, or both', () => {
  const rows = authSession();
  assert.equal(buildGraph(rows, WHO).source, 'hooks');
  assert.equal(buildGraph(rows.map(r => ({ ...r, source: 'transcript' })), WHO).source, 'transcript');
  assert.equal(buildGraph(rows.map((r, i) => ({ ...r, source: i < 3 ? 'transcript' : null })), WHO).source, 'both');
});

test('a reconstructed session says so under the header of why, and lists what a transcript lacks', async () => {
  const { renderWhy } = await import('../render/why.ts');
  const { explain } = await import('../engine/explain.ts');
  const live = buildGraph(authSession(), WHO);
  assert.doesNotMatch(renderWhy(explain('t4', live), live), /transcript/);
  const rebuilt = buildGraph(authSession().map(r => ({ ...r, source: 'transcript' })), WHO);
  const out = renderWhy(explain('t4', rebuilt), rebuilt);
  assert.match(out, /^Bash {2}npm install foo-auth-helper\n {2}session s1 · turn p1 · t4 · seq \d+ · main agent\n {2}reconstructed from Claude Code's transcript by contrail import, not recorded live\n\n/);
  assert.match(out, /Blind spots: .*what only hooks record, as this session was rebuilt from Claude Code's transcript: instruction files loaded after it started, and the order the calls of one batch ran in/);
  // Its bashEditDiff is there, so no gap is claimed for its file effects, and the grades are the live ones.
  assert.doesNotMatch(out, /kept no bashEditDiff/);
  assert.equal(explain('t4', rebuilt).chainGrade, explain('t4', live).chainGrade);
  const both = buildGraph(authSession().map((r, i) => ({ ...r, source: i < 3 ? 'transcript' : null })), WHO);
  assert.match(renderWhy(explain('t4', both), both), /\n {2}partly reconstructed from Claude Code's transcript by contrail import, partly recorded live\n/);
});
