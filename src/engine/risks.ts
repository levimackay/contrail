import { str } from '../util.ts';
import { bestPerGroup } from './explain.ts';
import type { Action, Explanation, Graph, Input, Link, TokenTrace, Verdict } from './types.ts';

export type Sensitivity = 'credentials' | 'runs remote code' | 'network' | 'install' | 'destructive' | "touches Contrail's records";

const CREDENTIAL_PATH =
  /(\.aws\/(credentials|config)|\.ssh\/|\bid_(rsa|ed25519|ecdsa)\b|\.netrc|\.npmrc|\.pypirc|\.docker\/config\.json|\.kube\/config|\.gnupg\/|(^|[\s/"'])\.env(\.[\w-]+)?(?=$|[\s"'])|keychain|credentials\.json|secrets?\.(json|ya?ml|env|toml)|\.git-credentials|\.config\/gh\/hosts\.ya?ml|\.pgpass|\.my\.cnf|\.config\/gcloud\/|\.azure\/|\.vault-token|\.terraform\.d\/credentials|\.boto\b)/i;
/** printenv or a bare env dumps every variable, secrets included; env VAR=x cmd does not. */
const DUMPS_ENV = /(^|[\s;&|(])(printenv|env)\s{0,8}($|[|;&>)])/;
const RUNS_REMOTE_CODE = /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(ba|z)?sh\s+<\(\s*(curl|wget)\b|\beval\s+"?\$\((curl|wget)\b/;
const NETWORK = /(^|[\s;&|(])(curl|wget|nc|ncat|scp|rsync|ssh|sftp|ftp)\s|\bgit\s+push\b|\bgh\s+api\b/;
const INSTALL = /(^|[\s;&|(])((npm|pnpm|bun)\s+(install|i|add)\s+[^-\s]|yarn\s+add\s|pip3?\s+install\s|uv\s+(add|pip\s+install)\s|cargo\s+add\s|gem\s+install\s|brew\s+install\s|go\s+get\s|npx\s+[^-\s])/;
const DESTRUCTIVE =
  /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])|\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+(.*\s)?(-f|--force)\b)|\bchmod\s+(-R\s+)?777\b|\b(drop|truncate)\s+(table|database)\b|\bmkfs\b|\bdd\s+if=/i;

/**
 * Contrail's own data directory. The agent runs as you and could edit or remove what Contrail
 * recorded, so a call that names it is worth a second look.
 */
const CONTRAIL_DATA = /plugins\/data\/contrail[\w-]{0,64}|\bcontrail\.db\b|\bCONTRAIL_HOME\b/;
/** Contrail's own use of its directory: the launcher kept there, and the data flags its skills pass. */
const CONTRAIL_OWN_USE = /\S{0,512}plugins\/data\/contrail[\w-]{0,64}\/bin\/contrail\b|--(plugin-)?data[= ]\s{0,4}("[^"]{0,1024}"|'[^']{0,1024}'|\S{1,1024})/g;

/** What makes an action worth a second look. A description of the action, not a judgment of it. */
export function sensitivity(action: Action): Sensitivity[] {
  const kinds = new Set<Sensitivity>();
  if (action.tool === 'Bash') {
    const cmd = str(action.input, 'command') ?? '';
    if (CREDENTIAL_PATH.test(cmd) || DUMPS_ENV.test(cmd)) kinds.add('credentials');
    if (RUNS_REMOTE_CODE.test(cmd)) kinds.add('runs remote code');
    if (NETWORK.test(cmd)) kinds.add('network');
    if (INSTALL.test(cmd)) kinds.add('install');
    if (DESTRUCTIVE.test(cmd)) kinds.add('destructive');
    if (CONTRAIL_DATA.test(cmd.replace(CONTRAIL_OWN_USE, ' '))) kinds.add("touches Contrail's records");
  } else if (['Read', 'Edit', 'MultiEdit', 'Write'].includes(action.tool)) {
    const path = str(action.input, 'file_path') ?? '';
    if (CREDENTIAL_PATH.test(path)) kinds.add('credentials');
    if (action.tool !== 'Read' && CONTRAIL_DATA.test(path)) kinds.add("touches Contrail's records");
  }
  return [...kinds];
}

export interface Finding {
  action: Action;
  kinds: Sensitivity[];
  requested: Verdict;
  /** every source credited anywhere on the action's trail, nearest first */
  sources: Array<{ link: Link; input: Input }>;
  /** true when some credited source was written outside your machine: web, MCP, a dependency, network output */
  externalUpstream: boolean;
}

/** One sensitive action, with the facts that decide how much attention it deserves. */
export function assess(e: Explanation, g: Graph): Finding | null {
  const kinds = sensitivity(e.action);
  if (!kinds.length) return null;
  const inputs = new Map(g.inputs.map(i => [i.id, i]));
  const sources: Finding['sources'] = [];
  // Breadth first: the action's own values before anything further upstream.
  let level: TokenTrace[] = bestPerGroup(e.traces);
  while (level.length) {
    for (const t of level) {
      for (const link of t.links) {
        const input = link.to ? inputs.get(link.to) : undefined;
        if (!input || link.grade === 'UNKNOWN') continue;
        const sameLine = (s: Finding['sources'][number]) => s.input.id === input.id && s.link.quote?.line === link.quote?.line;
        const seen = sources.some(s => (s.input.id === input.id && s.link.token === link.token) || (t.token.role === 'hint' && sameLine(s)));
        if (!seen) sources.push({ link, input });
      }
    }
    level = level.flatMap(t => (t.upstream ? [t.upstream.trace] : []));
  }
  return {
    action: e.action,
    kinds,
    requested: e.requested.verdict,
    sources,
    externalUpstream: sources.some(s => s.input.trust === 'external'),
  };
}

/** External trail first, then actions you did not name, then the rest; newest first within each. */
export function rankFindings(findings: Finding[]): Finding[] {
  const weight = (f: Finding) => (f.externalUpstream ? 0 : f.requested === 'NAMED' ? 2 : 1);
  return [...findings].sort((a, b) => weight(a) - weight(b) || b.action.preSeq - a.action.preSeq);
}
