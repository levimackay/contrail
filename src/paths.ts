import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ContrailError } from './errors.ts';

/**
 * Where recorded events live. Order: --data, CONTRAIL_HOME, --plugin-data (what the skills
 * pass: Claude Code's plugin data directory), CLAUDE_PLUGIN_DATA, then the one Contrail
 * directory under ~/.claude/plugins/data (or $CLAUDE_CONFIG_DIR/plugins/data). The capture
 * hook uses the same order, so a query reads where recording writes.
 */
export function resolveDataDir(flag: string | undefined, env: NodeJS.ProcessEnv, home: string, pluginData?: string): string {
  if (flag) return flag;
  if (env.CONTRAIL_HOME) return env.CONTRAIL_HOME;
  if (pluginData) return pluginData;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;

  // Claude Code keeps plugin data under CLAUDE_CONFIG_DIR when that is set.
  const base = join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'plugins', 'data');
  const hits = existsSync(base) ? readdirSync(base).filter(n => n === 'contrail' || n.startsWith('contrail-')) : [];
  if (hits.length === 1) return join(base, hits[0]!);
  if (hits.length === 0) {
    throw new ContrailError(
      `No Contrail data directory in ${base} yet. Install the plugin in Claude Code (/plugin install contrail@contrail) and start a session, or set CONTRAIL_HOME to a data directory.`,
    );
  }
  const list = hits.map(h => `  ${join(base, h)}`).join('\n');
  throw new ContrailError(`Found ${hits.length} Contrail data directories:\n${list}\nSet CONTRAIL_HOME to pick one.`);
}
