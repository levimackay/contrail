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
