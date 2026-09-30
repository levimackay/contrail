import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** Every string inside a JSON value, depth-first, with its JSONPath. */
export function stringLeaves(value: unknown, path = '$'): Array<{ path: string; value: string }> {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => stringLeaves(v, `${path}.${k}`));
  }
  return [];
}

/** A tool result as plain text: strings as they are, content blocks joined, anything else by its string leaves. */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(b => b && typeof b === 'object' && 'type' in b)) {
    return value.map(b => field(b, 'text')).filter((t): t is string => typeof t === 'string').join('\n');
  }
  return stringLeaves(value).map(l => l.value).join('\n');
}

export function field(o: unknown, key: string): unknown {
  return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>)[key] : undefined;
}

export function str(o: unknown, key: string): string | undefined {
  const v = field(o, key);
  return typeof v === 'string' ? v : undefined;
}

export function obj(o: unknown, key: string): Record<string, unknown> | undefined {
  const v = field(o, key);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** https://Docs.Foo.dev/cli/install/?x=1 → docs.foo.dev/cli/install */
export function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.host.toLowerCase() + u.pathname).replace(/\/+$/, '');
  } catch {
    return url;
  }
}

/** An absolute path relative to cwd when inside it, else ~/… when inside home, else unchanged. */
export function displayPath(path: string, cwd: string, home: string): string {
  if (cwd && path === cwd) return '.';
  if (cwd && path.startsWith(cwd + '/')) return relative(cwd, path);
  if (home && path.startsWith(home + '/')) return '~/' + path.slice(home.length + 1);
  return path;
}

/** Files a Bash command changed, from Claude Code's bashEditDiff (public beta; tolerate its shapes). */
export function changedFiles(response: unknown, cwd: string): string[] {
  const diff = obj(response, 'bashEditDiff');
  return arr(field(diff, 'changedFiles'))
    .map(f => (typeof f === 'string' ? f : (str(f, 'path') ?? str(f, 'filePath') ?? str(f, 'file'))))
    .filter((f): f is string => Boolean(f))
    .map(f => (isAbsolute(f) || !cwd ? f : resolve(cwd, f)));
}

/**
 * One line, at most `max` characters, safe to print: control characters (terminal escapes)
 * become spaces and backticks become quotes, so recorded text can't restyle a terminal or
 * turn into a command when a report is shown inside Claude Code.
 */
export function clip(s: string, max: number): string {
  const one = s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return one.length <= max ? one : one.slice(0, max - 1) + '…';
}

/**
 * A tool call id short enough to read in a report line: toolu_01XWNSRthmT3jfsUEY1ALhq1 → toolu…ALhq1.
 * Within one session the tail is distinct in practice, and the seq beside it is exact. JSON keeps the full id.
 */
export function callId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 5)}…${id.slice(-5)}` : id;
}

/**
 * The path with symlinks resolved; for a file that no longer exists, its directory's real path.
 * Hooks may record a symlinked path (/var/... on macOS) where the shell reports the real one
 * (/private/var/...), so paths are joined on this.
 */
export function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
}
