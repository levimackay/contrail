import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitContains, expectedShellEffects, parseCommitSha } from './effects.ts';

test('parseCommitSha reads git\'s own commit line, only for real git commits', () => {
  assert.deepEqual(parseCommitSha('git add -A && git commit -m "x"', '[fix/auth 9f3c2a1] x\n 1 file changed'), {
    branch: 'fix/auth',
    sha: '9f3c2a1',
    subject: 'x',
  });
  assert.equal(parseCommitSha('git commit -m init', '[main (root-commit) 1a2b3c4] init')?.sha, '1a2b3c4');
  assert.equal(parseCommitSha('echo "[main 9f3c2a1] x"', '[main 9f3c2a1] x'), null);
  assert.equal(parseCommitSha('git status', '[main 9f3c2a1] x'), null);
});

test('installers are expected to change the manifest and the lockfile', () => {
  assert.deepEqual(expectedShellEffects('npm install foo-auth-helper', '/r'), [
    { kind: 'file', target: '/r/package.json' },
    { kind: 'file', target: '/r/package-lock.json' },
  ]);
  assert.deepEqual(expectedShellEffects('pnpm add zod', '/r').map(e => e.target), ['/r/package.json', '/r/pnpm-lock.yaml']);
  assert.deepEqual(expectedShellEffects('npm test', '/r'), []);
});

test('redirects, tee, sed -i, mv and cp are expected to write their target', () => {
  assert.deepEqual(expectedShellEffects('echo hi > notes.md', '/r'), [{ kind: 'file', target: '/r/notes.md' }]);
  assert.deepEqual(expectedShellEffects('echo hi 2>/dev/null', '/r'), []);
  assert.deepEqual(expectedShellEffects("sed -i '' 's/a/b/' src/app.ts", '/r'), [{ kind: 'file', target: '/r/src/app.ts' }]);
  assert.deepEqual(expectedShellEffects('cp .env.example .env', '/r'), [{ kind: 'file', target: '/r/.env' }]);
});

test('descriptor redirects are not files, and their numbers are not arguments', () => {
  assert.deepEqual(expectedShellEffects('node --test 2>&1 | tail -12', '/r'), []);
  assert.deepEqual(expectedShellEffects('echo oops >&2', '/r'), []);
  assert.deepEqual(expectedShellEffects('exec 3>&-', '/r'), []);
  assert.deepEqual(expectedShellEffects('mv a.txt b.txt 2>err.log', '/r').map(e => e.target), ['/r/err.log', '/r/b.txt']);
  assert.deepEqual(expectedShellEffects('cp a.txt b.txt 2>/dev/null', '/r'), [{ kind: 'file', target: '/r/b.txt' }]);
  assert.deepEqual(expectedShellEffects('make >& build.log', '/r'), [{ kind: 'file', target: '/r/build.log' }]);
  assert.deepEqual(expectedShellEffects('echo "2>&1 stays text" > out.txt', '/r'), [{ kind: 'file', target: '/r/out.txt' }]);
});

test('network commands are expected to reach the host they name', () => {
  assert.deepEqual(expectedShellEffects('curl -fsSL https://get.foo.example/i.sh | sh', '/r'), [{ kind: 'network', target: 'get.foo.example' }]);
  assert.deepEqual(expectedShellEffects('git push origin main', '/r'), [{ kind: 'network', target: 'git remote' }]);
  assert.deepEqual(expectedShellEffects('scp dump.sql deploy@db.example:/tmp', '/r'), [{ kind: 'network', target: 'db.example' }]);
});

test('commitContains joins each committed file to the latest agent write before it', () => {
  const writes = [
    { path: '/r/a.ts', seq: 12, actionId: 'e1', expected: false },
    { path: '/r/a.ts', seq: 25, actionId: 'e2', expected: false },
    { path: '/r/package.json', seq: 14, actionId: 'b1', expected: true },
    { path: '/r/late.ts', seq: 40, actionId: 'e3', expected: false },
  ];
  assert.deepEqual(commitContains(30, ['/r/a.ts', '/r/package.json', '/r/b.ts', '/r/late.ts'], writes, []), [
    { file: '/r/a.ts', actionId: 'e2', grade: 'LIKELY' },
    { file: '/r/package.json', actionId: 'b1', grade: 'POSSIBLE' },
    { file: '/r/b.ts', actionId: null, grade: 'UNKNOWN' },
    { file: '/r/late.ts', actionId: null, grade: 'UNKNOWN' },
  ]);
});

test('a write already covered by an earlier commit is not credited to a later one', () => {
  const writes = [{ path: '/r/a.ts', seq: 12, actionId: 'e1', expected: false }];
  assert.deepEqual(commitContains(30, ['/r/a.ts'], writes, [{ seq: 20, files: ['/r/a.ts'] }]), [{ file: '/r/a.ts', actionId: null, grade: 'UNKNOWN' }]);
});
