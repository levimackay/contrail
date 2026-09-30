import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, type Io } from '../src/cli.ts';
import { writeSpool } from './fixtures/demo.ts';
import { call, d, type Draft } from './fixtures/synthetic.ts';

const S1 = 'aaaa1111-0000-4000-8000-000000000001';
const S2 = 'bbbb2222-0000-4000-8000-000000000002';

/** A repository directory with one file as it is now, and a data directory with the given sessions recorded in order. */
function setup(file: string, now: string, sessions: (path: string, repo: string) => Array<{ id: string; drafts: Draft[] }>) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'contrail-blame-')));
  const data = join(repo, '.data');
  const path = join(repo, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, now);
  writeSpool(data, sessions(path, repo).map(s => ({ ...s, cwd: repo })));
  return { repo, data, path };
}

async function run(cwd: string, argv: string[], stdin?: string): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const io: Io = { out: s => (out += s), err: s => (err += s), cwd, env: {}, home: '/Users/dev', ...(stdin !== undefined ? { stdin: () => stdin } : {}) };
  const code = await main(argv, io);
  return { code, out, err };
}

const edit = (id: string, path: string, old_string: string, new_string: string) =>
  call(id, 'Edit', { file_path: path, old_string, new_string }, 'The file has been updated.', { filePath: path });
const writeFile = (id: string, path: string, content: string) => call(id, 'Write', { file_path: path, content }, 'File created.', { filePath: path, type: 'create' });

const CREATED = 'export const LIMIT = 10;\nexport const WINDOW = 60;\n\nexport function allowed(n: number) {\n  return n < LIMIT;\n}\n';
const NOW = `// Limits for the public API.\n${CREATED.replace('LIMIT = 10', 'LIMIT = 25')}`;

/** Session 1 writes the file; session 2 raises the limit; you add a comment at the top by hand. */
function twoSessions() {
  return setup('src/limits.ts', NOW, path => [
    { id: S1, drafts: [d.prompt('Add a rate limit helper in src/limits.ts', 'p1'), ...writeFile('toolu_01AAAAAAAAAAAAAAAAAAWrite', path, CREATED)] },
    {
      id: S2,
      drafts: [
        d.prompt('The limit is too low, raise it to 25', 'p1'),
        ...call('toolu_01BBBBBBBBBBBBBBBBBBRead1', 'Read', { file_path: path }, CREATED),
        ...edit('toolu_01BBBBBBBBBBBBBBBBBBEdit1', path, 'export const LIMIT = 10;', 'export const LIMIT = 25;'),
      ],
    },
  ]);
}

test('blame credits each line to the latest recorded write across sessions, and leaves your line alone', async () => {
  const { repo, data } = twoSessions();
  const r = await run(repo, ['blame', 'src/limits.ts', '--data', data]);
  assert.equal(r.err, '');
  assert.equal(r.code, 0);
  assert.match(r.out, /^Blame src\/limits\.ts {2}\(the file as it is now\)\n6 of 7 lines attributed to 2 recorded agent calls in 2 sessions · 2 recorded writes to this file\n/);
  assert.match(r.out, /\n\nUNKNOWN {2}no recorded agent write holds these lines \(they may be yours, pre-existing, or changed since\)\n {3}1 │ \/\/ Limits for the public API\.\n/);
  assert.match(r.out, /\nLIKELY {3}Edit toolu…Edit1 · session bbbb2222 · \d{4}-\d\d-\d\d \d\d:\d\d\n {9}p1 your words: "The limit is too low, raise it to 25"\n {9}↳ UNKNOWN no observed source {3}not named by you\n {3}2 │ export const LIMIT = 25;\n/);
  assert.match(r.out, /\nLIKELY {3}Write toolu…Write · session aaaa1111 · .*\n {9}p1 your words: "Add a rate limit helper in src\/limits\.ts"\n {9}↳ LIKELY src\/limits\.ts ← your prompt p1 \(principal\) {3}named by you\n {3}3 │ export const WINDOW = 60;\n {3}4 │\n {3}5 │ export function allowed\(n: number\) \{\n {3}6 │ {3}return n < LIMIT;\n {3}7 │ \}\n\n/, 'the blank line and the closing brace sit inside the block');
  assert.match(r.out, /as in contrail why toolu…Edit1/);
});

test('blame --json gives every line, the blocks, and each call with its turn and trail', async () => {
  const { repo, data, path } = twoSessions();
  const json = JSON.parse((await run(repo, ['blame', 'src/limits.ts', '--json', '--data', data])).out);
  assert.equal(json.file, path);
  assert.deepEqual([json.lines, json.attributed, json.calls, json.sessions], [7, 6, 2, 2]);
  assert.deepEqual(json.writes, { recorded: 2, read: 2 });
  assert.deepEqual(json.blocks, [
    { start: 1, end: 1, call: null, grade: null, rule: null },
    { start: 2, end: 2, call: 'toolu_01BBBBBBBBBBBBBBBBBBEdit1', grade: 'LIKELY', rule: 'R10' },
    { start: 3, end: 7, call: 'toolu_01AAAAAAAAAAAAAAAAAAWrite', grade: 'LIKELY', rule: 'R10' },
  ]);
  assert.deepEqual(json.lineDetail[1], { line: 2, call: 'toolu_01BBBBBBBBBBBBBBBBBBEdit1', grade: 'LIKELY', rule: 'R10', match: 'text', trivial: false, unambiguous: true, writers: 1, inFile: 1, byCall: 1 });
  assert.equal(json.lineDetail[3].match, 'block');
  assert.equal(json.lineDetail[0].call, null);
  const [latest, first] = json.writers;
  assert.equal(latest.call, 'toolu_01BBBBBBBBBBBBBBBBBBEdit1');
  assert.equal(latest.session, S2);
  assert.equal(latest.tool, 'Edit');
  assert.deepEqual(latest.file, { grade: 'DIRECT', rule: 'R1' });
  assert.deepEqual(latest.turn, { label: 'p1', from: 'you', text: 'The limit is too low, raise it to 25' });
  assert.equal(first.requested, 'NAMED', 'you named src/limits.ts');
  assert.equal(first.trail.trust, 'principal');
  assert.match(latest.at, /^\d{4}-\d\d-\d\dT/);
});

test('--session considers one session\'s writes only, and says so', async () => {
  const { repo, data } = twoSessions();
  const r = await run(repo, ['blame', 'src/limits.ts', '--session', 'aaaa', '--data', data]);
  assert.match(r.out, /\n5 of 7 lines attributed to 1 recorded agent call in 1 session · 1 recorded write to this file · only session aaaa1111\n/);
  assert.doesNotMatch(r.out, /Edit1/);
});

test('a file no recorded agent call wrote is a clear message; a missing file too', async () => {
  const { repo, data } = twoSessions();
  writeFileSync(join(repo, 'README.md'), '# mine\n');
  const r = await run(repo, ['blame', 'README.md', '--data', data]);
  assert.equal(r.code, 1);
  assert.match(r.err, /^contrail: No recorded agent write to README\.md\. Contrail sees Edit, Write, MultiEdit and NotebookEdit calls, and shell heredocs/);
  const missing = await run(repo, ['blame', 'nope.ts', '--data', data]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No file nope\.ts\. Blame reads the file as it is now on disk\./);
  assert.equal((await run(repo, ['blame', '--data', data])).code, 1);
});

test('the write is found through a symlinked path, as hooks record it on macOS', async () => {
  const real = realpathSync(mkdtempSync(join(tmpdir(), 'contrail-blame-real-')));
  const link = join(mkdtempSync(join(tmpdir(), 'contrail-blame-link-')), 'via');
  symlinkSync(real, link);
  writeFileSync(join(real, 'a.ts'), 'export const A = 1;\n');
  const data = join(real, '.data');
  writeSpool(data, [{ id: S1, cwd: link, drafts: [d.prompt('add A', 'p1'), ...writeFile('w1', join(link, 'a.ts'), 'export const A = 1;\n')] }]);
  const r = await run(real, ['blame', 'a.ts', '--data', data]);
  assert.equal(r.err, '');
  assert.match(r.out, /1 of 1 line attributed to 1 recorded agent call/);
});

test('a heredoc the shell reported writing is LIKELY; one only expected from the command is POSSIBLE', async () => {
  const { repo, data } = setup('notes.md', 'alpha line\nbeta line\n', (path, dir) => [
    {
      id: S1,
      drafts: [
        d.prompt('write notes', 'p1'),
        ...call('h1', 'Bash', { command: "cat > notes.md <<'EOF'\nalpha line\nEOF" }, '', { stdout: '', stderr: '', bashEditDiff: { changedFiles: [path] } }),
        ...call('h2', 'Bash', { command: `cat >> ${join(dir, 'notes.md')} <<'EOF'\nbeta line\nEOF` }, '', { stdout: '', stderr: '' }),
      ],
    },
  ]);
  const r = await run(repo, ['blame', 'notes.md', '--data', data]);
  assert.match(r.out, /\nLIKELY {3}Bash heredoc h1 .*\n[\s\S]*1 │ alpha line\n/);
  assert.match(r.out, /\nPOSSIBLE Bash heredoc h2 .*\n {9}p1 .*\n {9}the write was expected from the command, not reported by Claude Code\n/);
});

test('blame takes the file on stdin, as the skill passes it, quotes and all', async () => {
  const { repo, data } = twoSessions();
  const viaBlame = await run(repo, ['blame', '--stdin', '--data', data], '"src/limits.ts"\n');
  assert.match(viaBlame.out, /^Blame src\/limits\.ts/);
});

test('recorded and on-disk text cannot put terminal escapes or backticks into blame', async () => {
  const hostile = 'const x = `pwn\x1b]0;t\x07\x1b[2J` + "\u202e\u009b31m";';
  const { repo, data } = setup('h.ts', `${hostile}\nsafe();\n`, path => [
    { id: S1, drafts: [d.prompt('fix \x1b[31mit\x1b[0m `rm -rf`', 'p1'), ...writeFile('w1', path, `${hostile}\nsafe();\n`)] },
  ]);
  const r = await run(repo, ['blame', 'h.ts', '--data', data]);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
  assert.doesNotMatch(r.out, /`/);
  assert.match(r.out, /1 │ const x = ˋpwn/);
});

test('blame never uses causal or accusatory wording of its own', async () => {
  const { repo, data } = twoSessions();
  const outputs = [
    (await run(repo, ['blame', 'src/limits.ts', '--data', data])).out,
    (await run(repo, ['blame', 'README.md', '--data', data])).err,
  ];
  for (const out of outputs) {
    const own = out
      .split('\n')
      .filter(line => !/^\s*\d+ │/.test(line) && !/^\s*(\d+)?│/.test(line.trim()) && !line.startsWith('Agent said') && !line.includes('"'))
      .join('\n')
      .toLowerCase();
    for (const word of ['because', 'caused', 'led to', 'decided', 'tainted', 'malicious']) assert.ok(!own.includes(word), `blame says "${word}"`);
  }
});

test('a file rewritten in many sessions loads and explains only the sessions of the calls credited now', async () => {
  const sessions = Array.from({ length: 25 }, (_, i) => `cccc${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`);
  const { repo, data, path } = setup('gen.ts', 'export const VERSION = 24;\nexport const NAME = "gen";\n', file =>
    sessions.map((id, i) => ({
      id,
      drafts: [d.prompt(`bump to ${i}`, 'p1'), ...writeFile(`v${i}`, file, `export const VERSION = ${i};\nexport const NAME = "gen";\n`), ...call(`r${i}`, 'Read', { file_path: file }, 'x')],
    })),
  );
  assert.equal((await run(repo, ['blame', 'gen.ts', '--data', data])).code, 0, 'ingests the spool');
  const { openDb } = await import('../src/store/sqlite.ts');
  const { blameFile, explainCalls } = await import('../src/query/blame.ts');
  const db = await openDb(join(data, 'contrail.db'));
  const loaded: string[] = [];
  const counting = {
    ...db,
    all: <T,>(sql: string, ...params: Array<string | number | bigint | null>) => {
      if (sql.startsWith('SELECT * FROM events WHERE session_id = ?')) loaded.push(String(params[0]));
      return db.all<T>(sql, ...params);
    },
  };
  const b = blameFile(counting, path, 'gen.ts');
  explainCalls(counting, b, '/Users/dev');
  db.close();
  assert.equal(b.writes, 25);
  assert.deepEqual(b.lines.map(l => l.call), ['v24', 'v24']);
  assert.deepEqual(loaded, [sessions[24]], 'one session loaded, not 25');
  assert.equal(b.calls[0]!.explanation?.action.id, 'v24');
});
