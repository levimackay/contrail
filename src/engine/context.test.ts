import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableTo, firstUse } from './context.ts';
import { MAIN, SUB, mkAction, mkInput, mkToken } from './fixtures.ts';

const ids = (xs: Array<{ id: string }>) => xs.map(x => x.id);

test('availableTo keeps same-scope inputs that arrived before the probe', () => {
  const inputs = [
    mkInput({ id: 'a', availableAt: 5 }),
    mkInput({ id: 'late', availableAt: 12 }),
    mkInput({ id: 'subagent', availableAt: 3, scope: SUB }),
    mkInput({ id: 'other-session', availableAt: 2, scope: { sessionId: 's2', agentId: null } }),
  ];
  assert.deepEqual(ids(availableTo({ scope: MAIN, seq: 10 }, inputs, [])), ['a']);
});

test('an input arriving at the probe itself is not yet available', () => {
  assert.deepEqual(availableTo({ scope: MAIN, seq: 10 }, [mkInput({ id: 'a', availableAt: 10 })], []), []);
});

test('compaction hides what came before it but keeps its own summary', () => {
  const inputs = [
    mkInput({ id: 'old', availableAt: 5 }),
    mkInput({ id: 'summary', availableAt: 8, origin: 'compaction', trust: 'agent' }),
    mkInput({ id: 'new', availableAt: 15 }),
  ];
  assert.deepEqual(ids(availableTo({ scope: MAIN, seq: 20 }, inputs, [8])), ['summary', 'new']);
});

test('a compaction after the probe does not matter', () => {
  assert.deepEqual(ids(availableTo({ scope: MAIN, seq: 20 }, [mkInput({ id: 'x', availableAt: 12 })], [8, 30])), ['x']);
});

test('firstUse finds an earlier call that already used the token', () => {
  const search = mkAction({ id: 'search', preSeq: 10, input: { command: 'npm search foo-auth-helper' } });
  const install = mkAction({ id: 'install', preSeq: 13, input: { command: 'npm install foo-auth-helper' } });
  assert.equal(firstUse(mkToken('foo-auth-helper'), install, [search, install]).id, 'search');
});

test('firstUse returns the action itself when nothing earlier used the token', () => {
  const install = mkAction({ id: 'install', preSeq: 13, input: { command: 'npm install foo-auth-helper' } });
  assert.equal(firstUse(mkToken('foo-auth-helper'), install, [install]).id, 'install');
});

test('firstUse ignores other scopes, later calls, and partial matches, and reads nested arguments', () => {
  const inSubagent = mkAction({ id: 'sub', scope: SUB, preSeq: 2, input: { command: 'npm search foo-auth-helper' } });
  const near = mkAction({ id: 'near', preSeq: 3, input: { command: 'npm install foo-auth-helper-v2' } });
  const edit = mkAction({ id: 'edit', tool: 'MultiEdit', preSeq: 5, input: { edits: [{ new_string: 'import "foo-auth-helper"' }] } });
  const install = mkAction({ id: 'install', preSeq: 9, input: { command: 'npm install foo-auth-helper' } });
  const later = mkAction({ id: 'later', preSeq: 20, input: { command: 'echo foo-auth-helper' } });
  assert.equal(firstUse(mkToken('foo-auth-helper'), install, [inSubagent, near, edit, install, later]).id, 'edit');
});
