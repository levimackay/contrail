import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { parse, type ParseEntry } from 'shell-quote';
import { arr, displayPath, hostPath, str, stringLeaves } from '../util.ts';
import { isShaped } from './text.ts';
import type { Action, Env, Token } from './types.ts';

/** Words too common to trace: shell programs and verbs, code keywords, tool names. */
const STOP = new Set([
  'bash', 'echo', 'printf', 'grep', 'head', 'tail', 'find', 'sort', 'uniq', 'xargs', 'true', 'false', 'test',
  'mkdir', 'touch', 'chmod', 'sudo', 'export', 'source', 'node', 'python', 'python3', 'deno',
  'npm', 'npx', 'pnpm', 'yarn', 'bunx', 'install', 'uninstall', 'run', 'build', 'start', 'exec', 'remove',
  'update', 'init', 'save', 'global', 'latest',
  'git', 'commit', 'push', 'pull', 'fetch', 'clone', 'status', 'diff', 'checkout', 'switch', 'branch', 'merge',
  'rebase', 'stash', 'origin', 'main', 'master', 'head',
  'const', 'function', 'return', 'import', 'export', 'from', 'default', 'class', 'async', 'await', 'null',
  'undefined', 'this', 'self', 'none', 'else', 'elif', 'while', 'with', 'type', 'interface', 'string', 'number',
  'boolean', 'object', 'void', 'public', 'private', 'static', 'true', 'false',
  'read', 'write', 'edit', 'multiedit', 'glob', 'webfetch', 'websearch', 'task', 'agent', 'skill', 'todowrite',
]);
const GENERIC_BASENAMES = new Set([
  'readme.md', 'readme', 'package.json', 'package-lock.json', 'tsconfig.json', 'makefile', 'dockerfile', 'go.mod',
  'go.sum', 'cargo.toml', 'cargo.lock', 'pyproject.toml', 'requirements.txt', '.gitignore', '.env', 'claude.md',
]);
const GENERIC_DIRS = new Set(['src', 'lib', 'app', 'test', 'tests', 'dist', 'build', 'docs', 'scripts', 'packages', 'utils', 'node_modules']);
const INSTALL_VERBS: Record<string, string[]> = {
  npm: ['install', 'i', 'add'], pnpm: ['install', 'i', 'add'], yarn: ['add'], bun: ['install', 'i', 'add'],
  pip: ['install'], pip3: ['install'], cargo: ['add'], go: ['get'], gem: ['install'], brew: ['install'], uv: ['add'],
};
const RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'uvx']);
const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'exec']);
const URL_RE = /https?:\/\/[^\s'"<>)\]]+/g;
const WORD_RE = /[A-Za-z0-9_@][A-Za-z0-9_\-./@:]*[A-Za-z0-9_]/g;
const MAX_HINTS = 20;
const MAX_TARGETS = 40;

/**
 * The strings in an action's arguments worth tracing, per tool:
 *   Edit / MultiEdit   the path; names the edit adds that were not there before
 *   Write              the path; names in the content
 *   Bash               installed package names; URL host+path; paths and name-like arguments
 *   WebFetch           the URL's host+path
 *   MCP                short string arguments; URLs
 *   Skill              the skill name
 *   anything else      paths and name-like strings in its arguments
 */
export function extractTokens(action: Action, env: Env): Token[] {
  const b = collector(env);
  const input = action.input;
  const tool = action.tool;

  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    b.path(str(input, 'file_path') ?? str(input, 'notebook_path') ?? '', 0, '$.file_path');
    if (tool === 'MultiEdit') {
      arr(input.edits).forEach((e, i) => b.newNames(str(e, 'old_string') ?? '', str(e, 'new_string') ?? '', `$.edits[${i}].new_string`));
    } else {
      b.newNames(str(input, 'old_string') ?? '', str(input, 'new_string') ?? str(input, 'new_source') ?? '', '$.new_string');
    }
  } else if (tool === 'Write') {
    b.path(str(input, 'file_path') ?? '', 0, '$.file_path');
    b.hints(str(input, 'content') ?? '', '$.content');
  } else if (tool === 'Bash') {
    bash(str(input, 'command') ?? '', b);
  } else if (tool === 'WebFetch') {
    const url = str(input, 'url');
    if (url) b.target(hostPath(url), 0, '$.url', true);
    b.hints(str(input, 'prompt') ?? '', '$.prompt');
  } else if (tool.startsWith('mcp__')) {
    for (const leaf of stringLeaves(input)) {
      if (/^https?:\/\//.test(leaf.value)) b.target(hostPath(leaf.value), 0, leaf.path, true);
      else if (leaf.value.length <= 64 && !/\s/.test(leaf.value)) b.target(leaf.value, 0, leaf.path);
      else b.hints(leaf.value, leaf.path);
    }
  } else if (tool === 'Skill') {
    const name = str(input, 'skill');
    if (name) b.target(name, 0, '$.skill', true);
  } else if (tool === 'Agent' || tool === 'Task') {
    b.hints(str(input, 'prompt') ?? '', '$.prompt');
  } else {
    for (const leaf of stringLeaves(input)) {
      if (looksLikePath(leaf.value)) b.path(leaf.value, 0, leaf.path);
      else b.hints(leaf.value, leaf.path);
    }
  }
  return b.tokens();
}

type Collector = ReturnType<typeof collector>;

function collector(env: Env) {
  const out: Token[] = [];
  const seen = new Set<string>();
  const noise = new Set(
    [...env.cwd.split('/'), ...env.home.split('/'), env.user].filter(Boolean).map(s => s.toLowerCase()),
  );
  let hintCount = 0;
  let targetCount = 0;

  const passes = (raw: string) => {
    const lower = raw.toLowerCase();
    return raw.length >= 4 && /[a-z]/i.test(raw) && !raw.startsWith('-') && !raw.startsWith('[REDACTED') && !STOP.has(lower) && !noise.has(lower);
  };
  const push = (text: string, role: Token['role'], group: number | null, argPath: string, derived = false): boolean => {
    const key = `${role}:${group}:${text.toLowerCase()}`;
    if (!text || seen.has(key)) return false;
    seen.add(key);
    out.push({ text, role, group, shaped: isShaped(text), derived, argPath });
    return true;
  };

  const api = {
    /** `exempt` skips the word filters, for values that are explicit on purpose (packages, URLs, skills). */
    target(text: string, group: number, argPath: string, exempt = false) {
      if (targetCount < MAX_TARGETS && (exempt ? text.length >= 2 : passes(text)) && push(text, 'target', group, argPath)) targetCount++;
    },
    hint(text: string, argPath: string) {
      if (hintCount < MAX_HINTS && passes(text) && isShaped(text) && push(text, 'hint', null, argPath)) hintCount++;
    },
    hints(text: string, argPath: string) {
      for (const w of words(text)) api.hint(w, argPath);
    },
    newNames(oldText: string, newText: string, argPath: string) {
      const old = new Set(words(oldText).map(w => w.toLowerCase()));
      for (const w of words(newText)) if (!old.has(w.toLowerCase())) api.hint(w, argPath);
    },
    path(p: string, group: number, argPath: string) {
      if (!p) return;
      const expanded = p === '~' || p.startsWith('~/') ? env.home + p.slice(1) : p;
      const abs = isAbsolute(expanded) ? expanded : resolve(env.cwd || '/', expanded);
      if (abs === env.cwd || abs === env.home || abs === '/') return;
      const rel = displayPath(abs, env.cwd, env.home);
      if (targetCount >= MAX_TARGETS) return;
      if (push(rel, 'target', group, argPath)) targetCount++;
      const base = basename(abs);
      if (!GENERIC_BASENAMES.has(base.toLowerCase())) {
        if (base !== rel && passes(base)) push(base, 'target', group, argPath);
        const stem = base.replace(/\.[^.]+$/, '');
        if (stem !== base && passes(stem)) push(stem, 'target', group, argPath, true);
      }
      for (const seg of dirname(rel).split('/')) {
        if (seg && seg !== '.' && seg !== '~' && !GENERIC_DIRS.has(seg.toLowerCase())) api.hint(seg, argPath);
      }
    },
    tokens: () => out,
  };
  return api;
}

function words(text: string): string[] {
  const found: string[] = [];
  const rest = text.replace(URL_RE, url => {
    found.push(hostPath(url));
    return ' ';
  });
  for (const m of rest.matchAll(WORD_RE)) found.push(m[0]);
  return found;
}

function looksLikePath(s: string): boolean {
  if (/\s/.test(s) || /^https?:\/\//.test(s) || s.includes('=')) return false;
  return /[a-z]/i.test(s) && (/^[.~/]/.test(s) || s.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(s));
}

function bash(command: string, b: Collector): void {
  let group = 0;
  for (const seg of segments(command)) {
    let argv = seg.words;
    while (argv.length && (WRAPPERS.has(basename(argv[0]!)) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]!))) argv = argv.slice(1);
    if (argv.length === 0) continue;
    const prog = basename(argv[0]!);
    const args = argv.slice(1);

    const packages = installArgs(prog, args);
    if (packages) {
      for (const p of packages) b.target(stripVersion(p), group++, '$.command', true);
      continue;
    }

    if (prog === 'git') {
      const sub = gitSubcommand(args);
      if (sub === 'commit' || sub === 'push') {
        b.target(sub, group++, '$.command', true);
        const message = commitMessage(args);
        if (message) b.hints(message, '$.command');
        continue;
      }
    }

    // Any other program: its URLs, paths and name-like arguments are alternatives for one target.
    const g = group++;
    for (const a of [...args, ...seg.redirects]) {
      if (/^https?:\/\//.test(a)) b.target(hostPath(a), g, '$.command', true);
      else if (/\s/.test(a)) b.hints(a, '$.command');
      else if (looksLikePath(a)) b.path(a, g, '$.command');
      else if (isShaped(a)) b.target(a, g, '$.command');
    }
  }
}

/** Splits a command on && || ; | & and unquoted newlines, skipping heredoc bodies; collects redirect targets. */
export function shellSegments(command: string): Array<{ words: string[]; redirects: string[] }> {
  return segments(command);
}

function segments(command: string): Array<{ words: string[]; redirects: string[] }> {
  const out: Array<{ words: string[]; redirects: string[] }> = [];
  for (const line of withoutHeredocs(logicalLines(command)).map(withoutFdNumbers)) {
    let entries: ParseEntry[];
    try {
      entries = parse(line, key => `$${key}`);
    } catch {
      entries = line.split(/\s+/).filter(Boolean);
    }
    let cur = { words: [] as string[], redirects: [] as string[] };
    let redirectNext: false | '>' | '>&' = false;
    for (const e of entries) {
      if (typeof e === 'string') {
        // >&2, >&1 and >&- duplicate or close a descriptor; only >&word names a file.
        if (redirectNext === '>&' && /^(\d{1,4}|-)$/.test(e)) {
          redirectNext = false;
          continue;
        }
        (redirectNext ? cur.redirects : cur.words).push(e);
        redirectNext = false;
        continue;
      }
      if ('comment' in e) break;
      if ('pattern' in e) {
        cur.words.push(e.pattern);
        continue;
      }
      if (e.op === '>' || e.op === '>>' || e.op === '>&') {
        redirectNext = e.op === '>&' ? '>&' : '>';
        continue;
      }
      if (e.op === '<') continue;
      if (cur.words.length || cur.redirects.length) out.push(cur);
      cur = { words: [], redirects: [] };
    }
    if (cur.words.length || cur.redirects.length) out.push(cur);
  }
  return out;
}

/** Newlines inside quotes and after a backslash don't end a command. */
function logicalLines(command: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"') {
        cur += ch + (command[++i] ?? '');
        continue;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '\\' && command[i + 1] === '\n') {
      i++;
      cur += ' ';
      continue;
    } else if (ch === '\n') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The descriptor number in `2>err.log` or `2>&1` belongs to the redirect, not the command,
 * but the parser splits it off as an argument. Drop it, outside quotes, where it starts a word.
 */
function withoutFdNumbers(line: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"') {
        out += ch + (line[++i] ?? '');
        continue;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '\\') {
      out += ch + (line[++i] ?? '');
      continue;
    } else if ((i === 0 || /\s/.test(line[i - 1]!)) && /^\d{1,4}[<>]/.test(line.slice(i, i + 5))) {
      while (/\d/.test(line[i]!)) i++;
      i--;
      continue;
    }
    out += ch;
  }
  return out;
}

/** A heredoc body is data fed to a command, not commands. */
function withoutHeredocs(lines: string[]): string[] {
  const out: string[] = [];
  let end: string | null = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(line);
    if (heredoc) end = heredoc[2]!;
  }
  return out;
}

function installArgs(prog: string, args: string[]): string[] | null {
  const plain = args.filter(a => !a.startsWith('-'));
  if (RUNNERS.has(prog)) return plain.slice(0, 1);
  if (prog === 'uv' && plain[0] === 'pip' && plain[1] === 'install') return plain.slice(2);
  const verbs = INSTALL_VERBS[prog];
  if (verbs && plain[0] && verbs.includes(plain[0])) return plain.slice(1);
  return null;
}

/** foo@^2 → foo, @scope/pkg@1 → @scope/pkg, pkg==1.2 → pkg */
function stripVersion(spec: string): string {
  if (spec.startsWith('@')) {
    const at = spec.indexOf('@', 1);
    return at === -1 ? spec : spec.slice(0, at);
  }
  return spec.split(/==|>=|<=|~=|!=|@|=|>|</)[0]!;
}

function gitSubcommand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-C' || a === '-c') {
      i++;
      continue;
    }
    if (!a.startsWith('-')) return a;
  }
  return undefined;
}

function commitMessage(args: string[]): string | undefined {
  const i = args.findIndex(a => a === '-m' || a === '--message');
  if (i >= 0) return args[i + 1];
  return args.find(a => a.startsWith('--message='))?.slice('--message='.length);
}
