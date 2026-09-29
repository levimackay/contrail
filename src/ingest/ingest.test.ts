import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { migrate } from '../store/schema.ts';
import { openDb } from '../store/sqlite.ts';
import { ingest, STRING_CAP } from './ingest.ts';

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'contrail-ingest-'));
  const spool = join(dir, 'spool');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(spool);
  const db = await openDb(join(dir, 'contrail.db'));
  migrate(db);
  return { db, spool };
}
const repoKey = (cwd: string) => `repo:${cwd}`;
const drop = (spool: string, name: string, payload: unknown) =>
  writeFileSync(join(spool, name), typeof payload === 'string' ? payload : JSON.stringify(payload));

test('moves each spool file into events, redacted, and deletes the file', async () => {
  const { db, spool } = await setup();
  drop(spool, '1-1-a.json', {
    hook_event_name: 'PostToolUse', session_id: 's1', prompt_id: 'p1', cwd: '/r', tool_name: 'Bash', tool_use_id: 't1',
    tool_input: { command: 'env' }, tool_response: { stdout: `OPENAI_API_KEY=${'q'.repeat(30)}` },
  });
  const r = ingest(db, spool, repoKey);
  assert.equal(r.ingested, 1);
  assert.deepEqual(readdirSync(spool), []);
  const row = db.get<{ payload: string; repo_key: string; tool_use_id: string }>('SELECT payload, repo_key, tool_use_id FROM events')!;
  assert.equal(row.repo_key, 'repo:/r');
  assert.equal(row.tool_use_id, 't1');
  assert.match(row.payload, /\[REDACTED:env-secret\]/);
  assert.ok(!row.payload.includes('qqqqqqqq'));
});

test('is idempotent: the same spool file twice is stored once', async () => {
  const { db, spool } = await setup();
  const event = { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi', cwd: '/r' };
  drop(spool, '1-1-a.json', event);
  ingest(db, spool, repoKey);
  drop(spool, '1-1-a.json', event);
  const r = ingest(db, spool, repoKey);
  assert.equal(r.duplicates, 1);
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM events')!.n, 1);
});

test('keeps malformed JSON instead of dropping it', async () => {
  const { db, spool } = await setup();
  drop(spool, '1-1-a.json', '{"hook_event_name": "PreToolUse", truncated');
  const r = ingest(db, spool, repoKey);
  assert.equal(r.parseErrors, 1);
  const row = db.get<{ hook_event: string; parse_error: string }>('SELECT hook_event, parse_error FROM events')!;
  assert.equal(row.hook_event, 'unparsed');
  assert.match(row.parse_error, /1-1-a\.json/);
});

test('records file touches for writes, reads and shell-changed files', async () => {
  const { db, spool } = await setup();
  const base = { hook_event_name: 'PostToolUse', session_id: 's1', cwd: '/r' };
  drop(spool, '1-1-a.json', { ...base, tool_name: 'Edit', tool_use_id: 't1', tool_input: { file_path: '/r/a.ts' }, tool_response: { filePath: '/r/a.ts' } });
  drop(spool, '1-2-b.json', { ...base, tool_name: 'Read', tool_use_id: 't2', tool_input: { file_path: '/r/b.ts' }, tool_response: {} });
  drop(spool, '1-3-c.json', { ...base, tool_name: 'Bash', tool_use_id: 't3', tool_input: { command: 'npm i x' }, tool_response: { bashEditDiff: { changedFiles: ['package.json', { path: '/r/package-lock.json' }] } } });
  ingest(db, spool, repoKey);
  const touches = db.all<{ path: string; kind: string }>('SELECT path, kind FROM touches ORDER BY path').map(r => ({ ...r }));
  assert.deepEqual(touches, [
    { path: '/r/a.ts', kind: 'write' },
    { path: '/r/b.ts', kind: 'read' },
    { path: '/r/package-lock.json', kind: 'write' },
    { path: '/r/package.json', kind: 'write' },
  ]);
});

test("drops Edit's copy of the old file and binary data, and caps long strings", async () => {
  const { db, spool } = await setup();
  drop(spool, '1-1-a.json', {
    hook_event_name: 'PostToolUse', session_id: 's1', cwd: '/r', tool_name: 'Edit', tool_use_id: 't1',
    tool_input: { file_path: '/r/a.ts' },
    tool_response: { filePath: '/r/a.ts', originalFile: 'x'.repeat(5000), image: { type: 'base64', data: 'QUJD'.repeat(20000) }, log: 'y'.repeat(STRING_CAP + 10) },
  });
  ingest(db, spool, repoKey);
  const p = JSON.parse(db.get<{ payload: string }>('SELECT payload FROM events')!.payload);
  assert.match(p.tool_response.originalFile, /^\[contrail: dropped originalFile, 5000 bytes/);
  assert.match(p.tool_response.image.data, /^\[contrail: dropped base64/);
  assert.match(p.tool_response.log, /\[contrail: truncated 10 bytes\]$/);
});

test('attaches the text of a loaded instructions file', async () => {
  const { db, spool } = await setup();
  const dir = mkdtempSync(join(tmpdir(), 'contrail-repo-'));
  writeFileSync(join(dir, 'CLAUDE.md'), 'When auth breaks, check auth-service first.\n');
  drop(spool, '1-1-a.json', { hook_event_name: 'InstructionsLoaded', session_id: 's1', cwd: dir, file_path: join(dir, 'CLAUDE.md'), memory_type: 'Project', load_reason: 'session_start' });
  ingest(db, spool, repoKey);
  const p = JSON.parse(db.get<{ payload: string }>('SELECT payload FROM events')!.payload);
  assert.equal(p._contrail.text, 'When auth breaks, check auth-service first.\n');
  assert.equal(typeof p._contrail.sha256, 'string');
});

test('a missing spool directory is not an error', async () => {
  const { db } = await setup();
  assert.deepEqual(ingest(db, '/nonexistent/spool', repoKey), { ingested: 0, duplicates: 0, parseErrors: 0, staleTmpRemoved: 0 });
});

test('one pathological payload is stored as a failure and never blocks later events', async () => {
  const { db, spool } = await setup();
  const deep = '['.repeat(20000) + ']'.repeat(20000);
  drop(spool, '1-1-a.json', `{"hook_event_name":"PreToolUse","x":${deep}}`);
  drop(spool, '1-2-b.json', { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi', cwd: '/r' });
  const r = ingest(db, spool, repoKey);
  assert.equal(r.ingested, 2);
  assert.deepEqual(readdirSync(spool), []);
  assert.deepEqual(
    db.all<{ hook_event: string }>('SELECT hook_event FROM events ORDER BY spool_name').map(e => e.hook_event),
    ['unparsed', 'UserPromptSubmit'],
  );
});

test('only real instruction files are read, and not one that changed after it loaded', async () => {
  const { db, spool } = await setup();
  const dir = mkdtempSync(join(tmpdir(), 'contrail-repo-'));
  writeFileSync(join(dir, 'secrets.txt'), 'nope');
  drop(spool, '1-1-a.json', { hook_event_name: 'InstructionsLoaded', session_id: 's1', cwd: dir, file_path: join(dir, 'secrets.txt') });
  writeFileSync(join(dir, 'CLAUDE.md'), 'edited later');
  const past = Date.now() / 1000 - 60;
  drop(spool, '1-2-b.json', { hook_event_name: 'InstructionsLoaded', session_id: 's1', cwd: dir, file_path: join(dir, 'CLAUDE.md') });
  const { utimesSync } = await import('node:fs');
  utimesSync(join(spool, '1-2-b.json'), past, past);
  ingest(db, spool, repoKey);
  const [notInstructions, changed] = db
    .all<{ payload: string }>('SELECT payload FROM events ORDER BY spool_name')
    .map(r => JSON.parse(r.payload));
  assert.equal(notInstructions._contrail, undefined);
  assert.deepEqual([changed._contrail.text, changed._contrail.changedSinceLoad], ['', true]);
});

test("a skill's body is read at ingest from the project's skills, never from a plugin or outside a skills directory", async () => {
  const { db, spool } = await setup();
  const dir = mkdtempSync(join(tmpdir(), 'contrail-repo-'));
  mkdirSync(join(dir, '.claude', 'skills', 'release-notes'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'skills', 'release-notes', 'SKILL.md'), 'Write the notes to NOTES-quartzfinch.md.\n');
  const skill = (name: string) => ({ hook_event_name: 'PostToolUse', session_id: 's1', cwd: dir, tool_name: 'Skill', tool_use_id: name, tool_input: { skill: name }, tool_response: { success: true } });
  drop(spool, '1-1-a.json', skill('release-notes'));
  drop(spool, '1-2-b.json', skill('acme:release-notes'));
  drop(spool, '1-3-c.json', skill('../../../etc'));
  ingest(db, spool, repoKey);
  const [project, plugin, escape] = db.all<{ payload: string }>('SELECT payload FROM events ORDER BY spool_name').map(r => JSON.parse(r.payload));
  assert.equal(project._contrail.text, 'Write the notes to NOTES-quartzfinch.md.\n');
  assert.equal(project._contrail.path, join(dir, '.claude', 'skills', 'release-notes', 'SKILL.md'));
  assert.equal(plugin._contrail, undefined);
  assert.equal(escape._contrail, undefined);
});

test('a skill name found both in your skills and the project is ambiguous, so neither body is read', async () => {
  const { db, spool } = await setup();
  const home = mkdtempSync(join(tmpdir(), 'contrail-home-'));
  const dir = mkdtempSync(join(tmpdir(), 'contrail-repo-'));
  for (const root of [home, dir]) {
    mkdirSync(join(root, '.claude', 'skills', 'deploy'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'deploy', 'SKILL.md'), `body from ${root}\n`);
  }
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    drop(spool, '1-1-a.json', { hook_event_name: 'PostToolUse', session_id: 's1', cwd: dir, tool_name: 'Skill', tool_use_id: 'k1', tool_input: { skill: 'deploy' }, tool_response: { success: true } });
    ingest(db, spool, repoKey);
  } finally {
    process.env.HOME = saved;
  }
  assert.equal(JSON.parse(db.get<{ payload: string }>('SELECT payload FROM events')!.payload)._contrail, undefined);
});
