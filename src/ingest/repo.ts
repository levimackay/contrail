import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

/**
 * A stable key per repository: the real path of git's common dir, so every
 * worktree of one repo shares a key. Outside git, the cwd itself.
 */
export function makeRepoKeyOf(): (cwd: string) => string {
  const cache = new Map<string, string>();
  return cwd => {
    let key = cache.get(cwd);
    if (key === undefined) {
      key = gitCommonDir(cwd) ?? cwd;
      cache.set(cwd, key);
    }
    return key;
  };
}

function gitCommonDir(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? realpathSync(out) : null;
  } catch {
    return null;
  }
}
