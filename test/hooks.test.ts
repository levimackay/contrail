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

test('only the PreToolUse tripwire may print, and only for tools that can touch credentials, the network or the shell', () => {
  const tripwires = Object.entries(hooks as Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; async?: boolean }> }>>).flatMap(([event, groups]) =>
    groups.filter(g => g.hooks.some(h => h.command.includes('tripwire.sh'))).map(g => ({ event, matcher: g.matcher, async: g.hooks[0]!.async })),
  );
  assert.deepEqual(tripwires, [{ event: 'PreToolUse', matcher: 'Bash|Read|Edit|MultiEdit|Write', async: undefined }]);
  // Its one output is a systemMessage for the person: never additionalContext, a decision or a permission.
  const script = readFileSync(join(import.meta.dirname, '..', 'plugin', 'hooks', 'tripwire.sh'), 'utf8');
  assert.doesNotMatch(script, /additionalContext|permissionDecision|"decision"|exit 2/);
});
