import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, type Io } from '../src/cli.ts';
import { authSession, call, CLAUDE_MD, d, session } from './fixtures/synthetic.ts';

const NOW = Math.floor(Date.now() / 1000);

/** Writes a recorded session into a spool the way the capture hook would, in order, an hour ago. */
function spoolFrom(rows = authSession()): string {
  const data = mkdtempSync(join(tmpdir(), 'contrail-cli-'));
  const spool = join(data, 'spool');
  mkdirSync(spool);
  rows.forEach((row, i) => {
    const file = join(spool, `1700000000-${i}-x.json`);
    const payload = JSON.parse(row.payload);
    if (payload.hook_event_name === 'InstructionsLoaded') payload._contrail = { text: CLAUDE_MD };
    writeFileSync(file, JSON.stringify(payload));
    const t = NOW - 3600 + i / 100;
    utimesSync(file, t, t);
  });
  return data;
}

async function run(argv: string[], cwd = '/r'): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const io: Io = { out: s => (out += s), err: s => (err += s), cwd, env: {}, home: '/Users/dev' };
  const code = await main(argv, io);
  return { code, out, err };
}

test('why "<command>" explains a recorded shell command end to end', async () => {
  const data = spoolFrom();
  const r = await run(['why', 'npm install foo-auth-helper', '--data', data]);
  assert.equal(r.err, '');
  assert.equal(r.code, 0);
  assert.match(r.out, /NOT NAMED/);
  assert.match(r.out, /only observed in auth-service\/README\.md:83/);
  assert.match(r.out, /DIRECT {3}package\.json/);
});

test('why <path> finds the latest change to a file', async () => {
  const data = spoolFrom();
  const r = await run(['why', 'package.json', '--data', data]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Bash {2}npm install foo-auth-helper/);
});

test('--json prints the explanation as data', async () => {
  const data = spoolFrom();
  const r = await run(['why', 'npm install', '--json', '--data', data]);
  const e = JSON.parse(r.out);
  assert.equal(e.requested.verdict, 'NOT_NAMED');
  assert.equal(e.chainGrade, 'LIKELY');
});

test('why <call id> explains any recorded call, by the id reports print or in full', async () => {
  const read = 'toolu_01XWNSRthmT3jfsUEY1ReAd1';
  const data = spoolFrom(
    session([
      d.instructions('/r/CLAUDE.md', CLAUDE_MD),
      d.prompt('Figure out why authentication is broken.', 'p1'),
      ...call(read, 'Read', { file_path: '/r/auth-service/README.md' }, '    83\tuse foo-auth-helper'),
      ...call('toolu_01XWNSRthmT3jfsUEY1InSt2', 'Bash', { command: 'npm install foo-auth-helper' }, 'ok'),
    ]),
  );
  for (const id of ['toolu…ReAd1', 'toolu...ReAd1', read]) {
    const r = await run(['why', id, '--data', data]);
    assert.equal(r.err, '', id);
    assert.match(r.out, /^Read {2}auth-service\/README\.md\n/, id);
    assert.match(r.out, /toolu…ReAd1/, id);
  }
  const missing = await run(['why', 'toolu…NoNe9', '--data', data]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No recorded tool call toolu…NoNe9\./);
});

test('an unknown target is a clear error, not a stack trace', async () => {
  const data = spoolFrom();
  const r = await run(['why', 'src/never-touched.ts', '--data', data]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^contrail: Nothing recorded matches "src\/never-touched\.ts": no agent change to that file, .*Contrail only sees sessions recorded since it was installed\./);
});

test('doctor reports what is stored', async () => {
  const data = spoolFrom();
  await run(['ingest', '--data', data]);
  const r = await run(['doctor', '--data', data]);
  assert.equal(r.code, 0);
  assert.match(r.out, /events stored {4}12 across 1 sessions/);
});

test('ingest from a hook never fails loudly', async () => {
  const r = await run(['ingest', '--from-hook', '--data', '/dev/null/impossible']);
  assert.equal(r.code, 0);
  assert.equal(r.out + r.err, '');
});

test('help and unknown commands', async () => {
  assert.match((await run([])).out, /^contrail \d+\.\d+\.\d+/);
  const bad = await run(['frobnicate']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /unknown command "frobnicate"/);
});

test('a later "contrail why" run by the agent never answers itself', async () => {
  const rows = authSession();
  const own = session([d.pre('t9', 'Bash', { command: 'sh /x/plugin/bin/contrail why "npm install foo-auth-helper"' })]);
  const data = spoolFrom([...rows, { ...own[0]!, id: 99, captured_us: 99_000, session_id: 's1' }]);
  const r = await run(['why', 'npm install foo-auth-helper', '--data', data]);
  assert.match(r.out, /^Bash {2}npm install foo-auth-helper/);
});

test('--stdin takes the target as typed into the skill, quotes and all', () => {
  const data = spoolFrom();
  const launcher = new URL('../plugin/bin/contrail', import.meta.url).pathname;
  spawnSync('npm', ['run', 'build', '--silent'], { cwd: new URL('..', import.meta.url).pathname });
  const r = spawnSync('sh', [launcher, 'why', '--data', data, '--stdin'], { input: '"npm install foo-auth-helper"\n', encoding: 'utf8', cwd: '/' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /only observed in auth-service\/README\.md:83/);
});

test('an unwritable data directory is a clear error, not a crash', { skip: process.getuid?.() === 0 }, async () => {
  const r = await run(['doctor', '--data', '/System/contrail-cannot-write-here']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^contrail: Cannot use the data directory/);
});

test('the data directory resolves as the capture hook does: CONTRAIL_HOME before the plugin directory', async () => {
  const { resolveDataDir } = await import('../src/paths.ts');
  assert.equal(resolveDataDir('/flag', { CONTRAIL_HOME: '/home' }, '/Users/dev', '/plugin'), '/flag');
  assert.equal(resolveDataDir(undefined, { CONTRAIL_HOME: '/home' }, '/Users/dev', '/plugin'), '/home');
  assert.equal(resolveDataDir(undefined, { CLAUDE_PLUGIN_DATA: '/env' }, '/Users/dev', '/plugin'), '/plugin');
  assert.equal(resolveDataDir(undefined, { CLAUDE_PLUGIN_DATA: '/env' }, '/Users/dev'), '/env');
});
