import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { VERSION } from './version.ts';

const json = (path: string) => JSON.parse(readFileSync(join(import.meta.dirname, '..', path), 'utf8'));

test('the CLI, the package and the plugin manifest agree on the version', () => {
  assert.equal(json('package.json').version, VERSION);
  assert.equal(json('plugin/.claude-plugin/plugin.json').version, VERSION);
});
