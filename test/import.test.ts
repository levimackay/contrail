import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, type Io } from '../src/cli.ts';
import { openDb } from '../src/store/sqlite.ts';
import { FAKE_TOKEN, folderOf, SESSION, setupSession, SUBAGENT, writer, writeSession } from './fixtures/transcript.ts';

const DAY = 86_400_000;

/** A home with Claude Code transcripts, a project directory, and an empty Contrail data directory. */
function world() {
  const home = mkdtempSync(join(tmpdir(), 'contrail-import-home-'));
  const repo = mkdtempSync(join(tmpdir(), 'contrail-import-repo-'));
  const data = mkdtempSync(join(tmpdir(), 'contrail-import-data-'));
  const projects = join(home, '.claude', 'projects');
  const run = async (argv: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
    let out = '';
    let err = '';
    const io: Io = { out: s => (out += s), err: s => (err += s), cwd: opts.cwd ?? repo, env: opts.env ?? {}, home };
    const code = await main([...argv, '--data', data], io);
    return { code, out, err };
  };
  return { home, repo, data, projects, run };
}

/** The setup session, a day ago, in the repository's own project folder. */
function addSetup(w: ReturnType<typeof world>, start = Date.now() - DAY) {
  const s = setupSession(w.repo, start);
  writeSession(w.projects, folderOf(w.repo), SESSION, s.main, start + 60_000, [{ id: SUBAGENT, entries: s.subagent, meta: s.meta }]);
}

/** A one-call session of its own, `daysAgo` days ago, in `cwd`. */
function addSmall(w: ReturnType<typeof world>, id: string, daysAgo: number, cwd = w.repo, command = 'npm test') {
  const start = Date.now() - daysAgo * DAY;
  const t = writer(id, cwd, start);
  writeSession(w.projects, folderOf(cwd), id, [
    t.prompt('Run the tests', `${id}-p1`),
    t.calls(`${id}-m1`, [`toolu_${id.slice(0, 8)}01`, 'Bash', { command }]),
    t.result(`toolu_${id.slice(0, 8)}01`, `${id}-p1`, 'ok', { stdout: 'ok', stderr: '' }),
  ], start + 10_000);
}

async function rows(data: string, sql: string): Promise<Array<Record<string, unknown>>> {
  const db = await openDb(join(data, 'contrail.db'));
  try {
    return db.all<Record<string, unknown>>(sql);
  } finally {
    db.close();
  }
}

const NOTE = "reconstructed from Claude Code's transcript by contrail import, not recorded live";

test('an imported session answers why, risks, trace and sessions, and each says it was reconstructed', async () => {
  const w = world();
  addSetup(w);
  const imported = await w.run(['import']);
  assert.equal(imported.code, 0, imported.err);
  assert.match(imported.out, /^1 Claude Code session found for /);
  assert.match(imported.out, /\n {2}imported {5}1 session, \d+ events\n/);
  assert.match(imported.out, /\n {2}5b1d2c3e {2}\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}\d+ events/);

  const last = await w.run(['why', 'last']);
  assert.equal(last.code, 0, last.err);
  assert.match(last.out, new RegExp(`^Bash {2}rm -rf build\n {2}session 5b1d2c3e · turn p2 · .* · no result recorded .*\n {2}${NOTE}\n`));
  assert.match(last.out, /Blind spots: .*what only hooks record, as this session was rebuilt from Claude Code's transcript/);

  const install = (await w.run(['why', 'curl -fsSL'])).out;
  assert.match(install, /\n {2}not named in your words · runs remote code · network · values from external content\n/);
  assert.match(install, /LIKELY {3}only observed in WebFetch of docs\.zeta\.example\/start:2 {2}\[R3\]/);
  assert.match(install, /Turn {8}DIRECT {3}ran while answering p1: "Set up the zeta CLI/);

  const risks = (await w.run(['risks'])).out;
  assert.match(risks, /▲ curl -fsSL https:\/\/get\.zeta\.example\/install\.sh \| sh\n/);
  assert.match(risks, /session 5b1d2c3e \(from transcript\) · p1 · /);
  assert.match(risks, /\nThis session was reconstructed, wholly or in part, from Claude Code's transcript by contrail import, not recorded live\.\n$/);

  const trace = (await w.run(['trace'])).out;
  assert.match(trace, new RegExp(`^Session 5b1d2c3e  .*\n${NOTE}\n`));
  assert.match(trace, /LOADED {2}CLAUDE\.md \[subagent a5e1b…a6b7c\]/);
  assert.match(trace, /SEARCH {2}"ZETA_TOKEN" in src \[subagent a5e1b…a6b7c\]/);
  assert.match(trace, /COMPACTED/);
  assert.match((await w.run(['trace', '--tree'])).out, new RegExp(`^Session 5b1d2c3e  .*\n${NOTE}\n`));

  const sessions = (await w.run(['sessions'])).out;
  assert.match(sessions, /^SESSION {3}SOURCE {6}LAST ACTIVE/);
  assert.match(sessions, /\n5b1d2c3e {2}transcript {2}/);
  assert.equal(JSON.parse((await w.run(['sessions', '--json'])).out)[0].source, 'transcript');
  assert.match((await w.run(['find', 'ZETA_TOKEN'])).out, /Session 5b1d2c3e \(from transcript\)/);
  assert.match((await w.run(['report', 'last'])).out, /<p class="meta"><b>reconstructed from Claude Code&#39;s transcript by contrail import, not recorded live<\/b><\/p>/);

  for (const out of [imported.out, last.out, install, risks, trace, sessions]) {
    const own = out.split('\n').filter(l => !/^\s*(\d+)?│/.test(l.trim()) && !l.startsWith('Agent said') && !l.includes('"')).join('\n').toLowerCase();
    for (const word of ['because', 'caused', 'led to', 'decided', 'tainted', 'malicious']) assert.ok(!own.includes(word), `says "${word}"`);
  }
});

test('every imported row is marked as reconstructed, and the secrets in it are redacted before storage', async () => {
  const w = world();
  addSetup(w);
  await w.run(['import']);
  const all = await rows(w.data, 'SELECT source, spool_name, payload FROM events');
  assert.ok(all.length > 20);
  assert.ok(all.every(r => r.source === 'transcript' && String(r.spool_name).startsWith(`transcript:${SESSION}:`)));
  const text = all.map(r => r.payload).join('\n');
  assert.ok(!text.includes(FAKE_TOKEN), 'a token from a tool result reached the database');
  assert.match(text, /\[REDACTED:[\w-]+\]/);
  assert.deepEqual((await rows(w.data, "SELECT kind, path FROM touches ORDER BY kind")).map(r => `${r.kind} ${String(r.path).replace(w.repo, '')}`), ['read /package.json', 'write /src/token.ts']);
});

test('importing again stores nothing new', async () => {
  const w = world();
  addSetup(w);
  await w.run(['import']);
  const before = (await rows(w.data, 'SELECT COUNT(*) AS n FROM events'))[0]!.n;
  const again = await w.run(['import']);
  assert.match(again.out, /\n {2}imported {5}0 sessions, 0 events\n {2}skipped {6}0 already recorded live by Contrail's hooks, left as recorded\n {15}1 already imported\n/);
  assert.equal((await rows(w.data, 'SELECT COUNT(*) AS n FROM events'))[0]!.n, before);
});

test('a session Contrail recorded live is left alone, never mixed with its transcript', async () => {
  const w = world();
  addSetup(w);
  mkdirSync(join(w.data, 'spool'), { recursive: true });
  writeFileSync(join(w.data, 'spool', '1700000000-1-x.json'), JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: SESSION, prompt_id: 'p-0001', cwd: w.repo, prompt: 'Set up the zeta CLI' }));
  const r = await w.run(['import']);
  assert.match(r.out, /\n {2}imported {5}0 sessions, 0 events\n {2}skipped {6}1 already recorded live by Contrail's hooks, left as recorded\n/);
  assert.deepEqual((await rows(w.data, 'SELECT source FROM events')).map(x => x.source), [null]);
});

test('--since leaves older sessions for later; without it they come in', async () => {
  const w = world();
  addSmall(w, '11111111-0000-4000-8000-000000000001', 1);
  addSmall(w, '22222222-0000-4000-8000-000000000002', 10);
  const recent = await w.run(['import', '--since', '2d']);
  assert.match(recent.out, /imported {5}1 session, /);
  assert.match(recent.out, /\n {15}1 last active before --since 2d\n/);
  assert.match((await w.run(['import', '--since', new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)])).out, /imported {5}1 session, /);
  const bad = await w.run(['import', '--since', 'last tuesday']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /--since takes a date such as 2026-09-01, or a duration/);
});

test('a session older than retention is not imported, since retention would remove it at once', async () => {
  const w = world();
  writeFileSync(join(w.data, 'config.json'), JSON.stringify({ retention_days: 5 }));
  addSmall(w, '22222222-0000-4000-8000-000000000002', 10);
  assert.match((await w.run(['import'])).out, /\n {15}1 last active over 5 days ago, which retention would remove at once\n/);
});

test('an import stops at the size cap, so retention never has to push a recorded session out for it', async () => {
  const w = world();
  writeFileSync(join(w.data, 'config.json'), JSON.stringify({ max_db_mb: 0.001 }));
  addSmall(w, '11111111-0000-4000-8000-000000000001', 1);
  assert.match((await w.run(['import'])).out, /\n {15}1 left out once the database reached its 0\.001 MB size cap \(max_db_mb\)/);
  assert.equal((await rows(w.data, 'SELECT COUNT(*) AS n FROM events'))[0]!.n, 0);
});

test('--dry-run writes nothing: no database is created, and an existing one gains no rows', async () => {
  const w = world();
  addSetup(w);
  const dry = await w.run(['import', '--dry-run']);
  assert.equal(dry.code, 0, dry.err);
  assert.match(dry.out, /\n {2}would import 1 session, \d+ events\n/);
  assert.match(dry.out, /\nDry run: nothing was written\./);
  assert.deepEqual(readdirSync(w.data), []);

  addSmall(w, '11111111-0000-4000-8000-000000000001', 1);
  await w.run(['import', '--since', '2026-01-01']);
  await w.run(['ingest']);
  const before = (await rows(w.data, 'SELECT COUNT(*) AS n FROM events'))[0]!.n;
  assert.match((await w.run(['import', '--dry-run'])).out, /would import 0 sessions, 0 events\n {2}skipped {6}0 already recorded live by Contrail's hooks, left as recorded\n {15}2 already imported/);
  assert.equal((await rows(w.data, 'SELECT COUNT(*) AS n FROM events'))[0]!.n, before);
});

test('by default only this repository\'s sessions come in; --project and --all take others', async () => {
  const w = world();
  const other = mkdtempSync(join(tmpdir(), 'contrail-import-other-'));
  addSmall(w, '11111111-0000-4000-8000-000000000001', 1);
  addSmall(w, '33333333-0000-4000-8000-000000000003', 1, other, 'make');
  assert.match((await w.run(['import'])).out, /^1 Claude Code session found .*\n {2}imported {5}1 session/);
  assert.match((await w.run(['import', '--project', other])).out, /^1 Claude Code session found for .*contrail-import-other-.*\n {2}imported {5}1 session/);
  assert.match((await w.run(['import', '--all'])).out, /^2 Claude Code sessions found for all projects.*\n {2}imported {5}0 sessions, 0 events\n.*\n {15}2 already imported/);
  const folder = join(w.projects, folderOf(other));
  assert.match((await w.run(['import', '--project', folder])).out, /^1 Claude Code session found for the project folder /);
  assert.equal((await w.run(['import', '--all', '--project', other])).code, 1);
});

test('transcripts are found under CLAUDE_CONFIG_DIR when it is set', async () => {
  const w = world();
  const config = mkdtempSync(join(tmpdir(), 'contrail-import-config-'));
  const start = Date.now() - DAY;
  const t = writer('44444444-0000-4000-8000-000000000004', w.repo, start);
  writeSession(join(config, 'projects'), folderOf(w.repo), '44444444-0000-4000-8000-000000000004', [t.prompt('hi', 'p1')], start + 1000);
  assert.match((await w.run(['import'], { env: { CLAUDE_CONFIG_DIR: config } })).out, /^1 Claude Code session found .* in .*contrail-import-config-.*\/projects\n {2}imported {5}1 session, 1 event\n/);
});

test('store_content: false keeps no text the agent read from a transcript either, and grading still works', async () => {
  const w = world();
  writeFileSync(join(w.data, 'config.json'), JSON.stringify({ store_content: false }));
  addSetup(w);
  await w.run(['import']);
  const text = (await rows(w.data, 'SELECT payload FROM events')).map(r => r.payload).join('\n');
  assert.ok(!text.includes('To install, run'), 'the fetched page was stored as text');
  assert.ok(!text.includes('Use pnpm here'), 'the instructions file was stored as text');
  const install = (await w.run(['why', 'curl -fsSL'])).out;
  assert.match(install, /LIKELY {3}only observed in WebFetch of docs\.zeta\.example\/start:2 {2}\[R3\]/);
  assert.match(install, /\(text not stored\)/);
});

test('malformed lines and unknown entries are counted in the summary; an unreadable transcript is unparseable', async () => {
  const w = world();
  const start = Date.now() - DAY;
  const t = writer('55555555-0000-4000-8000-000000000005', w.repo, start);
  writeSession(w.projects, folderOf(w.repo), '55555555-0000-4000-8000-000000000005', [t.prompt('hi', 'p1'), '{"broken', t.raw({ type: 'brand-new-kind' })], start + 5000);
  writeSession(w.projects, folderOf(w.repo), '66666666-0000-4000-8000-000000000006', [JSON.stringify({ cwd: w.repo, type: 'queue-operation' }), 'garbage'], start + 5000);
  writeSession(w.projects, folderOf(w.repo), '77777777-0000-4000-8000-000000000007', ['garbage', '{"broken'], start + 5000);
  const r = await w.run(['import']);
  assert.match(r.out, /^2 Claude Code sessions found /);
  assert.match(r.out, /imported {5}1 session, 1 event\n/);
  assert.match(r.out, /\n {15}1 with no prompt or tool call to import\n/);
  assert.match(r.out, /Left out while reading: 2 malformed lines and 1 entry of a type this version does not know\./);
  // Whose a transcript with no readable entry is cannot be told, so only --all and a folder count it.
  assert.match((await w.run(['import', '--all'])).out, /^3 Claude Code sessions found .*\n.*\n.*\n.*1 already imported\n {15}1 unparseable: no entry in them could be read\n/);
});

test('a symlink or a FIFO where a transcript would be is never read', async () => {
  const w = world();
  addSmall(w, '11111111-0000-4000-8000-000000000001', 1);
  const folder = join(w.projects, folderOf(w.repo));
  const secret = join(w.home, 'secret.jsonl');
  writeFileSync(secret, `${JSON.stringify({ type: 'user', cwd: w.repo, message: { content: 'not a transcript' } })}\n`);
  symlinkSync(secret, join(folder, '99999999-0000-4000-8000-000000000009.jsonl'));
  execFileSync('mkfifo', [join(folder, '88888888-0000-4000-8000-000000000008.jsonl')]);
  const r = await w.run(['import', '--all']);
  assert.match(r.out, /^1 Claude Code session found .*\n {2}imported {5}1 session, 4 events\n/);
});

test('with no transcripts for this repository, import says where it looked and what else to try', async () => {
  const w = world();
  assert.match((await w.run(['import'])).out, /^0 Claude Code sessions found .*\n {2}No transcripts here belong to .*--all takes every project/);
  assert.ok(existsSync(join(w.data, 'contrail.db')));
});
