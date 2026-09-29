import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkAction, mkToken } from './fixtures.ts';
import { requested, splitSentences } from './requested.ts';

const say = (promptId: string, seq: number, text: string) => ({ promptId, seq, text });
const install = mkAction({ id: 't4', preSeq: 20, input: { command: 'npm install foo-auth-helper' } });
const pkg = [mkToken('foo-auth-helper')];

test('splitSentences splits on sentence ends and newlines, and drops fenced pastes', () => {
  assert.deepEqual(splitSentences('Fix auth. Then run tests!\nThanks'), ['Fix auth.', 'Then run tests!', 'Thanks']);
  assert.deepEqual(splitSentences('what does this do?\n```\nnpm install foo\n```'), ['what does this do?']);
});

test('NOT_NAMED when none of your sentences mention it', () => {
  const r = requested(install, pkg, [say('p1', 3, 'Figure out why authentication is broken.')]);
  assert.equal(r.verdict, 'NOT_NAMED');
  assert.equal(r.grade, 'UNKNOWN');
  assert.equal(r.searched, 1);
});

test('NAMED when your words name every target, quoting the sentence', () => {
  const r = requested(install, pkg, [say('p1', 3, 'please install foo-auth-helper')]);
  assert.equal(r.verdict, 'NAMED');
  assert.equal(r.grade, 'LIKELY');
  assert.equal(r.sentence?.text, 'please install foo-auth-helper');
});

test('your latest mention wins, and a negated one is flagged', () => {
  const r = requested(install, pkg, [say('p1', 3, 'install foo-auth-helper'), say('p2', 9, "actually don't install foo-auth-helper")]);
  assert.equal(r.verdict, 'NAMED_NEGATED');
  assert.equal(r.grade, 'POSSIBLE');
  assert.equal(r.sentence?.promptId, 'p2');
});

test('sentences after the action do not count', () => {
  assert.equal(requested(install, pkg, [say('p2', 25, 'install foo-auth-helper')]).verdict, 'NOT_NAMED');
});

test('naming only a derived form, or only some targets, is PARTLY_NAMED', () => {
  const edit = mkAction({ id: 't6', preSeq: 20 });
  const pathGroup = [mkToken('src/auth/session.ts'), mkToken('session', { derived: true })];
  assert.equal(requested(edit, pathGroup, [say('p1', 3, 'look at the session code')]).verdict, 'PARTLY_NAMED');

  const two = [mkToken('foo-auth-helper', { group: 0 }), mkToken('bar-baz', { group: 1 })];
  assert.equal(requested(install, two, [say('p1', 3, 'install foo-auth-helper')]).verdict, 'PARTLY_NAMED');
});

test('with no targets there is nothing to match; hints never count', () => {
  assert.equal(requested(install, [], []).verdict, 'NOTHING_TO_MATCH');
  const hint = [mkToken('foo-auth-helper', { role: 'hint', group: null })];
  assert.equal(requested(install, hint, [say('p1', 3, 'install foo-auth-helper')]).verdict, 'NOTHING_TO_MATCH');
});

test('"commit it" names a git commit', () => {
  const commit = mkAction({ id: 't9', preSeq: 44, input: { command: 'git commit -m "fix"' } });
  const r = requested(commit, [mkToken('commit', { shaped: false })], [say('p2', 40, 'looks good, commit it')]);
  assert.equal(r.verdict, 'NAMED');
});

test('names that merely contain a negator are not negations', () => {
  const create = mkAction({ id: 't7', preSeq: 20, input: { file_path: '/r/src/app/not-found.tsx' } });
  const r = requested(create, [mkToken('src/app/not-found.tsx')], [say('p1', 3, 'Create src/app/not-found.tsx with a no-cache header')]);
  assert.equal(r.verdict, 'NAMED');
});
