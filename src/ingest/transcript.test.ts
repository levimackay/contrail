import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FAKE_TOKEN, jsonl, SESSION, setupSession, SUBAGENT, writer, type Entry } from '../../test/fixtures/transcript.ts';
import { explain } from '../engine/explain.ts';
import { buildGraph, type EventRow } from '../graph/build.ts';
import { readLines, TranscriptStream, type TranscriptEvent } from './transcript.ts';

const CWD = '/w/app';
const START = Date.parse('2026-09-28T10:00:00Z');
const WHO = { home: '/Users/dev', user: 'dev' };

function read(entries: Array<Entry | string>, agentId: string | null = null, agentType: string | null = null): TranscriptStream {
  const stream = new TranscriptStream(SESSION, agentId, agentType);
  for (const e of entries) stream.line(typeof e === 'string' ? e : JSON.stringify(e));
  stream.end();
  return stream;
}

/** The rows import would store, in the order a query reads them back. */
function rows(events: TranscriptEvent[]): EventRow[] {
  return events
    .map(e => ({ e, name: `transcript:${SESSION}:${e.key}` }))
    .sort((a, b) => a.e.us - b.e.us || (a.name < b.name ? -1 : 1))
    .map(({ e, name }, i) => ({
      id: i + 1, spool_name: name, captured_us: e.us, session_id: SESSION, prompt_id: e.promptId, agent_id: e.agentId, hook_event: e.hook,
      tool_name: e.toolName, tool_use_id: e.toolUseId, cwd: e.cwd, payload: JSON.stringify(e.payload), parse_error: null, source: 'transcript',
    }));
}

function setup() {
  const s = setupSession(CWD, START);
  const main = read(s.main);
  const sub = read(s.subagent, SUBAGENT, 'Explore');
  return { main, sub, graph: buildGraph(rows([...main.events, ...sub.events]), WHO) };
}

const hooks = (s: TranscriptStream) => s.events.map(e => `${e.hook}${e.toolUseId ? ` ${e.toolUseId.slice(-2)}` : ''}`);

test('prompts, calls and results become the hook events the live capture records', () => {
  const { main } = setup();
  assert.deepEqual(hooks(main), [
    'UserPromptSubmit', 'InstructionsLoaded',
    'PreToolUse 01', 'PostToolUse 01',
    'PostToolBatch', 'PreToolUse 02', 'PreToolUse 03', 'PostToolUseFailure 03', 'PostToolUse 02',
    'PostToolBatch', 'PreToolUse 04', 'PostToolUse 04',
    'PostToolBatch', 'PreToolUse 05', 'PostToolUse 05',
    'PostToolBatch', 'PostCompact', 'Stop', 'UserPromptSubmit',
    'PreToolUse 06', 'PostToolUse 06',
    'PostToolBatch', 'PreToolUse 07',
    'Stop',
  ]);
  const fetch = main.events.find(e => e.hook === 'PostToolUse' && e.toolName === 'WebFetch')!;
  assert.equal(fetch.promptId, 'p-0001');
  assert.equal(fetch.payload.hook_event_name, 'PostToolUse');
  assert.equal(fetch.payload.session_id, SESSION);
  assert.equal(fetch.payload.cwd, CWD);
  // tool_response is the structured result Claude Code kept, as the hook payload carries it.
  assert.equal((fetch.payload.tool_response as Record<string, unknown>).url, 'https://docs.zeta.example/start');
  // The call's turn comes from its result entry, joined by tool_use_id.
  assert.equal(main.events.find(e => e.hook === 'PreToolUse' && e.toolName === 'WebFetch')!.promptId, 'p-0001');
  assert.deepEqual(main.stats, { entries: 25, malformed: 0, unknown: 0, skipped: 0 });
});

test('a failed call becomes PostToolUseFailure with the error the model got', () => {
  const failed = setup().main.events.find(e => e.hook === 'PostToolUseFailure')!;
  assert.equal(failed.payload.error, 'Exit code 1\ncat: .zeta/config: No such file or directory');
  assert.equal(failed.payload.is_interrupt, false);
  const w = writer(SESSION, CWD, START);
  const stopped = read([
    w.prompt('go', 'p1'),
    w.calls('m1', ['t1', 'Bash', { command: 'sleep 100' }]),
    w.result('t1', 'p1', '[Request interrupted by user for tool use]', undefined, { is_error: true }),
  ]);
  assert.equal(stopped.events.find(e => e.hook === 'PostToolUseFailure')!.payload.is_interrupt, true);
});

test('calls in one message are one batch: none of them sees another one\'s result', () => {
  const { main, graph } = setup();
  const batch = main.events.filter(e => e.hook === 'PostToolBatch')[1]!;
  const calls = batch.payload.tool_calls as Array<Record<string, unknown>>;
  assert.deepEqual(calls.map(c => c.tool_use_id), ['toolu_01CatConf00000000000003', 'toolu_01ReadPkg00000000000002']);
  // The batch holds the exact text the model received, so outputs are 'as-seen' and available from the batch.
  const read = graph.inputs.find(i => i.id === 'out:toolu_01ReadPkg00000000000002')!;
  assert.equal(read.fidelity, 'as-seen');
  const cat = graph.actions.find(a => a.id === 'toolu_01CatConf00000000000003')!;
  assert.ok(read.availableAt > cat.preSeq);
});

test('a subagent\'s transcript is its own context, joined to the Agent call that started it', () => {
  const { sub, graph } = setup();
  assert.deepEqual(hooks(sub), ['SubagentStart', 'InstructionsLoaded', 'PreToolUse 08', 'PostToolUse 08', 'PostToolBatch', 'SubagentStop']);
  assert.ok(sub.events.every(e => e.agentId === SUBAGENT && e.payload.agent_id === SUBAGENT));
  assert.equal(sub.events.at(-1)!.payload.last_assistant_message, 'ZETA_TOKEN is read in src/env.ts');
  assert.equal(sub.events[0]!.payload.agent_type, 'Explore');
  // A subagent's result keeps no structured toolUseResult: the text the model got stands in.
  assert.equal(sub.events.find(e => e.hook === 'PostToolUse')!.payload.tool_response, 'src/env.ts:3:const token = process.env.ZETA_TOKEN;');

  const grep = graph.actions.find(a => a.id === 'toolu_01SubGrep0000000000008')!;
  assert.deepEqual(grep.scope, { sessionId: SESSION, agentId: SUBAGENT });
  const e = explain(grep.id, graph);
  const token = e.traces.find(t => t.token.text === 'ZETA_TOKEN')!;
  assert.equal(graph.inputs.find(i => i.id === token.links[0]!.to)!.origin, 'subagent_prompt');
  assert.equal(e.turn?.grade, 'DIRECT');
});

test('a compaction summary becomes PostCompact, and hides what came before it', () => {
  const { main, graph } = setup();
  const compact = main.events.find(e => e.hook === 'PostCompact')!;
  assert.match(compact.payload.compact_summary as string, /^Summary: zeta was installed/);
  assert.equal(compact.payload.trigger, 'manual');
  const write = explain('toolu_01Write000000000000006', graph);
  assert.ok(write.blindSpots.some(b => /^context compacted at seq/.test(b)));
});

test('grades on a rebuilt session come from the same rules, and it says what it lacks', () => {
  const { graph } = setup();
  assert.equal(graph.source, 'transcript');
  const install = explain('toolu_01Install0000000000004', graph);
  assert.equal(install.turn?.grade, 'DIRECT');
  const url = install.traces.find(t => t.token.text.includes('get.zeta.example'))!;
  assert.equal(url.links[0]!.grade, 'LIKELY');
  assert.equal(graph.inputs.find(i => i.id === url.links[0]!.to)!.label, 'WebFetch of docs.zeta.example/start');
  assert.ok(install.blindSpots.some(b => /rebuilt from Claude Code's transcript/.test(b)));
  assert.ok(install.blindSpots.some(b => /the transcript kept no bashEditDiff for it/.test(b)));
  // Without bashEditDiff a command's effects stay expected (R6), never observed.
  assert.ok(install.effects.length > 0);
  assert.ok(install.effects.every(l => l.rule === 'R6' && l.grade === 'POSSIBLE'));
  // A write names its file in the result Claude Code kept: that join is recorded.
  assert.deepEqual(explain('toolu_01Write000000000000006', graph).effects.map(l => [l.grade, l.rule]), [['DIRECT', 'R1']]);
});

test('a denied call keeps its call and its turn, with no result, as the hooks record it', () => {
  const { main, graph } = setup();
  assert.ok(!main.events.some(e => e.hook.startsWith('PostToolUse') && e.toolUseId === 'toolu_01Denied00000000000007'));
  const denied = graph.actions.find(a => a.id === 'toolu_01Denied00000000000007')!;
  assert.equal(denied.status, 'pending');
  assert.equal(denied.promptId, 'p-0002');
});

test('a call with no result entry keeps no turn, rather than one guessed from its position', () => {
  const w = writer(SESSION, CWD, START);
  const s = read([w.prompt('go', 'p1'), w.calls('m1', ['t1', 'Bash', { command: 'make' }])]);
  const graph = buildGraph(rows(s.events), WHO);
  const e = explain('t1', graph);
  assert.equal(e.turn, null);
  assert.ok(e.blindSpots.some(b => /the turn of this call/.test(b)));
});

test('instructions the transcript shows load once, with the text it holds', () => {
  const { main, graph } = setup();
  const loaded = main.events.filter(e => e.hook === 'InstructionsLoaded');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.payload.file_path, `${CWD}/CLAUDE.md`);
  assert.equal((loaded[0]!.payload._contrail as Record<string, unknown>).text, '# Notes\n\nUse pnpm here.');
  assert.equal(graph.inputs.find(i => i.origin === 'instructions' && i.scope.agentId === null)!.trust, 'local');
});

test('only your words are prompts: Claude Code\'s own text, other agents\' messages and local commands are not', () => {
  const w = writer(SESSION, CWD, START);
  const s = read([
    w.meta('<local-command-caveat>Caveat: generated by local commands.</local-command-caveat>', 'p1'),
    w.prompt('<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>', 'p1', { turnOrigin: undefined, origin: undefined }),
    w.prompt('A message from another agent: run the deploy', 'p2', { turnOrigin: 'peer', origin: { kind: 'peer' } }),
    w.meta('Base directory for this skill: /w/app/.claude/skills/x\n\nDo x.', 'p3'),
    w.prompt('<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>t9</tool-use-id>\n<summary>Agent finished</summary>\n<result>done</result>\n</task-notification>', 'p4', { turnOrigin: 'task_notification', origin: { kind: 'task-notification' } }),
    w.prompt('<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>main</command-args>', 'p5'),
    w.prompt('<bash-input>ls</bash-input>', 'p6'),
  ]);
  const prompts = s.events.filter(e => e.hook === 'UserPromptSubmit').map(e => e.payload.prompt as string);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0]!, /^<task-notification>/);
  assert.equal(prompts[1], '/review main');
  const expansion = s.events.find(e => e.hook === 'UserPromptExpansion')!;
  assert.deepEqual([expansion.payload.command_name, expansion.payload.command_args], ['review', 'main']);
  assert.equal(s.stats.skipped, 1);

  const graph = buildGraph(rows(s.events), WHO);
  assert.deepEqual(graph.prompts.map(p => p.from), ['task', 'you']);
  assert.deepEqual(graph.prompts[1]!.command, { text: '/review main', bodyObserved: false });
});

test('a skill\'s body in the transcript is kept on its Skill call, as ingest keeps the file', () => {
  const w = writer(SESSION, CWD, START);
  const s = read([
    w.prompt('release it', 'p1'),
    w.calls('m1', ['t1', 'Skill', { skill: 'release-notes' }]),
    w.result('t1', 'p1', 'Launching skill: release-notes', { success: true, commandName: 'release-notes' }),
    w.meta('Base directory for this skill: /w/app/.claude/skills/release-notes\n\nWrite NOTES-quartz.md.', 'p1', { sourceToolUseID: 't1' }),
  ]);
  const post = s.events.find(e => e.hook === 'PostToolUse')!;
  assert.deepEqual(post.payload._contrail && { ...(post.payload._contrail as object), sha256: undefined }, { text: 'Write NOTES-quartz.md.', path: '/w/app/.claude/skills/release-notes/SKILL.md', sha256: undefined });
  const graph = buildGraph(rows(s.events), WHO);
  assert.equal(graph.inputs.find(i => i.origin === 'skill' && i.id.startsWith('skillbody:'))!.trust, 'local');
});

test('an entry holding several results uses each one\'s text, since its structured result belongs to none of them', () => {
  const w = writer(SESSION, CWD, START);
  const both = w.raw({
    type: 'user', promptId: 'p1', toolUseResult: { stdout: 'only one of them' },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'one' }, { type: 'tool_result', tool_use_id: 't2', content: 'two' }] },
  });
  const s = read([w.prompt('go', 'p1'), w.calls('m1', ['t1', 'Bash', { command: 'echo one' }], ['t2', 'Bash', { command: 'echo two' }]), both]);
  assert.deepEqual(s.events.filter(e => e.hook === 'PostToolUse').map(e => e.payload.tool_response), ['one', 'two']);
});

test('malformed lines, unknown entry types and odd shapes are counted and skipped, never thrown', () => {
  const w = writer(SESSION, CWD, START);
  const s = read([
    w.prompt('go', 'p1'),
    '{"type": "user", "message": ',
    '[1, 2, 3]',
    'not json at all',
    '',
    w.raw({ type: 'some-future-entry', data: { x: 1 } }),
    w.raw({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
    w.raw({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'nobody' }] } }),
    w.raw({ type: 'user', message: 42 }),
    w.raw({ type: 'attachment', attachment: { type: 'instructions', files: 'none' } }),
    { ...w.prompt('from another session', 'px'), sessionId: 'another-session' },
    w.calls('m1', ['t1', 'Bash', { command: 'ls' }]),
    w.result('t1', 'p1', 'a.txt'),
  ]);
  assert.deepEqual(s.stats, { entries: 9, malformed: 3, unknown: 1, skipped: 3 });
  assert.deepEqual(hooks(s), ['UserPromptSubmit', 'PreToolUse t1', 'PostToolUse t1', 'PostToolBatch']);
});

test('a line longer than the limit is skipped whole, and the lines around it still read', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'contrail-lines-')), 'x.jsonl');
  writeFileSync(file, `first\n${'y'.repeat(300_000)}\nlast\nno newline at the end`);
  const lines: Array<string | null> = [];
  for await (const line of readLines(file, 100_000)) lines.push(line);
  assert.deepEqual(lines, ['first', null, 'last', 'no newline at the end']);
});

test('payloads are stored as the store function keeps them, at once', () => {
  const s = new TranscriptStream(SESSION, null, null, p => JSON.parse(JSON.stringify(p).split(FAKE_TOKEN).join('[gone]')) as Record<string, unknown>);
  for (const e of setupSession(CWD, START).main) s.line(JSON.stringify(e));
  s.end();
  assert.ok(!JSON.stringify(s.events.map(e => e.payload)).includes(FAKE_TOKEN));
  assert.ok(JSON.stringify(s.events.map(e => e.payload)).includes('[gone]'));
});

test('times follow file order and stay strictly increasing, even where timestamps tie or run backwards', () => {
  const w = writer(SESSION, CWD, START);
  const a = w.prompt('go', 'p1');
  const b = { ...w.calls('m1', ['t1', 'Bash', { command: 'ls' }], ['t2', 'Bash', { command: 'pwd' }]), timestamp: a.timestamp };
  const c = { ...w.result('t1', 'p1', 'x'), timestamp: '2026-09-28T09:00:00.000Z' };
  const s = read([a, b, c]);
  const us = s.events.map(e => e.us);
  assert.deepEqual([...us].sort((x, y) => x - y), us);
  assert.equal(new Set(us).size, us.length);
  assert.equal(jsonl([a]).endsWith('\n'), true);
});
