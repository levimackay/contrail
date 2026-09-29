import type { EventRow } from '../../src/graph/build.ts';

/** A hook event before it gets a position in a session. */
export interface Draft {
  hook: string;
  payload: Record<string, unknown>;
  agentId?: string | null;
}

export const d = {
  instructions: (file_path: string, text: string, memory_type = 'Project', load_reason = 'session_start', extra: Record<string, unknown> = {}): Draft => ({
    hook: 'InstructionsLoaded',
    payload: { file_path, memory_type, load_reason, _contrail: { text }, ...extra },
  }),
  prompt: (prompt: string, prompt_id: string): Draft => ({ hook: 'UserPromptSubmit', payload: { prompt, prompt_id } }),
  pre: (id: string, tool_name: string, tool_input: Record<string, unknown>, extra: Record<string, unknown> = {}): Draft => ({
    hook: 'PreToolUse',
    payload: { tool_use_id: id, tool_name, tool_input, ...extra },
  }),
  post: (id: string, tool_name: string, tool_input: Record<string, unknown>, tool_response: unknown): Draft => ({
    hook: 'PostToolUse',
    payload: { tool_use_id: id, tool_name, tool_input, tool_response },
  }),
  batch: (...calls: Array<[id: string, tool_name: string, text: string]>): Draft => ({
    hook: 'PostToolBatch',
    payload: { tool_calls: calls.map(([tool_use_id, tool_name, tool_response]) => ({ tool_use_id, tool_name, tool_input: {}, tool_response })) },
  }),
  compact: (compact_summary: string): Draft => ({ hook: 'PostCompact', payload: { compact_summary } }),
  stop: (last_assistant_message: string): Draft => ({ hook: 'Stop', payload: { last_assistant_message } }),
};

/** PreToolUse + PostToolUse + PostToolBatch for one call made on its own. */
export function call(id: string, tool: string, input: Record<string, unknown>, text: string, response: unknown = text): Draft[] {
  return [d.pre(id, tool, input), d.post(id, tool, input, response), d.batch([id, tool, text])];
}

/** Gives drafts their order, ids and the prompt_id of the turn they happen in. */
export function session(drafts: Draft[], sessionId = 's1', cwd = '/r'): EventRow[] {
  let promptId: string | null = null;
  return drafts.map((draft, i) => {
    if (draft.hook === 'UserPromptSubmit' || draft.hook === 'UserPromptExpansion') promptId = draft.payload.prompt_id as string;
    const p = draft.payload;
    return {
      id: i + 1,
      spool_name: `${String(i + 1).padStart(6, '0')}.json`,
      captured_us: (i + 1) * 1000,
      session_id: sessionId,
      prompt_id: promptId,
      agent_id: draft.agentId ?? null,
      hook_event: draft.hook,
      tool_name: (p.tool_name as string | undefined) ?? null,
      tool_use_id: (p.tool_use_id as string | undefined) ?? null,
      cwd,
      payload: JSON.stringify({ hook_event_name: draft.hook, session_id: sessionId, prompt_id: promptId, cwd, agent_id: draft.agentId ?? undefined, ...p }),
      parse_error: null,
    };
  });
}

export const WHO = { home: '/Users/dev', user: 'dev' };

export const CLAUDE_MD = '# Notes\n\nOur API lives in api/.\nWhen auth breaks, check auth-service first.\n';

/** auth-service/README.md as the Read tool shows it to the model: numbered lines, the package on line 83. */
export const README_SEEN = [
  ...Array.from({ length: 82 }, (_, i) => `line ${i + 1} of the service docs`),
  'use foo-auth-helper for token refresh',
]
  .map((line, i) => `${String(i + 1).padStart(6)}\t${line}`)
  .join('\n');

/**
 * The motivating example:
 * you ask about auth → CLAUDE.md points at auth-service → its README names a package →
 * the agent installs it → package.json and the lockfile change.
 */
export function authSession(): EventRow[] {
  return session([
    d.instructions('/r/CLAUDE.md', CLAUDE_MD),
    d.prompt('Figure out why authentication is broken.', 'p1'),
    ...call('t2', 'Read', { file_path: '/r/auth-service/README.md' }, README_SEEN, { type: 'text', file: { filePath: '/r/auth-service/README.md' } }),
    d.pre('t3', 'mcp__docs__search', { query: 'token refresh' }, { mcp_server: { name: 'docs', source: 'project' } }),
    d.post('t3', 'mcp__docs__search', { query: 'token refresh' }, { content: [{ type: 'text', text: 'Refresh tokens rotate every 30 minutes.' }] }),
    d.batch(['t3', 'mcp__docs__search', 'Refresh tokens rotate every 30 minutes.']),
    ...call('t4', 'Bash', { command: 'npm install foo-auth-helper' }, 'added 3 packages', {
      stdout: 'added 3 packages',
      stderr: '',
      bashEditDiff: { changedFiles: ['/r/package.json', '/r/package-lock.json'] },
    }),
    d.stop('The README recommends foo-auth-helper for token refresh, so I installed it.'),
  ]);
}

/** prompt -> docs index -> build page -> file search -> README -> install: one hop past the limit. */
export function longTrail(): EventRow[] {
  return session([
    d.prompt('Fix the build. The docs index is https://docs.y.example/index', 'p1'),
    ...call('g0', 'WebFetch', { url: 'https://docs.y.example/index', prompt: 'build?' }, 'Build docs: https://docs.y.example/build'),
    ...call('g1', 'WebFetch', { url: 'https://docs.y.example/build', prompt: 'setup?' }, 'The builder lives in tools/buildkit.'),
    ...call('g2', 'Bash', { command: 'find tools/buildkit -name README.md' }, 'tools/buildkit/README.md'),
    ...call('g3', 'Read', { file_path: '/r/tools/buildkit/README.md' }, '     1\tinstall pinned-builder-9'),
    ...call('g4', 'Bash', { command: 'npm install pinned-builder-9' }, 'ok'),
  ]);
}
