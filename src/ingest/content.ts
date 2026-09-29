import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashText } from '../engine/hashed.ts';

/**
 * store_content: false. Hashes the text the agent read before it is stored: tool results,
 * instruction and skill files, compaction summaries and background task reports, and drops
 * the agent's own messages and edit patches. Your prompts and each action's arguments stay,
 * because they are what a report explains. Runs after redaction.
 */

/** tool_response fields that are structure, not content: paths, ids, status flags. */
const STRUCTURE = new Set(['filePath', 'agentId', 'status', 'isAsync', 'success', 'commandName', 'code', 'url', 'interrupted', 'isImage', 'noOutputExpected', 'type', 'bashEditDiff', 'resolvedModel', 'description']);
/** git's own "[branch sha] subject" line: kept so a commit still joins to the command that made it. */
const COMMIT_LINE = /^\[[^\]\n]{1,200}\] [^\n]{0,300}$/m;
const TASK_HEAD = /^\s*<task-notification>[\s\S]{0,4000}?<\/summary>/;

export type Hmac = (span: string) => string;

/** The keyed hash for this data directory. The key is created once, 0600, and never leaves it. */
export function contentHmac(dataDir: string, create: boolean): Hmac | undefined {
  const path = join(dataDir, 'content.key');
  let key: Buffer;
  try {
    key = readFileSync(path);
  } catch {
    if (!create) return undefined;
    key = randomBytes(32);
    writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
    chmodSync(path, 0o600);
    key = readFileSync(path); // another ingest may have won the race; use what is on disk
  }
  return span => createHmac('sha256', key).update(span).digest('hex').slice(0, 12);
}

export function hashContent(p: Record<string, unknown>, hookEvent: string, hmac: Hmac): void {
  const hash = (s: string) => (s ? hashText(s, hmac) : s);
  const extra = p._contrail;
  if (extra && typeof extra === 'object' && typeof (extra as Record<string, unknown>).text === 'string') {
    const e = extra as Record<string, unknown>;
    e.text = hash(e.text as string);
    e.sha256 = null;
  }
  switch (hookEvent) {
    case 'UserPromptSubmit': {
      // A background task's report arrives as a prompt: keep the header that says so, hash the report.
      const prompt = typeof p.prompt === 'string' ? p.prompt : '';
      const head = TASK_HEAD.exec(prompt)?.[0];
      if (head) p.prompt = `${head}\n${hash(prompt.slice(head.length))}`;
      break;
    }
    case 'PostToolUse':
      p.tool_response = hashResponse(p.tool_response, hash);
      break;
    case 'PostToolUseFailure':
      if (typeof p.error === 'string') p.error = hash(p.error);
      break;
    case 'PostToolBatch':
      if (Array.isArray(p.tool_calls)) {
        p.tool_calls = p.tool_calls.map(c => (c && typeof c === 'object' ? { ...c, tool_response: hashResponse((c as Record<string, unknown>).tool_response, hash) } : c));
      }
      break;
    case 'PostCompact':
      if (typeof p.compact_summary === 'string') p.compact_summary = hash(p.compact_summary);
      break;
    case 'Stop':
    case 'SubagentStop':
      if (typeof p.last_assistant_message === 'string') p.last_assistant_message = '';
      break;
  }
}

function hashResponse(value: unknown, hash: (s: string) => string, key = ''): unknown {
  if (typeof value === 'string') {
    if (STRUCTURE.has(key)) return value;
    const commit = key === 'stdout' || key === '' ? COMMIT_LINE.exec(value)?.[0] : undefined;
    return commit ? `${commit}\n${hash(value)}` : hash(value);
  }
  if (key === 'bashEditDiff') return value;
  if (key === 'structuredPatch') return []; // the agent's edit, shown for display only
  if (Array.isArray(value)) return value.map(v => hashResponse(v, hash));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hashResponse(v, hash, k)]));
  }
  return value;
}
