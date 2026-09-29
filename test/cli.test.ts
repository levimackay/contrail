import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, type Io } from '../src/cli.ts';
import { authSession, CLAUDE_MD } from './fixtures/synthetic.ts';

/** Writes a recorded session into a spool the way the capture hook would, in order. */
function spoolFrom(rows = authSession()): string {
  const data = mkdtempSync(join(tmpdir(), 'contrail-cli-'));
  const spool = join(data, 'spool');
  mkdirSync(spool);
  rows.forEach((row, i) => {
    const file = join(spool, `1700000000-${i}-x.json`);
    const payload = JSON.parse(row.payload);
    if (payload.hook_event_name === 'InstructionsLoaded') payload._contrail = { text: CLAUDE_MD };
    writeFileSync(file, JSON.stringify(payload));
    const t = 1_700_000_000 + i / 100;
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

test('an unknown target is a clear error, not a stack trace', async () => {
  const data = spoolFrom();
  const r = await run(['why', 'src/never-touched.ts', '--data', data]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^contrail: No recorded agent change to src\/never-touched\.ts\./);
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
