import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const HOOKS = join(import.meta.dirname, '..', 'plugin', 'hooks');
const CAPTURE = join(HOOKS, 'capture.sh');
const HEALTH = join(HOOKS, 'health.sh');
const PATH = process.env.PATH ?? '';
const temp = () => mkdtempSync(join(tmpdir(), 'contrail-hook-'));
const run = (script: string, input: string, env: Record<string, string>) =>
  spawnSync('sh', [script], { input, env: { PATH, ...env }, encoding: 'utf8' });

test('capture writes one 0600 spool file per event and prints nothing', () => {
  const data = temp();
  const payload = '{"hook_event_name":"PreToolUse","tool_name":"Bash"}';
  const r = run(CAPTURE, payload, { CLAUDE_PLUGIN_DATA: data });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const files = readdirSync(join(data, 'spool'));
  assert.equal(files.length, 1);
  assert.match(files[0]!, /^\d+-\d+-\w+\.json$/);
  assert.equal(statSync(join(data, 'spool', files[0]!)).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(data, 'spool', files[0]!), 'utf8'), payload);
});

test('CONTRAIL_HOME overrides the plugin data directory', () => {
  const data = temp();
  const other = temp();
  run(CAPTURE, '{}', { CLAUDE_PLUGIN_DATA: other, CONTRAIL_HOME: data });
  assert.equal(readdirSync(join(data, 'spool')).length, 1);
  assert.deepEqual(readdirSync(other), []);
});

test('capture exits 0 silently with no data directory', () => {
  const r = run(CAPTURE, '{}', {});
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('capture exits 0 silently when the data directory is not writable', { skip: process.getuid?.() === 0 }, () => {
  const data = temp();
  chmodSync(data, 0o500);
  const r = run(CAPTURE, '{}', { CLAUDE_PLUGIN_DATA: data });
  chmodSync(data, 0o700);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('sixteen concurrent 300 KB events all land intact', async () => {
  const data = temp();
  await Promise.all(
    Array.from({ length: 16 }, (_, i) => new Promise<void>((resolve, reject) => {
      const p = spawn('sh', [CAPTURE], { env: { PATH, CLAUDE_PLUGIN_DATA: data } });
      p.on('error', reject);
      p.on('close', code => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      p.stdin.end(JSON.stringify({ i, pad: 'x'.repeat(300_000) }));
    })),
  );
  const files = readdirSync(join(data, 'spool'));
  assert.equal(files.length, 16);
  const seen = files.map(f => JSON.parse(readFileSync(join(data, 'spool', f), 'utf8')).i as number).sort((a, b) => a - b);
  assert.deepEqual(seen, [...Array(16).keys()]);
});

test('health is silent when recording works', () => {
  const r = run(HEALTH, '{}', { CLAUDE_PLUGIN_DATA: temp() });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('health makes the data directory private, however Claude Code created it', () => {
  const data = temp();
  chmodSync(data, 0o755);
  const r = run(HEALTH, '{}', { CLAUDE_PLUGIN_DATA: data });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(statSync(data).mode & 0o777, 0o700);
});

test('health warns the user, as JSON, when recording cannot work', () => {
  const r = run(HEALTH, '{}', {});
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /Contrail is not recording/);
});

test('health keeps a stable launcher in the data directory, quoting paths safely', () => {
  const base = temp();
  const root = join(base, "it's a plugin");
  symlinkSync(join(import.meta.dirname, '..', 'plugin'), root);
  const data = join(base, 'data dir');
  const r = run(HEALTH, '{}', { CLAUDE_PLUGIN_ROOT: root, CLAUDE_PLUGIN_DATA: data });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'still silent');
  const launcher = join(data, 'bin', 'contrail');
  assert.equal(statSync(launcher).mode & 0o777, 0o700);
  const v = spawnSync('sh', [launcher, 'doctor'], { env: { PATH }, encoding: 'utf8' });
  assert.match(v.stdout, /^contrail \d+\.\d+\.\d+ on /);
  assert.match(v.stdout, new RegExp(`data directory +${data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`), 'reads the directory it lives in');
});
