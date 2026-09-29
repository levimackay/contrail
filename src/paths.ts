import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ContrailError } from './errors.ts';

/**
 * Where recorded events live. Order: --data flag, CONTRAIL_HOME, CLAUDE_PLUGIN_DATA
 * (set inside Claude Code), then the one Contrail directory under ~/.claude/plugins/data.
 */
export function resolveDataDir(flag: string | undefined, env: NodeJS.ProcessEnv, home: string): string {
  if (flag) return flag;
  if (env.CONTRAIL_HOME) return env.CONTRAIL_HOME;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;

  const base = join(home, '.claude', 'plugins', 'data');
  const hits = existsSync(base) ? readdirSync(base).filter(n => n === 'contrail' || n.startsWith('contrail-')) : [];
  if (hits.length === 1) return join(base, hits[0]!);
  if (hits.length === 0) {
    throw new ContrailError('No recorded data found. Is the Contrail plugin installed? Set CONTRAIL_HOME to point at a data directory.');
  }
  const list = hits.map(h => `  ${join(base, h)}`).join('\n');
  throw new ContrailError(`Found ${hits.length} Contrail data directories:\n${list}\nSet CONTRAIL_HOME to pick one.`);
}
