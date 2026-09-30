import { scopeKey, sameScope } from '../engine/scope.ts';
import type { Action, Effect, Env, Graph, Input, Origin, Prompt, Scope, Trust } from '../engine/types.ts';
import { expectedShellEffects, parseCommitSha } from '../engine/effects.ts';
import { HASHED } from '../engine/hashed.ts';
import { shellSegments } from '../engine/tokens.ts';
import { arr, callId, changedFiles, clip, displayPath, field, hostPath, obj, str, toText } from '../util.ts';

/** One row of the events table. */
export interface EventRow {
  id: number;
  spool_name: string;
  captured_us: number;
  session_id: string | null;
  prompt_id: string | null;
  agent_id: string | null;
  hook_event: string;
  tool_name: string | null;
  tool_use_id: string | null;
  cwd: string | null;
  repo_key?: string | null;
  payload: string;
  parse_error: string | null;
  /** null for a hook event recorded live; 'transcript' for one `contrail import` reconstructed */
  source?: string | null;
  /** payload is read from the database the first time something reads it (loadRows) */
  payloadLater?: boolean;
}

const DEPENDENCY_DIR = /(^|\/)(node_modules|vendor|\.venv|venv|site-packages)(\/|$)/;
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const NO_OUTPUT_TOOLS = new Set([...WRITE_TOOLS, 'TodoWrite', 'ExitPlanMode']);

/**
 * Folds one session's events (ordered by capture) into the provenance graph.
 * seq is the event's position in that order; capture hooks are synchronous, so
 * the order respects what happened before what.
 */
export function buildGraph(rows: EventRow[], who: { home: string; user: string }, hashToken?: (span: string) => string): Graph {
  const cwd = rows.find(r => r.cwd)?.cwd ?? '';
  const env: Env = { cwd, home: who.home, user: who.user };
  const mainScope: Scope = { sessionId: rows[0]?.session_id ?? '', agentId: null };

  const actions = new Map<string, Action>();
  const inputs: Input[] = [];
  const prompts: Prompt[] = [];
  const compactSeqs: Record<string, number[]> = {};
  const agentSaid: Graph['agentSaid'] = { byPrompt: {}, byAgent: {} };
  const modelSaw = new Map<string, { seq: number; text: string }>();
  const expansions = new Map<string, { command: string; source: string }>();
  const subagentStarts = new Map<string, number>();
  const instructions: Array<{ seq: number; scope: Scope; p: Record<string, unknown>; promptId: string | null }> = [];
  const skillBodies = new Map<string, { text: string; path: string }>();
  const notifications: Array<{ seq: number; promptId: string; text: string; toolUseId: string | null; taskId: string | null }> = [];

  // What the model received for each call, first: whether a call's own result is needed while
  // building depends on it.
  rows.forEach((row, index) => {
    if (row.hook_event !== 'PostToolBatch') return;
    for (const call of arr(parsePayload(row.payload).tool_calls)) {
      const useId = str(call, 'tool_use_id');
      if (useId) modelSaw.set(useId, { seq: index + 1, text: toText(field(call, 'tool_response')) });
    }
  });

  rows.forEach((row, index) => {
    const seq = index + 1;
    const id = row.tool_use_id;
    const known = id ? actions.get(id) : undefined;
    const large = row.hook_event === 'PostToolUse' && (row.payloadLater || row.payload.length > DEFER_OVER);
    if (large && known && onlyTextUsed(known.tool) && modelSaw.get(known.id)?.text) {
      // A large result whose text the model's own copy already gives: only the JSON reports print
      // it, so it is read and parsed when first used, not for every query.
      known.postSeq = seq;
      known.status = 'ok';
      deferResponse(known, row);
      return;
    }
    if (row.hook_event === 'PostToolBatch') return; // read above
    const p = parsePayload(row.payload);
    const scope: Scope = { sessionId: row.session_id ?? '', agentId: row.agent_id };

    switch (row.hook_event) {
      case 'UserPromptSubmit': {
        const promptId = row.prompt_id ?? `seq-${seq}`;
        const text = str(p, 'prompt') ?? '';
        const task = taskNotification(text);
        if (task) {
          // Claude Code delivers a background task's report as a prompt. It is not your words.
          prompts.push({ promptId, seq, label: `p${prompts.length + 1}`, text: task.summary, from: 'task' });
          notifications.push({ seq, promptId, text, toolUseId: task.toolUseId, taskId: task.taskId });
        } else {
          prompts.push({ promptId, seq, label: `p${prompts.length + 1}`, text, from: 'you' });
        }
        break;
      }
      case 'UserPromptExpansion':
        if (row.prompt_id) {
          const command = `/${str(p, 'command_name') ?? ''} ${str(p, 'command_args') ?? ''}`.trim();
          expansions.set(row.prompt_id, { command, source: str(p, 'command_source') ?? '' });
        }
        break;
      case 'InstructionsLoaded':
        instructions.push({ seq, scope, p, promptId: row.prompt_id });
        break;
      case 'PreToolUse':
        if (id && !actions.has(id)) actions.set(id, newAction(id, scope, row, p, seq));
        break;
      case 'PermissionDenied': {
        // Auto mode refused the call: no PreToolUse fired, so this is the only record of the attempt.
        if (!id) break;
        const a = actions.get(id) ?? newAction(id, scope, row, p, seq);
        actions.set(id, a);
        a.postSeq = seq;
        a.status = 'denied';
        a.denial = str(p, 'reason') ?? '';
        break;
      }
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        if (!id) break;
        const a = actions.get(id) ?? newAction(id, scope, row, p, seq);
        actions.set(id, a);
        a.postSeq = seq;
        if (row.hook_event === 'PostToolUse') {
          a.status = 'ok';
          a.response = p.tool_response ?? null;
          const body = obj(p, '_contrail');
          const text = str(body, 'text');
          if (a.tool === 'Skill' && text) skillBodies.set(id, { text, path: str(body, 'path') ?? '' });
        } else {
          a.status = p.is_interrupt === true ? 'interrupted' : 'failed';
          a.response = { error: str(p, 'error') ?? '' };
        }
        break;
      }
      case 'PostCompact':
        (compactSeqs[scopeKey(scope)] ??= []).push(seq);
        inputs.push({
          id: `compact:${seq}`, scope, origin: 'compaction', trust: 'agent', ref: `compact:${seq}`,
          label: 'compaction summary', text: str(p, 'compact_summary') ?? '', truncated: false,
          fidelity: 'as-seen', availableAt: seq, producedBy: null, promptId: row.prompt_id,
        });
        break;
      case 'SubagentStart': {
        const agentId = str(p, 'agent_id');
        if (agentId) subagentStarts.set(agentId, seq);
        break;
      }
      case 'SubagentStop': {
        const agentId = str(p, 'agent_id');
        if (agentId) agentSaid.byAgent[agentId] = str(p, 'last_assistant_message') ?? '';
        break;
      }
      case 'Stop':
        if (row.prompt_id) agentSaid.byPrompt[row.prompt_id] = str(p, 'last_assistant_message') ?? '';
        break;
    }
  });

  for (const prompt of prompts) {
    if (prompt.from === 'task') continue;
    const expansion = expansions.get(prompt.promptId);
    // Claude Code 2.1.284 records the typed command as the prompt and the expanded body nowhere.
    // If a prompt ever does arrive expanded, keep that body as the template it is, not your words.
    const expanded = expansion && prompt.text.trim() !== expansion.command.trim();
    if (expansion) prompt.command = { text: expansion.command, bodyObserved: Boolean(expanded) };
    if (expansion && expanded) {
      inputs.push({
        id: `template:${prompt.promptId}`, scope: mainScope, origin: 'template', trust: templateTrust(expansion.source),
        ref: `template:${prompt.promptId}`, label: `${expansion.command.split(' ')[0]} template`, text: prompt.text,
        truncated: false, fidelity: 'as-seen', availableAt: prompt.seq, producedBy: null, promptId: prompt.promptId,
      });
      prompt.text = expansion.command;
    }
    inputs.push({
      id: `prompt:${prompt.promptId}`, scope: mainScope, origin: 'prompt', trust: 'principal', ref: `prompt:${prompt.promptId}`,
      label: `your prompt ${prompt.label}`, text: prompt.text, truncated: false, fidelity: 'as-seen',
      availableAt: prompt.seq, producedBy: null, promptId: prompt.promptId,
    });
  }

  const actionList = [...actions.values()].sort((a, b) => a.preSeq - b.preSeq);
  const effects: Effect[] = [];
  for (const a of actionList) {
    const output = outputInput(a, modelSaw.get(a.id), env);
    if (output) inputs.push(output);
    effects.push(...effectsOf(a, env));

    const body = skillBodies.get(a.id);
    if (body) {
      // Read at ingest: the tool result only says the skill launched.
      const name = str(a.input, 'skill') ?? '';
      const yours = Boolean(env.home) && body.path.startsWith(`${env.home}/.claude/`);
      inputs.push({
        // ref is the file, so a Read of the same SKILL.md is the same source, not a second one.
        id: `skillbody:${a.id}`, scope: a.scope, origin: 'skill', trust: yours ? 'config' : 'local', ref: displayPath(body.path, env.cwd, env.home),
        label: `skill ${name} (${displayPath(body.path, env.cwd, env.home)})`, text: body.text,
        truncated: body.text.includes('[contrail: truncated'), fidelity: 'read-at-ingest',
        availableAt: modelSaw.get(a.id)?.seq ?? a.postSeq ?? a.preSeq, producedBy: a.id, promptId: a.promptId,
      });
    }

    const agentId = (a.tool === 'Agent' || a.tool === 'Task') && a.status === 'ok' ? str(a.response, 'agentId') : undefined;
    if (agentId && output) output.relays = { sessionId: a.scope.sessionId, agentId };
    if (agentId) {
      // What the parent agent wrote to the subagent: the subagent's first input, and a conduit.
      inputs.push({
        id: `subprompt:${agentId}`, scope: { sessionId: a.scope.sessionId, agentId }, origin: 'subagent_prompt',
        trust: 'agent', ref: `subprompt:${agentId}`, label: `subagent instructions written in ${callId(a.id)}`,
        text: str(a.input, 'prompt') ?? '', truncated: false, fidelity: 'reported',
        availableAt: subagentStarts.get(agentId) ?? a.preSeq, producedBy: a.id, promptId: a.promptId,
      });
    }
  }

  for (const n of notifications) inputs.push(notificationInput(n, actionList, mainScope, env));

  for (const ins of instructions) {
    const path = str(ins.p, 'file_path') ?? '';
    const extra = obj(ins.p, '_contrail');
    const trigger = str(ins.p, 'trigger_file_path');
    // A nested CLAUDE.md loads when the agent reads a file under it: it is visible from that Read on.
    const read = trigger
      ? actionList.find(a => a.tool === 'Read' && str(a.input, 'file_path') === trigger && a.preSeq < ins.seq && sameScope(a.scope, ins.scope))
      : undefined;
    const readAt = read ? (modelSaw.get(read.id)?.seq ?? read.postSeq) : null;
    const shown = displayPath(path, cwd, who.home);
    inputs.push({
      id: `instr:${ins.seq}`, scope: ins.scope, origin: 'instructions',
      trust: str(ins.p, 'memory_type') === 'Project' ? 'local' : 'config', ref: shown,
      label: extra?.changedSinceLoad === true ? `${shown} (changed after it loaded; its text is not used)` : shown,
      text: str(extra, 'text') ?? '', truncated: (str(extra, 'text') ?? '').includes('[contrail: truncated'),
      fidelity: 'read-at-ingest', availableAt: readAt ?? ins.seq, producedBy: null, promptId: ins.promptId,
    });
  }

  for (const i of inputs) if (i.text.includes(HASHED)) i.hashed = true;
  inputs.sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));
  const fromTranscript = rows.filter(r => r.source === 'transcript').length;
  return {
    sessionId: mainScope.sessionId,
    actions: actionList,
    inputs,
    effects,
    prompts,
    compactSeqs,
    agentSaid,
    env,
    firstEvent: rows[0]?.hook_event ?? null,
    source: fromTranscript === 0 ? 'hooks' : fromTranscript === rows.length ? 'transcript' : 'both',
    timeUs: rows.map(r => r.captured_us),
    ...(hashToken ? { hashToken } : {}),
  };
}

/** Results the graph reads only as text (outputInput), with no effect or agent id taken from them. */
export const TEXT_RESULT_TOOLS: readonly string[] = ['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'];
const onlyTextUsed = (tool: string) => TEXT_RESULT_TOOLS.includes(tool) || tool.startsWith('mcp__');
/** Smaller results are parsed as they are read: deferring them saves nothing worth the indirection. */
const DEFER_OVER = 16 * 1024;

/**
 * Sets action.response to be parsed from the row's payload the first time it is read, to exactly
 * what the PostToolUse case would have set. It stays an enumerable own property in the same
 * place, so JSON output is unchanged.
 */
function deferResponse(a: Action, row: EventRow): void {
  const settle = (value: unknown) => {
    Object.defineProperty(a, 'response', { value, writable: true, enumerable: true, configurable: true });
    return value;
  };
  Object.defineProperty(a, 'response', {
    enumerable: true,
    configurable: true,
    get: () => settle(parsePayload(row.payload).tool_response ?? null),
    set: settle,
  });
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(payload);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function newAction(id: string, scope: Scope, row: EventRow, p: Record<string, unknown>, seq: number): Action {
  const mcp = obj(p, 'mcp_server');
  return {
    id,
    scope,
    promptId: row.prompt_id,
    // Tool names are identifiers; anything else in one is not printed as-is.
    tool: (row.tool_name ?? str(p, 'tool_name') ?? 'unknown').replace(/[^\w.:-]/g, '?').slice(0, 128),
    input: obj(p, 'tool_input') ?? {},
    response: null,
    preSeq: seq,
    postSeq: null,
    status: 'pending',
    mcpServer: mcp ? { name: str(mcp, 'name') ?? '', source: str(mcp, 'source') ?? '' } : null,
  };
}

const TASK_NOTIFICATION = /^\s*<task-notification>/;
const tag = (text: string, name: string) => new RegExp(`<${name}>([^<]{1,200})</${name}>`).exec(text)?.[1]?.trim() ?? null;

/** A <task-notification> prompt: the report of a background subagent or shell command. */
function taskNotification(text: string): { summary: string; toolUseId: string | null; taskId: string | null } | null {
  if (!TASK_NOTIFICATION.test(text)) return null;
  const head = text.slice(0, 4000);
  return {
    summary: tag(head, 'summary') ?? 'a background task finished',
    toolUseId: tag(head, 'tool-use-id'),
    taskId: tag(head, 'task-id'),
  };
}

/** The report as an input, labeled by the call that started the task: never yours. */
function notificationInput(
  n: { seq: number; promptId: string; text: string; toolUseId: string | null; taskId: string | null },
  actionList: Action[],
  mainScope: Scope,
  env: Env,
): Input {
  const started = actionList.find(a => a.id === n.toolUseId);
  const base = { id: `task:${n.seq}`, scope: mainScope, text: n.text, truncated: n.text.includes('[contrail: truncated'), fidelity: 'as-seen' as const, availableAt: n.seq, producedBy: started?.id ?? null, promptId: n.promptId };
  if (started && (started.tool === 'Agent' || started.tool === 'Task')) {
    const agentId = str(started.response, 'agentId') ?? n.taskId;
    return {
      ...base, origin: 'subagent_result', trust: 'agent', ref: `agent:${started.id}`, label: `background subagent report from ${callId(started.id)}`,
      relays: agentId ? { sessionId: started.scope.sessionId, agentId } : null,
    };
  }
  if (started) {
    const c = classify(started, env);
    return { ...base, ...c, label: `background ${c.label.replace(/^the /, '')}` };
  }
  return { ...base, origin: 'tool_output', trust: 'local', ref: `task:${n.taskId ?? n.seq}`, label: 'a background task report' };
}

function templateTrust(source: string): Trust {
  if (source === 'user') return 'config';
  if (source === 'project') return 'local';
  return 'external';
}

/** A tool's result as an input: preferably the exact text the model received (PostToolBatch). */
function outputInput(a: Action, saw: { seq: number; text: string } | undefined, env: Env): Input | null {
  if (NO_OUTPUT_TOOLS.has(a.tool) || a.postSeq === null) return null;
  const text = saw?.text || toText(a.response);
  return {
    id: `out:${a.id}`,
    scope: a.scope,
    ...classify(a, env),
    text,
    truncated: text.includes('[contrail: truncated'),
    fidelity: saw?.text ? 'as-seen' : 'reported',
    availableAt: saw?.seq ?? a.postSeq,
    producedBy: a.id,
    promptId: a.promptId,
  };
}

function classify(a: Action, env: Env): { origin: Origin; trust: Trust; ref: string; label: string } {
  const tool = a.tool;
  if (tool === 'Read' || tool === 'NotebookRead') {
    const path = str(a.input, 'file_path') ?? str(a.input, 'notebook_path') ?? '';
    const ref = displayPath(path, env.cwd, env.home);
    if (DEPENDENCY_DIR.test(path)) {
      return { origin: 'dependency_file', trust: 'external', ref, label: ref };
    }
    if (env.home && path.startsWith(`${env.home}/.claude/`)) return { origin: 'file', trust: 'config', ref, label: ref };
    return { origin: 'file', trust: 'local', ref, label: ref };
  }
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') {
    const what = str(a.input, 'pattern') ?? str(a.input, 'path') ?? '';
    return { origin: 'search', trust: 'local', ref: `search:${a.id}`, label: `the output of ${tool} ${JSON.stringify(what)}` };
  }
  if (tool === 'Bash') {
    const command = str(a.input, 'command') ?? '';
    const network = /^\s*(curl|wget|gh)\b|\bgit\s+(clone|fetch|pull)\b/.test(command);
    // cat, grep or cd into a dependency directory prints third-party text, as a Read of it would.
    const dependency = shellSegments(command).some(seg => [...seg.words, ...seg.redirects].some(w => DEPENDENCY_DIR.test(w)));
    return { origin: 'shell', trust: network || dependency ? 'external' : 'local', ref: `shell:${a.id}`, label: `the output of \`${clip(command, 50)}\`` };
  }
  if (tool === 'WebFetch') {
    const where = hostPath(str(a.input, 'url') ?? '');
    return { origin: 'web', trust: 'external', ref: where, label: `WebFetch of ${where}` };
  }
  if (tool === 'WebSearch') {
    return { origin: 'web_search', trust: 'external', ref: `search:${a.id}`, label: `WebSearch ${JSON.stringify(str(a.input, 'query') ?? '')}` };
  }
  if (tool.startsWith('mcp__')) {
    return { origin: 'mcp', trust: 'external', ref: `mcp:${a.id}`, label: `MCP ${tool.slice(5).replace('__', '/')} result` };
  }
  if (tool === 'Skill') {
    const name = str(a.input, 'skill') ?? '';
    return { origin: 'skill', trust: name.includes(':') ? 'external' : 'local', ref: `skill:${name}`, label: `skill ${name}` };
  }
  if (tool === 'Agent' || tool === 'Task') {
    return { origin: 'subagent_result', trust: 'agent', ref: `agent:${a.id}`, label: `subagent report from ${callId(a.id)}` };
  }
  return { origin: 'tool_output', trust: 'local', ref: `tool:${a.id}`, label: `${tool} output` };
}

function effectsOf(a: Action, env: Env): Effect[] {
  if (a.status !== 'ok') return [];
  const fx = (i: number, e: Omit<Effect, 'id' | 'actionId'>): Effect => ({ id: `fx:${a.id}:${i}`, actionId: a.id, ...e });

  if (WRITE_TOOLS.has(a.tool)) {
    const path = str(a.response, 'filePath') ?? str(a.input, 'file_path') ?? str(a.input, 'notebook_path');
    if (!path) return [];
    const hunk = arr(field(a.response, 'structuredPatch'))[0];
    const patch = arr(field(hunk, 'lines')).filter((l): l is string => typeof l === 'string').slice(0, 10);
    return [fx(0, { kind: 'file', target: displayPath(path, env.cwd, env.home), path, evidence: 'filePath', patch })];
  }
  if (a.tool === 'Bash') {
    const command = str(a.input, 'command') ?? '';
    const out: Effect[] = [];
    const commit = parseCommitSha(command, str(a.response, 'stdout') ?? toText(a.response));
    if (commit) {
      out.push(fx(out.length, { kind: 'commit', target: `${commit.sha} on ${commit.branch}`, path: null, evidence: 'commit_stdout', patch: [], commit }));
    }
    if (field(a.response, 'bashEditDiff') !== undefined) {
      // Claude Code reported what changed; an empty list means nothing did.
      for (const path of changedFiles(a.response, env.cwd)) {
        out.push(fx(out.length, { kind: 'file', target: displayPath(path, env.cwd, env.home), path, evidence: 'bashEditDiff', patch: [] }));
      }
    } else {
      for (const e of expectedShellEffects(command, env.cwd)) {
        const path = e.kind === 'file' ? e.target : null;
        const target = path ? displayPath(path, env.cwd, env.home) : e.target;
        out.push(fx(out.length, { kind: e.kind, target, path, evidence: 'expected', patch: [] }));
      }
    }
    return out;
  }
  if (a.tool === 'WebFetch') {
    return [fx(0, { kind: 'network', target: hostPath(str(a.input, 'url') ?? ''), path: null, evidence: 'response', patch: [] })];
  }
  if (a.tool.startsWith('mcp__')) {
    const server = a.mcpServer?.name ?? a.tool.split('__')[1] ?? a.tool;
    return [fx(0, { kind: 'network', target: `MCP server ${server}`, path: null, evidence: 'response', patch: [] })];
  }
  return [];
}
