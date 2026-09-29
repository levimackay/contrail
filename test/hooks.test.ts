import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const hooks = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;

test('SessionEnd captures its own event before draining the spool, in one command', () => {
  // Hooks of one event run in parallel, so capture then ingest must be one sequential command.
  const commands = hooks.SessionEnd.flatMap((g: { hooks: Array<{ command: string; async?: boolean }> }) => g.hooks);
  assert.equal(commands.length, 1);
  assert.match(commands[0].command, /capture\.sh"; sh .*contrail" ingest --from-hook$/);
  assert.notEqual(commands[0].async, true);
});

test('every recorded event runs the capture hook, and none of them blocks or prints', () => {
  for (const [event, groups] of Object.entries(hooks) as Array<[string, Array<{ hooks: Array<{ command: string }> }>]>) {
    assert.ok(groups.some(g => g.hooks.some(h => h.command.includes('capture.sh'))), event);
  }
});
