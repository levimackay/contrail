import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main } from '../src/cli.ts';
import { call, d, session, type Draft } from './fixtures/synthetic.ts';

const T = 1_790_000_000; // the second git dates the commit

/** A repo with one quiet commit dated T, and a spool whose events carry the given times. */
function setup(events: Array<[Draft, number]>): { repo: string; data: string; sha: string } {
  const root = mkdtempSync(join(tmpdir(), 'contrail-commit-time-'));
  const repo = join(root, 'repo');
  const data = join(root, 'data');
  mkdirSync(repo);
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  const env = { ...process.env, GIT_AUTHOR_DATE: `@${T} +0000`, GIT_COMMITTER_DATE: `@${T} +0000` };
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', '-C', repo, ...args], { encoding: 'utf8', env }).trim();
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'Add a');
  const sha = git('rev-parse', 'HEAD');

  mkdirSync(join(data, 'spool'), { recursive: true });
  session(events.map(([draft]) => draft), 'sq', repo).forEach((row, i) => {
    const file = join(data, 'spool', `${events[i]![1]}-${i}-t.json`);
    writeFileSync(file, row.payload);
    utimesSync(file, events[i]![1], events[i]![1]);
  });
  return { repo, data, sha };
}

async function why(repo: string, data: string, sha: string) {
  let out = '';
  let err = '';
  const code = await main(['why', 'commit', sha, '--data', data], { out: s => (out += s), err: s => (err += s), cwd: repo, env: {}, home: '/Users/dev' });
  return { code, out, err };
}

const quiet = (id: string): Draft[] => call(id, 'Bash', { command: 'git add -A && git commit -q -m "Add a"' }, '', { stdout: '', stderr: '' });

test('a quiet commit is joined on the second git dated it: LIKELY, never DIRECT', async () => {
  const [pre, post, batch] = quiet('c1');
  const { repo, data, sha } = setup([
    [d.prompt('add a.txt and commit it', 'p1'), T - 30],
    [pre!, T - 1],
    [post!, T + 1],
    [batch!, T + 1],
  ]);
  const r = await why(repo, data, sha.slice(0, 7));
  assert.equal(r.err, '');
  assert.match(r.out, /LIKELY {3}made by Bash c1 \(seq \d+\): the only recorded git commit running when git dated this commit \(\d\d:\d\d:\d\d UTC\) {2}\[R9\]/);
  assert.match(r.out, /git printed no commit line/);
  assert.doesNotMatch(r.out, /DIRECT {3}made by/);
});

test('a commit outside every recorded command window is not attributed', async () => {
  const [pre, post, batch] = quiet('c1');
  const { repo, data, sha } = setup([
    [d.prompt('commit it', 'p1'), T - 60],
    [pre!, T - 40],
    [post!, T - 38],
    [batch!, T - 38],
  ]);
  const r = await why(repo, data, sha);
  assert.equal(r.code, 1);
  assert.match(r.err, /No recorded agent action made commit/);
});

test('two git commits running at that second attribute nothing', async () => {
  const [pre1, post1] = quiet('c1');
  const [pre2, post2] = quiet('c2');
  const { repo, data, sha } = setup([
    [d.prompt('commit it', 'p1'), T - 60],
    [pre1!, T - 2],
    [pre2!, T - 1],
    [post1!, T + 1],
    [post2!, T + 2],
  ]);
  const r = await why(repo, data, sha);
  assert.equal(r.code, 1);
  assert.match(r.err, /2 recorded git commits were running when git dated commit/);
});
