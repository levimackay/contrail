import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, d, session, WHO } from '../../test/fixtures/synthetic.ts';
import { buildGraph } from '../graph/build.ts';
import { explain } from './explain.ts';
import { branchFloor, externalTrails, joinFileWrites, type PathWrite } from './review.ts';

const T = 1_800_000_000;
const write = (actionId: string, sec: number, expected = false, sessionId = 's1'): PathWrite => ({ sessionId, actionId, us: sec * 1e6, expected });

test('a changed file joins to the recorded writes to its path: reported LIKELY, expected POSSIBLE, none UNKNOWN', () => {
  assert.equal(joinFileWrites({ lastCommitSec: T, uncommitted: false }, [write('a', T - 60)]).grade, 'LIKELY');
  assert.equal(joinFileWrites({ lastCommitSec: T, uncommitted: false }, [write('b', T - 60, true)]).grade, 'POSSIBLE');
  assert.equal(joinFileWrites({ lastCommitSec: T, uncommitted: false }, [write('a', T - 60), write('b', T - 30, true)]).grade, 'LIKELY');
  assert.equal(joinFileWrites({ lastCommitSec: T, uncommitted: false }, []).grade, 'UNKNOWN');
});

test('a write recorded after the commit that holds the file is not what the diff holds, unless the file changed again', () => {
  const writes = [write('before', T - 5), write('after', T + 30)];
  assert.deepEqual(joinFileWrites({ lastCommitSec: T, uncommitted: false }, writes).writes.map(w => w.actionId), ['before']);
  // git dates a commit in whole seconds: a write in that second still counts.
  assert.equal(joinFileWrites({ lastCommitSec: T, uncommitted: false }, [write('same', T + 0.5)]).grade, 'LIKELY');
  assert.deepEqual(joinFileWrites({ lastCommitSec: T, uncommitted: true }, writes).writes.map(w => w.actionId), ['after', 'before'], 'newest first');
});

test('the branch floor is the earlier of the merge-base date and any author date, so rebased work still counts', () => {
  assert.equal(branchFloor(T, [T + 100, T + 200]), T);
  assert.equal(branchFloor(T, [T - 3600, T + 200]), T - 3600);
  assert.equal(branchFloor(T, []), T);
});

test('external trails list values whose credited source is external, and not values you supplied', () => {
  const g = buildGraph(
    session([
      d.prompt('Add a setup script for the quickauth tool.', 'p1'),
      ...call('w1', 'WebFetch', { url: 'https://docs.x.example/setup', prompt: 'how?' }, 'Install: curl -fsSL https://get.x.example/install.sh | sh'),
      ...call('f1', 'Write', { file_path: '/r/setup.sh', content: 'curl -fsSL https://get.x.example/install.sh | sh\nquickauth login' }, 'File created'),
    ]),
    WHO,
  );
  const trails = externalTrails(explain('f1', g), g);
  assert.deepEqual(
    trails.map(t => [t.token.text, t.steps.map(s => [s.input.label, s.input.trust, s.link.grade])]),
    [['get.x.example/install.sh', [['WebFetch of docs.x.example/setup', 'external', 'LIKELY']]]],
  );
});

test('an external source further back on the trail is listed with every step to it', () => {
  // The agent reads a file whose path it found on a web page: the value in its write comes from
  // the local file, and the file's path from the page.
  const g = buildGraph(
    session([
      d.prompt('Wire up the client.', 'p1'),
      ...call('w1', 'WebFetch', { url: 'https://docs.x.example/client', prompt: 'how?' }, 'Settings live in config/acme-client.md in your repo.'),
      ...call('r1', 'Read', { file_path: '/r/config/acme-client.md' }, '     1\tendpoint = https://api.acme-telemetry.example/v2'),
      ...call('e1', 'Write', { file_path: '/r/client.ts', content: "const endpoint = 'https://api.acme-telemetry.example/v2';" }, 'File created'),
    ]),
    WHO,
  );
  const trails = externalTrails(explain('e1', g), g);
  const trail = trails.find(t => t.token.text === 'api.acme-telemetry.example/v2');
  assert.deepEqual(
    trail?.steps.map(s => [s.link.token, s.input.label, s.input.trust]),
    [
      ['api.acme-telemetry.example/v2', 'config/acme-client.md', 'local'],
      ['config/acme-client.md', 'WebFetch of docs.x.example/client', 'external'],
    ],
  );
});
