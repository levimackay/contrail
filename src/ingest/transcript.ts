import { createHash } from 'node:crypto';
import { closeSync, constants, createReadStream, fstatSync, openSync } from 'node:fs';
import { arr, field, obj, str } from '../util.ts';
import { touchesOf, type Touch } from './ingest.ts';

/**
 * Claude Code's own session transcript (~/.claude/projects/<project>/<session>.jsonl, and
 * <session>/subagents/agent-<id>.jsonl for each subagent), turned back into the hook events
 * Contrail records live. Only what an entry states is used, so a reconstructed session has
 * fewer links than a recorded one, never different ones:
 *
 *   user prompt (not isMeta, from you)        → UserPromptSubmit, prompt_id = the entry's promptId
 *   "/name args" prompt (<command-name>)      → UserPromptSubmit of the typed command + UserPromptExpansion
 *   <task-notification> prompt or queued one  → UserPromptSubmit (the graph labels it a task report)
 *   assistant tool_use block                  → PreToolUse
 *   tool_result block                         → PostToolUse (tool_response = the entry's toolUseResult,
 *                                                or the text the model got) or PostToolUseFailure
 *   the results of one assistant message      → PostToolBatch, with the exact text the model received
 *   isCompactSummary entry                    → PostCompact
 *   "instructions" attachment                 → InstructionsLoaded, with the text the transcript holds
 *   a subagent's transcript                   → SubagentStart, its calls under its agent_id, SubagentStop
 *   the last text of a turn                   → Stop (shown as "agent said", never evidence)
 *
 * A call's turn comes only from its result entry's promptId, joined to the call by tool_use_id.
 * A call with no result entry keeps no turn rather than being given the nearest one by position.
 */

/** A line longer than this is skipped and counted, so one huge entry cannot exhaust memory. */
export const MAX_LINE = 32 * 1024 * 1024;

/** One reconstructed hook event, its payload already in stored form. */
export interface TranscriptEvent {
  /** Stable across re-imports of a growing transcript: the spool name is built from it. */
  key: string;
  hook: string;
  us: number;
  promptId: string | null;
  agentId: string | null;
  toolName: string | null;
  toolUseId: string | null;
  cwd: string | null;
  payload: Record<string, unknown>;
  touches: Touch[];
}

export interface TranscriptStats {
  /** entries read */
  entries: number;
  /** lines that are not a JSON object, or longer than MAX_LINE */
  malformed: number;
  /** entries of a type this version does not know; ignored */
  unknown: number;
  /** entries deliberately left out: another session's, another agent's message, a result with no call */
  skipped: number;
}

/** Redacts, caps and (for store_content: false) hashes a payload, as ingest stores it. */
export type Store = (payload: Record<string, unknown>, hook: string) => Record<string, unknown>;

/** Entry types that hold nothing Contrail records: queue bookkeeping, titles, costs, UI state. */
const IGNORED = new Set(['queue-operation', 'atis-latch', 'last-prompt', 'cost-state', 'mode', 'summary', 'custom-title', 'ai-title', 'tag', 'agent-name', 'file-history-snapshot', 'pr-link', 'progress']);
/** Who a prompt came from. Anything else (another agent's message, Claude Code's own) is not your words. */
const YOURS = new Set(['human', 'sdk']);
const TASK = /^\s{0,64}<task-notification>/;
const LOCAL = /^\s{0,64}<(?:bash-input|bash-stdout|bash-stderr|local-command-stdout|local-command-stderr|local-command-caveat)>/;
const CAVEAT = /^\s{0,64}<local-command-caveat>/;
const INTERRUPTED = /^\[Request interrupted by user/;
const COMMAND_NAME = /<command-name>\s{0,8}\/?([^<\s]{1,200})\s{0,8}<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]{0,20000}?)<\/command-args>/;
const SKILL_DIR = /^Base directory for this skill: ([^\n]{1,4096})\n/;

/** One transcript file: the main thread of a session, or one subagent. Feed it lines, then end(). */
export class TranscriptStream {
  readonly events: TranscriptEvent[] = [];
  readonly stats: TranscriptStats = { entries: 0, malformed: 0, unknown: 0, skipped: 0 };

  private lastUs = 0;
  private cwd: string | null = null;
  private turn: string | null = null;
  private lastPromptId: string | null = null;
  private said: { text: string; key: string } | null = null;
  private readonly calls = new Map<string, { name: string; input: Record<string, unknown>; pre: TranscriptEvent }>();
  private readonly seenCalls = new Set<string>();
  private batch: { message: string | null; key: string | null; results: Array<Record<string, unknown>> } = { message: null, key: null, results: [] };
  private compactTrigger: string | null = null;
  private readonly instructionsSeen = new Set<string>();
  private readonly localCommands = new Set<string>();
  private readonly skillPosts = new Map<string, TranscriptEvent>();
  private started = false;

  private readonly sessionId: string;
  private readonly agentId: string | null;
  private readonly agentType: string | null;
  private readonly store: Store;

  /** agentId: null for the main thread. store: how payloads are kept (as they are, unless given). */
  constructor(sessionId: string, agentId: string | null = null, agentType: string | null = null, store: Store = p => p) {
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.agentType = agentType;
    this.store = store;
  }

  /** One line of the file; null for a line that was too long to read. */
  line(text: string | null): void {
    if (text === null) {
      this.stats.malformed++;
      return;
    }
    if (!text.trim()) return;
    let e: unknown;
    try {
      e = JSON.parse(text);
    } catch {
      this.stats.malformed++;
      return;
    }
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      this.stats.malformed++;
      return;
    }
    this.entry(e as Record<string, unknown>);
  }

  /** One parsed entry. An entry of an odd shape is counted and skipped, never thrown. */
  entry(e: Record<string, unknown>): void {
    this.stats.entries++;
    try {
      this.handle(e);
    } catch {
      this.stats.malformed++;
    }
  }

  end(): void {
    this.flush();
    if (!this.agentId) {
      this.stop();
      return;
    }
    if (!this.started) return;
    this.emit('SubagentStop', this.tick(), 'subagent-stop', {
      agent_id: this.agentId,
      ...(this.agentType ? { agent_type: this.agentType } : {}),
      last_assistant_message: this.said?.text ?? '',
    }, { promptId: this.lastPromptId });
  }

  private handle(e: Record<string, unknown>): void {
    const type = str(e, 'type');
    const sessionId = str(e, 'sessionId');
    if (sessionId && sessionId !== this.sessionId) {
      // Copied from another session (a fork or a resume): that session's own file has it.
      this.stats.skipped++;
      return;
    }
    // Older transcripts kept subagent turns inline, with no agent id to scope them by.
    if (!this.agentId && e.isSidechain === true) {
      this.stats.skipped++;
      return;
    }
    const cwd = str(e, 'cwd');
    if (cwd) this.cwd = cwd;
    const promptId = str(e, 'promptId');
    if (promptId) this.lastPromptId = promptId;

    if (this.agentId && !this.started && (type === 'user' || type === 'assistant' || type === 'attachment')) {
      this.started = true;
      this.emit('SubagentStart', this.at(e), 'subagent-start', { agent_id: this.agentId, ...(this.agentType ? { agent_type: this.agentType } : {}) }, { promptId: promptId ?? null });
    }

    switch (type) {
      case 'user':
        return this.user(e);
      case 'assistant':
        return this.assistant(e);
      case 'attachment':
        return this.attachment(e);
      case 'system':
        if (str(e, 'subtype') === 'compact_boundary') this.compactTrigger = str(obj(e, 'compactMetadata'), 'trigger') ?? null;
        return;
      default:
        if (!type || !IGNORED.has(type)) this.stats.unknown++;
    }
  }

  private user(e: Record<string, unknown>): void {
    const content = field(obj(e, 'message'), 'content');
    const promptId = str(e, 'promptId') ?? null;

    if (e.isCompactSummary === true) {
      this.flush();
      this.emit('PostCompact', this.at(e), this.key(e, 'compact'), {
        compact_summary: textOf(content),
        ...(this.compactTrigger ? { trigger: this.compactTrigger } : {}),
      }, { promptId });
      this.compactTrigger = null;
      // What loads after a compaction is new context again.
      this.instructionsSeen.clear();
      return;
    }

    const results = arr(content).filter(b => str(b, 'type') === 'tool_result');
    if (results.length) {
      results.forEach((block, i) => this.result(e, block, i, results.length));
      return;
    }

    const text = textOf(content);
    if (e.isMeta === true) {
      this.meta(e, text, promptId);
      return;
    }
    // A subagent's own first message is its parent's instructions, which the Agent call records.
    if (this.agentId) return;
    this.prompt(e, text, promptId);
  }

  /** Text Claude Code added itself: never your words. A skill's body is kept on its Skill call. */
  private meta(e: Record<string, unknown>, text: string, promptId: string | null): void {
    if (promptId && CAVEAT.test(text)) this.localCommands.add(promptId);
    const source = str(e, 'sourceToolUseID');
    const post = source ? this.skillPosts.get(source) : undefined;
    if (!post) return;
    const name = str(obj(post.payload, 'tool_input'), 'skill') ?? '';
    const dir = SKILL_DIR.exec(text);
    // Plugin skills (plugin:name) are left unread, as the live hooks leave them.
    if (!dir || !name || name.includes(':')) return;
    const body = text.slice(dir[0].length).replace(/^\n/, '');
    const path = `${dir[1]!.trim()}/SKILL.md`;
    // Stored as a skill file read at ingest is: redacted, and hashed under store_content: false.
    const extra = this.store({ _contrail: { text: body, sha256: sha256(body), path } }, 'InstructionsLoaded');
    post.payload._contrail = extra._contrail;
    this.skillPosts.delete(source!);
  }

  private prompt(e: Record<string, unknown>, text: string, promptId: string | null): void {
    if (!text.trim() || LOCAL.test(text)) return;
    const task = TASK.test(text);
    const origin = str(obj(e, 'origin'), 'kind') ?? str(e, 'turnOrigin');
    if (!task && origin && !YOURS.has(origin)) {
      this.stats.skipped++;
      return;
    }
    const command = task ? null : COMMAND_NAME.exec(text);
    // A local command such as /compact never reaches the model.
    if (command && promptId && this.localCommands.has(promptId)) return;

    this.flush();
    this.stop();
    const id = promptId ?? `transcript-${str(e, 'uuid') ?? this.stats.entries}`;
    this.turn = id;
    this.said = null;
    if (command) {
      const name = command[1]!.replace(/^\//, '');
      const args = (COMMAND_ARGS.exec(text)?.[1] ?? '').trim();
      this.emit('UserPromptSubmit', this.at(e), this.key(e, 'prompt'), { prompt: `/${name}${args ? ` ${args}` : ''}` }, { promptId: id });
      // The body the command expanded to is not taken from the transcript, as the hooks do not see it.
      this.emit('UserPromptExpansion', this.at(e), this.key(e, 'expansion'), { command_name: name, command_args: args }, { promptId: id });
      return;
    }
    this.emit('UserPromptSubmit', this.at(e), this.key(e, 'prompt'), { prompt: text }, { promptId: id });
  }

  private result(e: Record<string, unknown>, block: unknown, index: number, count: number): void {
    const id = str(block, 'tool_use_id');
    const call = id ? this.calls.get(id) : undefined;
    if (!id || !call) {
      this.stats.skipped++;
      return;
    }
    this.calls.delete(id);
    // The result entry carries its turn's promptId, and tool_use_id pairs it with the call: both recorded.
    const promptId = str(e, 'promptId') ?? null;
    if (promptId) {
      call.pre.promptId = promptId;
      call.pre.payload.prompt_id = promptId;
    }
    // A denied call never ran: no result, but the transcript says who denied it, and why.
    const denial = str(e, 'toolDenialKind');
    if (denial) {
      const reason = textOf(field(block, 'content'));
      this.emit('PermissionDenied', this.at(e), this.key(e, `denied-${index}`), { tool_name: call.name, tool_input: call.input, tool_use_id: id, reason, denial_kind: denial }, { promptId, toolName: call.name, toolUseId: id });
      return;
    }

    const content = field(block, 'content');
    const text = textOf(content);
    const interrupted = INTERRUPTED.test(text);
    const base = { tool_name: call.name, tool_input: call.input, tool_use_id: id };
    const ids = { promptId, toolName: call.name, toolUseId: id };
    const key = this.key(e, `result-${index}`);
    if (field(block, 'is_error') === true || interrupted) {
      this.emit('PostToolUseFailure', this.at(e), key, { ...base, error: text, is_interrupt: interrupted }, ids);
    } else {
      // toolUseResult is the tool's structured result, the hook's tool_response. An entry holding
      // several results does not say which one it belongs to, so then only the text is used.
      const structured = count === 1 ? e.toolUseResult : undefined;
      const post = this.emit('PostToolUse', this.at(e), key, { ...base, tool_response: structured ?? content }, ids);
      if (call.name === 'Skill') this.skillPosts.set(id, post);
    }
    this.batch.key ??= key;
    this.batch.results.push({ tool_use_id: id, tool_name: call.name, tool_input: call.input, tool_response: content ?? '' });
  }

  private assistant(e: Record<string, unknown>): void {
    const message = obj(e, 'message');
    const messageId = str(message, 'id') ?? str(e, 'requestId') ?? str(e, 'uuid') ?? null;
    // The model reads a batch's results in its next message, so a new message closes the batch.
    if (this.batch.results.length && messageId !== this.batch.message) this.flush();
    this.batch.message = messageId;

    const content = field(message, 'content');
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : arr(content);
    blocks.forEach((b, i) => {
      const type = str(b, 'type');
      if (type === 'text') {
        const text = str(b, 'text');
        if (text?.trim()) this.said = { text, key: this.key(e, `text-${i}`) };
        return;
      }
      if (type !== 'tool_use') return;
      const id = str(b, 'id');
      const name = str(b, 'name');
      if (!id || !name) {
        this.stats.skipped++;
        return;
      }
      if (this.seenCalls.has(id)) return;
      this.seenCalls.add(id);
      const input = obj(b, 'input') ?? {};
      const pre = this.emit('PreToolUse', this.at(e), this.key(e, `call-${i}`), { tool_name: name, tool_input: input, tool_use_id: id }, { toolName: name, toolUseId: id });
      this.calls.set(id, { name, input, pre });
    });
  }

  private attachment(e: Record<string, unknown>): void {
    const a = obj(e, 'attachment');
    const type = str(a, 'type');
    if (type === 'instructions') {
      arr(field(a, 'files')).forEach((f, i) => {
        const path = str(f, 'path');
        const text = str(f, 'content');
        if (!path || text === undefined) return;
        const seen = `${path}\0${sha256(text)}`;
        if (this.instructionsSeen.has(seen)) return;
        this.instructionsSeen.add(seen);
        this.emit('InstructionsLoaded', this.at(e), this.key(e, `instructions-${i}`), {
          file_path: path,
          memory_type: str(f, 'type') ?? '',
          // The text as the transcript holds it: what the agent was given, not the file as it is now.
          _contrail: { text, sha256: sha256(text), fromTranscript: true },
        }, {});
      });
      return;
    }
    if (type === 'queued_command' && !this.agentId && a?.isMeta !== true) {
      // A prompt that waited while the agent worked, delivered in the middle of a turn.
      const text = textOf(field(a, 'prompt'));
      if (!text.trim()) return;
      const origin = str(obj(a, 'origin'), 'kind');
      if (!TASK.test(text) && (str(a, 'commandMode') !== 'prompt' || (origin && !YOURS.has(origin)))) {
        this.stats.skipped++;
        return;
      }
      this.emit('UserPromptSubmit', this.at(e), this.key(e, 'queued'), { prompt: text }, { promptId: `queued-${str(e, 'uuid') ?? this.stats.entries}` });
    }
  }

  /** Closes the current batch: the results the model received together, in one PostToolBatch. */
  private flush(): void {
    if (!this.batch.results.length) return;
    this.emit('PostToolBatch', this.tick(), `${this.batch.key}/batch`, { tool_calls: this.batch.results }, { promptId: this.lastPromptId });
    this.batch = { message: this.batch.message, key: null, results: [] };
  }

  /** The end of a turn: the agent's last words in it, for display only. */
  private stop(): void {
    if (this.agentId || !this.turn || !this.said) return;
    this.emit('Stop', this.tick(), `${this.said.key}/stop`, { last_assistant_message: this.said.text }, { promptId: this.turn });
    this.said = null;
  }

  private emit(
    hook: string,
    us: number,
    key: string,
    body: Record<string, unknown>,
    ids: { promptId?: string | null; toolName?: string | null; toolUseId?: string | null },
  ): TranscriptEvent {
    const raw: Record<string, unknown> = {
      hook_event_name: hook,
      session_id: this.sessionId,
      ...(this.cwd ? { cwd: this.cwd } : {}),
      ...(ids.promptId ? { prompt_id: ids.promptId } : {}),
      ...(this.agentId ? { agent_id: this.agentId } : {}),
      ...body,
    };
    const event: TranscriptEvent = {
      key: `${this.agentId ?? 'main'}/${key}`,
      hook,
      us,
      promptId: ids.promptId ?? null,
      agentId: this.agentId,
      toolName: ids.toolName ?? null,
      toolUseId: ids.toolUseId ?? null,
      cwd: this.cwd,
      touches: hook === 'PostToolUse' ? touchesOf(raw, this.cwd ?? '') : [],
      // Stored form at once, so a long transcript is never held in memory unredacted.
      payload: this.store(raw, hook),
    };
    this.events.push(event);
    return event;
  }

  /** The entry's time in microseconds, kept strictly increasing so file order is event order. */
  private at(e: Record<string, unknown>): number {
    const ms = Date.parse(str(e, 'timestamp') ?? '');
    this.lastUs = Math.max(Number.isFinite(ms) ? ms * 1000 : 0, this.lastUs + 1);
    return this.lastUs;
  }

  private tick(): number {
    return ++this.lastUs;
  }

  private key(e: Record<string, unknown>, what: string): string {
    return `${str(e, 'uuid') ?? `line-${this.stats.entries}`}/${what}`;
  }
}

/** A message's content as the text it holds: a string, or its text blocks joined. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return arr(content)
    .map(b => (str(b, 'type') === 'text' ? (str(b, 'text') ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * The lines of a file, streamed: memory stays within one line. A line longer than `max` is
 * yielded as null (and its text dropped) instead.
 */
export async function* readLines(file: string, max = MAX_LINE): AsyncGenerator<string | null> {
  const fd = openRegular(file);
  let buf = '';
  let skipping = false;
  for await (const chunk of createReadStream('', { fd, encoding: 'utf8', highWaterMark: 1 << 16 }) as AsyncIterable<string>) {
    let start = 0;
    for (;;) {
      const nl = chunk.indexOf('\n', start);
      if (nl < 0) {
        if (!skipping) {
          buf += chunk.slice(start);
          if (buf.length > max) {
            buf = '';
            skipping = true;
          }
        }
        break;
      }
      if (skipping) {
        skipping = false;
        yield null;
      } else {
        yield buf + chunk.slice(start, nl);
      }
      buf = '';
      start = nl + 1;
    }
  }
  if (skipping) yield null;
  else if (buf) yield buf;
}

/**
 * Opens a file for reading only if it is a regular file: not through a symlink, and never a FIFO,
 * which would block the reader. Checked on the open descriptor, so nothing swapped in between counts.
 */
export function openRegular(file: string): number {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  if (!fstatSync(fd).isFile()) {
    closeSync(fd);
    throw new Error(`${file} is not a regular file`);
  }
  return fd;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
