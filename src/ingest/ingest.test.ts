import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
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
