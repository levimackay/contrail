import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, d, session, WHO } from '../../test/fixtures/synthetic.ts';
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

test('a large result the model saw is parsed only when read, and reads as it was stored', () => {
  const big = 'x'.repeat(40_000);
  const response = { type: 'text', file: { filePath: '/r/big.ts', content: big } };
  const rows = session([d.prompt('go', 'p1'), ...call('r1', 'Read', { file_path: '/r/big.ts' }, big, response)]);
  const read = buildGraph(rows, WHO).actions.find(a => a.id === 'r1')!;
  assert.notEqual(Object.getOwnPropertyDescriptor(read, 'response')?.get, undefined);
  assert.deepEqual(Object.keys(read), ['id', 'scope', 'promptId', 'tool', 'input', 'response', 'preSeq', 'postSeq', 'status', 'mcpServer']);
  assert.equal(read.status, 'ok');
  // Without the model's copy the result is the text, so it is parsed at once.
  const eager = buildGraph(rows.filter(r => r.hook_event !== 'PostToolBatch'), WHO).actions.find(a => a.id === 'r1')!;
  assert.equal(Object.getOwnPropertyDescriptor(eager, 'response')?.get, undefined);
  assert.equal(JSON.stringify(read), JSON.stringify(eager));
  assert.deepEqual(read.response, response);
  read.response = null;
  assert.equal(read.response, null);
});
