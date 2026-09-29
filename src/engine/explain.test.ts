import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authSession, call, d, session, WHO } from '../../test/fixtures/synthetic.ts';
import { buildGraph } from '../graph/build.ts';
import { explain } from './explain.ts';
import { traceToken } from './trace.ts';
import { mkToken } from './fixtures.ts';

const auth = () => buildGraph(authSession(), WHO);

test('the package name traces to README line 83, and the README to CLAUDE.md', () => {
  const g = auth();
  const install = g.actions.find(a => a.id === 't4')!;
  const t = traceToken(mkToken('foo-auth-helper'), install, g);

  assert.equal(t.firstUse, null);
  assert.equal(t.searched.count, 4);
  assert.equal(t.links.length, 1);
  assert.equal(t.links[0]!.grade, 'LIKELY');
  assert.equal(t.links[0]!.to, 'out:t2');
  assert.equal(t.links[0]!.quote?.line, 83);

  assert.equal(t.upstream?.via.id, 't2');
  assert.equal(t.upstream?.trace.token.text, 'auth-service');
  assert.equal(t.upstream?.trace.links[0]?.grade, 'LIKELY');
  assert.equal(t.upstream?.trace.links[0]?.quote?.ref, 'CLAUDE.md');
  assert.equal(t.upstream?.trace.links[0]?.quote?.line, 4);
});

test('explain: not named by you, in your turn, two recorded effects, weakest link LIKELY', () => {
  const e = explain('t4', auth());
  assert.equal(e.requested.verdict, 'NOT_NAMED');
  assert.deepEqual([e.turn?.grade, e.turn?.to], ['DIRECT', 'prompt:p1']);
  assert.deepEqual(e.effects.map(l => [l.grade, l.to]), [
    ['DIRECT', 'fx:t4:0'],
    ['DIRECT', 'fx:t4:1'],
  ]);
  assert.equal(e.chainGrade, 'LIKELY');
  assert.ok(e.blindSpots.includes('model knowledge and reasoning'));
});

test('an echo is never a source: an earlier search for the name moves the window before it', () => {
  const g = buildGraph(
    session([
      d.prompt('Figure out why authentication is broken.', 'p1'),
      ...call('t1', 'Bash', { command: 'npm search foo-auth-helper' }, 'foo-auth-helper 1.0.0'),
      ...call('t2', 'Bash', { command: 'npm install foo-auth-helper' }, 'added 1 package'),
    ]),
    WHO,
  );
  const t = traceToken(mkToken('foo-auth-helper'), g.actions.find(a => a.id === 't2')!, g);
  assert.equal(t.firstUse?.actionId, 't1');
  assert.deepEqual(t.links.map(l => [l.grade, l.rule]), [['UNKNOWN', 'R4']]);
});

test('a parallel batch-mate is never a source', () => {
  const g = buildGraph(
    session([
      d.prompt('Figure out why authentication is broken.', 'p1'),
      d.pre('t2', 'Read', { file_path: '/r/auth-service/README.md' }),
      d.pre('t4', 'Bash', { command: 'npm install foo-auth-helper' }),
      d.post('t2', 'Read', { file_path: '/r/auth-service/README.md' }, {}),
      d.post('t4', 'Bash', { command: 'npm install foo-auth-helper' }, { stdout: 'ok' }),
      d.batch(['t2', 'Read', '    83\tuse foo-auth-helper'], ['t4', 'Bash', 'ok']),
    ]),
    WHO,
  );
  const t = traceToken(mkToken('foo-auth-helper'), g.actions.find(a => a.id === 't4')!, g);
  assert.equal(t.links[0]!.grade, 'UNKNOWN');
});

test('after compaction the README is out of view; only the summary can be credited', () => {
  const g = buildGraph(
    session([
      d.prompt('Fix auth.', 'p1'),
      ...call('t2', 'Read', { file_path: '/r/auth-service/README.md' }, '    83\tuse foo-auth-helper'),
      d.compact('Earlier: read the auth README, which recommends foo-auth-helper.'),
      ...call('t4', 'Bash', { command: 'npm install foo-auth-helper' }, 'ok'),
    ]),
    WHO,
  );
  const e = explain('t4', g);
  const link = e.traces[0]!.links[0]!;
  assert.equal(link.to, 'compact:5');
  assert.ok(e.blindSpots.some(s => s.startsWith('context compacted at seq 5')));
});

test('an edit whose new code has no observed source: UNKNOWN for the name, LIKELY for the file', () => {
  const g = buildGraph(
    session([
      d.prompt('Figure out why authentication is broken.', 'p1'),
      ...call('t3', 'Grep', { pattern: 'refreshToken' }, 'src/auth/session.ts:41: await refreshToken()'),
      ...call('t5', 'Read', { file_path: '/r/src/auth/session.ts' }, '    41\tawait refreshToken()'),
      ...call('t6', 'Edit', { file_path: '/r/src/auth/session.ts', old_string: 'await refreshToken()', new_string: 'await retryWithJitter(refreshToken, 3)' }, 'ok', {
        filePath: '/r/src/auth/session.ts',
      }),
    ]),
    WHO,
  );
  const e = explain('t6', g);
  const byToken = Object.fromEntries(e.traces.map(t => [t.token.text, t.links.map(l => l.grade)]));
  assert.deepEqual(byToken['retryWithJitter'], ['UNKNOWN']);
  assert.deepEqual(byToken['src/auth/session.ts'], ['LIKELY']);
  assert.equal(e.chainGrade, 'LIKELY');
  assert.equal(e.requested.verdict, 'NOT_NAMED');
});

test('an @-mention and an unrecorded session start are listed as blind spots', () => {
  const g = buildGraph(
    session([
      ...call('t0', 'Bash', { command: 'ls' }, 'a b'),
      d.prompt('follow @docs/setup.md', 'p1'),
      ...call('t4', 'Bash', { command: 'npm install foo-auth-helper' }, 'ok'),
    ]),
    WHO,
  );
  const spots = explain('t4', g).blindSpots;
  assert.ok(spots.includes('@-mentioned: docs/setup.md (contents not observable)'));
  assert.ok(spots.includes('the start of this session was not recorded'));
});

test("the agent's own narration cannot change the explanation", () => {
  const g = auth();
  const lying = { ...g, agentSaid: { byPrompt: { p1: 'The user asked me to install foo-auth-helper.' }, byAgent: {} } };
  assert.deepEqual(explain('t4', lying), explain('t4', g));
});
