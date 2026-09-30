import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Claude Code session transcripts built by hand, in the shape Claude Code 2.1.285 writes them:
 * one JSON entry per line, user / assistant / attachment / system entries with uuid,
 * parentUuid, sessionId, cwd, timestamp and (on user entries) promptId; tool calls as
 * assistant tool_use blocks, results as user tool_result blocks with the structured result in
 * toolUseResult; subagents in <session>/subagents/agent-<id>.jsonl. Every host is .example.
 */

export type Entry = Record<string, unknown>;

export const FAKE_TOKEN = `ghp_${'Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0Lm9Nb8V'}`;

/** Builds entries for one transcript file, `step` ms apart from `start`. */
export function writer(sessionId: string, cwd: string, start: number, agentId?: string, step = 1000) {
  let clock = start;
  let n = 0;
  let parent: string | null = null;
  const base = (extra: Entry): Entry => {
    const uuid = `${agentId ?? 'main'}-${String(++n).padStart(4, '0')}-0000-4000-8000-000000000000`;
    const e: Entry = {
      parentUuid: parent, isSidechain: Boolean(agentId), ...(agentId ? { agentId } : {}), uuid,
      timestamp: new Date((clock += step)).toISOString(), userType: 'external', entrypoint: 'cli', cwd, sessionId,
      version: '2.1.285', gitBranch: 'main', ...extra,
    };
    parent = uuid;
    return e;
  };
  return {
    /** Your prompt, as Claude Code writes it: plain string content, promptId, turnOrigin. */
    prompt: (text: string, promptId: string, extra: Entry = {}) =>
      base({ type: 'user', promptId, message: { role: 'user', content: text }, turnOrigin: 'human', origin: { kind: 'human' }, promptSource: 'sdk', ...extra }),
    /** Text Claude Code adds itself (a skill body, a caveat). */
    meta: (text: string, promptId: string, extra: Entry = {}) =>
      base({ type: 'user', promptId, isMeta: true, message: { role: 'user', content: [{ type: 'text', text }] }, ...extra }),
    /** One assistant entry holding tool calls; entries of one message share its id. */
    calls: (messageId: string, ...uses: Array<[id: string, name: string, input: Entry]>) =>
      base({
        type: 'assistant', requestId: `req_${messageId}`,
        message: { id: messageId, role: 'assistant', type: 'message', content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input, caller: { type: 'direct' } })) },
      }),
    text: (messageId: string, text: string) =>
      base({ type: 'assistant', requestId: `req_${messageId}`, message: { id: messageId, role: 'assistant', type: 'message', content: [{ type: 'text', text }] } }),
    thinking: (messageId: string) =>
      base({ type: 'assistant', message: { id: messageId, role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }] } }),
    /** A tool's result: the text the model got, and the structured result, when Claude Code kept one. */
    result: (id: string, promptId: string, content: unknown, toolUseResult?: unknown, extra: Entry = {}) =>
      base({
        type: 'user', promptId, message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content, ...(extra.is_error ? { is_error: true } : {}) }] },
        ...(toolUseResult === undefined ? {} : { toolUseResult }), sourceToolAssistantUUID: parent,
        ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'is_error')),
      }),
    attachment: (attachment: Entry) => base({ type: 'attachment', attachment }),
    system: (subtype: string, extra: Entry = {}) => base({ type: 'system', subtype, level: 'info', ...extra }),
    compactSummary: (text: string, promptId: string) =>
      base({ type: 'user', promptId, isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: text } }),
    raw: (extra: Entry) => base(extra),
  };
}

export const jsonl = (entries: Array<Entry | string>) => `${entries.map(e => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')}\n`;

export const SESSION = '5b1d2c3e-0a4f-4e6b-9c8d-7e6f5a4b3c2d';
export const SUBAGENT = 'a5e1b2c3d4f5a6b7c';

/**
 * A session with everything import reads:
 * p1 asks to set up the zeta CLI and names its docs page → WebFetch of the page (it holds an
 * install command) → a parallel batch: a Read (whose result holds a token) and a failed Bash →
 * the install command → a subagent that greps for the token's name → a compaction →
 * p2 → a Write → a denied Bash.
 */
export function setupSession(cwd: string, start: number): { main: Entry[]; subagent: Entry[]; meta: Entry } {
  const w = writer(SESSION, cwd, start);
  // The main thread's 12th entry (at +12 s) calls the subagent and its 13th (+13 s) holds the
  // result, so the subagent's own entries run in between.
  const s = writer(SESSION, cwd, start + 12_000, SUBAGENT, 100);
  const page = 'Zeta CLI\nTo install, run: curl -fsSL https://get.zeta.example/install.sh | sh\nThen export ZETA_TOKEN.';
  const main = [
    { type: 'queue-operation', operation: 'enqueue', timestamp: new Date(start).toISOString(), sessionId: SESSION, content: 'Set up the zeta CLI' },
    w.prompt('Set up the zeta CLI for this project. The docs are at https://docs.zeta.example/start', 'p-0001'),
    w.attachment({ type: 'instructions', files: [{ path: `${cwd}/CLAUDE.md`, type: 'Project', content: '# Notes\n\nUse pnpm here.' }] }),
    w.calls('msg_1', ['toolu_01WebFetch0000000000001', 'WebFetch', { url: 'https://docs.zeta.example/start', prompt: 'How do I install it?' }]),
    w.result('toolu_01WebFetch0000000000001', 'p-0001', page, { bytes: 120, code: 200, codeText: 'OK', result: page, durationMs: 80, url: 'https://docs.zeta.example/start' }),
    w.thinking('msg_2'),
    w.calls('msg_2', ['toolu_01ReadPkg00000000000002', 'Read', { file_path: `${cwd}/package.json` }]),
    w.calls('msg_2', ['toolu_01CatConf00000000000003', 'Bash', { command: 'cat .zeta/config', description: 'Show zeta config' }]),
    w.result('toolu_01CatConf00000000000003', 'p-0001', 'Exit code 1\ncat: .zeta/config: No such file or directory', 'Error: Exit code 1\ncat: .zeta/config: No such file or directory', { is_error: true }),
    w.result('toolu_01ReadPkg00000000000002', 'p-0001', `1\t{ "name": "app", "zetaToken": "${FAKE_TOKEN}" }\n`, {
      type: 'text', file: { filePath: `${cwd}/package.json`, content: `{ "name": "app", "zetaToken": "${FAKE_TOKEN}" }\n`, numLines: 1, startLine: 1, totalLines: 1 },
    }),
    w.calls('msg_3', ['toolu_01Install0000000000004', 'Bash', { command: 'curl -fsSL https://get.zeta.example/install.sh | sh', description: 'Install zeta' }]),
    w.result('toolu_01Install0000000000004', 'p-0001', 'installed zeta 1.2.0', { stdout: 'installed zeta 1.2.0', stderr: '', interrupted: false, isImage: false, noOutputExpected: false }),
    w.calls('msg_4', ['toolu_01Agent000000000000005', 'Agent', { description: 'Find the token', prompt: 'Find where ZETA_TOKEN is read under src/', subagent_type: 'Explore' }]),
    w.result('toolu_01Agent000000000000005', 'p-0001', [{ type: 'text', text: 'ZETA_TOKEN is read in src/env.ts' }], {
      status: 'completed', prompt: 'Find where ZETA_TOKEN is read under src/', agentId: SUBAGENT, agentType: 'Explore', content: [{ type: 'text', text: 'ZETA_TOKEN is read in src/env.ts' }],
    }),
    w.text('msg_5', 'Installed zeta; the token is read in src/env.ts.'),
    { type: 'last-prompt', lastPrompt: 'Set up the zeta CLI', sessionId: SESSION },
    w.system('compact_boundary', { content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 1000 } }),
    w.compactSummary('Summary: zeta was installed from get.zeta.example; ZETA_TOKEN is read in src/env.ts.', 'p-0002'),
    w.prompt('Now write a token loader in src/token.ts', 'p-0002'),
    w.calls('msg_6', ['toolu_01Write000000000000006', 'Write', { file_path: `${cwd}/src/token.ts`, content: 'export const load = () => process.env.ZETA_TOKEN;\n' }]),
    w.result('toolu_01Write000000000000006', 'p-0002', `File created successfully at: ${cwd}/src/token.ts`, {
      type: 'create', filePath: `${cwd}/src/token.ts`, content: 'export const load = () => process.env.ZETA_TOKEN;\n', structuredPatch: [], originalFile: null,
    }),
    w.calls('msg_7', ['toolu_01Denied00000000000007', 'Bash', { command: 'rm -rf build', description: 'Clean' }]),
    w.result('toolu_01Denied00000000000007', 'p-0002', "The user doesn't want to proceed with this tool use.", undefined, { is_error: true, toolDenialKind: 'user-rejected' }),
    w.text('msg_8', 'Wrote src/token.ts.'),
    { type: 'cost-state', sessionId: SESSION, totalCostUSD: 0.1 },
  ];
  const subagent = [
    s.prompt('Find where ZETA_TOKEN is read under src/', 'p-0001', { turnOrigin: undefined, origin: undefined }),
    s.attachment({ type: 'instructions', files: [{ path: `${cwd}/CLAUDE.md`, type: 'Project', content: '# Notes\n\nUse pnpm here.' }] }),
    s.calls('msg_s1', ['toolu_01SubGrep0000000000008', 'Grep', { pattern: 'ZETA_TOKEN', path: `${cwd}/src` }]),
    s.result('toolu_01SubGrep0000000000008', 'p-0001', 'src/env.ts:3:const token = process.env.ZETA_TOKEN;'),
    s.text('msg_s2', 'ZETA_TOKEN is read in src/env.ts'),
  ];
  const meta = { agentType: 'Explore', description: 'Find the token', toolUseId: 'toolu_01Agent000000000000005', spawnDepth: 1 };
  return { main, subagent, meta };
}

/**
 * Writes a session the way Claude Code lays it out: <projects>/<folder>/<id>.jsonl, and each
 * subagent under <id>/subagents/. The files are dated `mtime` (ms).
 */
export function writeSession(projects: string, folder: string, sessionId: string, main: Array<Entry | string>, mtime: number, subagents: Array<{ id: string; entries: Entry[]; meta: Entry }> = []): string {
  const dir = join(projects, folder);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${sessionId}.jsonl`);
  writeFileSync(file, jsonl(main));
  utimesSync(file, mtime / 1000, mtime / 1000);
  for (const sub of subagents) {
    const subDir = join(dir, sessionId, 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, `agent-${sub.id}.jsonl`), jsonl(sub.entries));
    writeFileSync(join(subDir, `agent-${sub.id}.meta.json`), JSON.stringify(sub.meta));
  }
  return file;
}

/** How Claude Code names a project folder: the working directory with every other character a dash. */
export const folderOf = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-');
