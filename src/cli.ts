import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { commitContains } from './engine/effects.ts';
import { explain } from './engine/explain.ts';
import { assess, findingsFor, rankFindings, sensitivity, type Finding } from './engine/risks.ts';
import { findValue } from './engine/find.ts';
import { trailForest, type TreeNode, type TreeRoot } from './engine/tree.ts';
import type { Explanation, Graph } from './engine/types.ts';
import { ContrailError } from './errors.ts';
import { buildGraph } from './graph/build.ts';
import { contentHmac } from './ingest/content.ts';
import { redactString } from './ingest/redact.ts';
import { ingest, stored } from './ingest/ingest.ts';
import { makeRepoKeyOf } from './ingest/repo.ts';
import { resolveDataDir } from './paths.ts';
import { blameFile, explainCalls } from './query/blame.ts';
import { commitFiles, findCommit, isCommit } from './query/commit.ts';
import { reviewBranch } from './query/review.ts';
import { loadGraph, loadRows, pickSession, recentSessions } from './query/sessions.ts';
import { findTarget, parseTarget, unquote, type Target } from './query/target.ts';
import { blameJson, noLineWriter, renderBlame, renderLineNote } from './render/blame.ts';
import { EXPLAINED, matchesFilter, renderCommit, renderFind, renderRisks, renderSessions, renderStatusline, renderTrace, renderTree, renderTripwire, type TraceFilter } from './render/session.ts';
import { COLOR, PLAIN, styleFor, type Style } from './render/style.ts';
import { renderReport } from './render/html.ts';
import { toOtlp } from './render/otel.ts';
import { renderReview, renderReviewMarkdown, reviewJson } from './render/review.ts';
import { renderWhy } from './render/why.ts';
import { loadConfig, prune } from './store/retention.ts';
import { migrate, SCHEMA_VERSION } from './store/schema.ts';
import { openDb, type Db } from './store/sqlite.ts';
import { displayPath, realPath } from './util.ts';
import { VERSION } from './version.ts';

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
  env: NodeJS.ProcessEnv;
  home: string;
  isTTY?: boolean;
  /** Standard input, read once; defaults to the process's. */
  stdin?: () => string;
}

const FILTERS: TraceFilter[] = ['writes', 'shell', 'network', 'mcp', 'subagents', 'instructions'];
const MAX_EXPLAINED = 300;

const OPTIONS = {
  json: { type: 'boolean' },
  data: { type: 'string' },
  'plugin-data': { type: 'string' },
  stdin: { type: 'boolean' },
  session: { type: 'string' },
  limit: { type: 'string' },
  all: { type: 'boolean' },
  yes: { type: 'boolean' },
  tree: { type: 'boolean' },
  otel: { type: 'boolean' },
  markdown: { type: 'boolean' },
  output: { type: 'string', short: 'o' },
  'from-hook': { type: 'boolean' },
  'from-skill': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  ...Object.fromEntries(FILTERS.map(f => [f, { type: 'boolean' }])),
} as const;

type Flags = Partial<Record<keyof typeof OPTIONS | TraceFilter, string | boolean>>;

export const USAGE = `contrail ${VERSION}: the observable trail behind Claude Code actions

Usage:
  contrail why [<anything>]         the trail behind whatever you point at:
                                      nothing          the last thing the agent did
                                      src/app.ts       the latest agent change to that file
                                      src/app.ts:42    the call that last wrote that line (or 40-48)
                                      "npm install x"  the latest shell command containing it
                                      <commit sha>     what the commit holds, joined to agent changes
                                      toolu…ALhq1      one tool call, by the id reports print
                                      jwt-decode       the latest call that used that value
  contrail blame <file> [--session <id>]
                                    each line of a file as it is now, with the recorded agent call
                                    that last wrote it, its turn and its trail
  contrail trace [--session <id>]   a session as a timeline, each side effect with its source
        [--writes | --shell | --network | --mcp | --subagents | --instructions | --tree]
                                    --tree: each action under the call whose output held its value
  contrail risks [--session <id> | --all]
                                    sensitive actions, those tracing to web or MCP content first
  contrail sessions [--limit N] [--all]
                                    recent sessions at a glance
  contrail export [<session> | last] [--otel]
                                    a session's recorded events as JSON, or as OpenTelemetry traces
  contrail report [<session> | last] [-o file.html]
                                    a session as one self-contained HTML page
  contrail find "<value>" [--all]   every recorded input that held a value, and every call that used it
  contrail review [<base>] [--markdown] [-o review.md]
                                    this branch's commits and uncommitted changes, joined to the agent
                                    calls behind them (base: the first of origin/HEAD, origin/main,
                                    origin/master, main, master); --markdown for a pull request,
                                    -o to save that markdown and print this view
  contrail statusline               one line for Claude Code's status bar (reads its JSON on stdin)
  contrail doctor                   check that recording and queries work
  contrail ingest                   move recorded events from the spool into the database
  contrail prune                    apply retention now and compact the database
  contrail forget <session> | --all --yes
                                    delete one recorded session, or everything, and compact

Options:
  --json          machine-readable output (why, blame, trace, risks, sessions, find, review)
  --data <dir>    data directory (default: $CONTRAIL_HOME, $CLAUDE_PLUGIN_DATA, or the installed plugin's)
  --plugin-data <dir>
                  the plugin's data directory, used when $CONTRAIL_HOME is unset (the skills pass it)
  --stdin         read the why, find, blame or review argument from standard input (the skills use it)
  -h, --help      show this help
  -v, --version   show the version
`;

export async function main(argv: string[], io: Io): Promise<number> {
  let flags: Flags;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
    flags = parsed.values as Flags;
    positionals = parsed.positionals;
  } catch (e) {
    io.err(`contrail: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const [command, ...rest] = positionals;
  if (flags.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (flags.help || command === undefined || command === 'help') {
    io.out(USAGE);
    return 0;
  }

  const style = flags.json ? PLAIN : styleFor(io.env, io.isTTY ?? false);
  const commands: Record<string, (args: string[]) => Promise<number>> = {
    why: args => why(args, flags, io, style),
    blame: args => blame(args, flags, io, style),
    trace: () => trace(flags, io, style),
    risks: () => risks(flags, io, style),
    sessions: () => sessions(flags, io, style),
    export: args => exportSession(args, flags, io),
    report: args => report(args, flags, io),
    statusline: () => statusline(flags, io),
    tripwire: () => tripwire(flags, io),
    find: args => find(args, flags, io, style),
    review: args => review(args, flags, io, style),
    ingest: () => ingestCommand(flags, io),
    prune: () => pruneCommand(flags, io),
    forget: args => forget(args, flags, io),
    doctor: () => doctor(flags, io),
  };
  const run = commands[command];
  if (!run) {
    io.err(`contrail: unknown command "${command}"\n\n${USAGE}`);
    return 2;
  }

  try {
    return await run(rest);
  } catch (e) {
    if (flags['from-hook']) return 0; // a hook must never fail loudly
    // A skill's command that exits non-zero is shown as a failed shell block, not as its output,
    // so from a skill the message is the output.
    const say = flags['from-skill'] ? io.out : io.err;
    if (e instanceof ContrailError) {
      say(`contrail: ${e.message}\n`);
      return flags['from-skill'] ? 0 : 1;
    }
    say(`contrail: unexpected error. Please report it with this output.\n${(e as Error).stack ?? String(e)}\n`);
    return flags['from-skill'] ? 0 : 3;
  }
}

interface Store {
  db: Db;
  dataDir: string;
  repoKey: string;
  /** the content key's hash, when this directory has one (store_content: false, now or earlier) */
  hashToken?: (span: string) => string;
}

/**
 * The spool exists and the directory is private. Claude Code creates the data directory with the
 * user's umask, and the health hook that tightens it only runs when a session starts.
 */
function prepareDataDir(dataDir: string): void {
  mkdirSync(join(dataDir, 'spool'), { recursive: true, mode: 0o700 });
  try {
    chmodSync(dataDir, 0o700);
  } catch {
    // not ours to change (another owner); it still works
  }
}

async function withStore<T>(flags: Flags, io: Io, use: (store: Store) => T | Promise<T>): Promise<T> {
  const dataDir = resolveDataDir(flags.data as string | undefined, io.env, io.home, flags['plugin-data'] as string | undefined);
  let db: Db;
  try {
    prepareDataDir(dataDir);
    db = await openDb(join(dataDir, 'contrail.db'));
  } catch (e) {
    if (e instanceof ContrailError) throw e;
    throw new ContrailError(`Cannot use the data directory ${dataDir}: ${(e as Error).message}`);
  }
  try {
    migrate(db);
    const repoKeyOf = makeRepoKeyOf();
    const storeContent = loadConfig(dataDir).config.storeContent;
    const hashToken = contentHmac(dataDir, !storeContent);
    ingest(db, join(dataDir, 'spool'), repoKeyOf, Date.now(), storeContent ? undefined : hashToken);
    return await use({ db, dataDir, repoKey: repoKeyOf(io.cwd), ...(hashToken ? { hashToken } : {}) });
  } finally {
    db.close();
  }
}

async function why(args: string[], flags: Flags, io: Io, s: Style): Promise<number> {
  if (args[0] === 'commit') return whyCommit(args.slice(1), flags, io, s);
  const target = parseTarget(flags.stdin ? [readStdin(io)] : args, io.cwd);
  if (target.kind === 'command' && /^commit [0-9a-f]{7,40}$/i.test(target.text)) return whyCommit(target.text.split(' ').slice(1), flags, io, s);
  if (target.kind === 'command' && isCommit(io.cwd, target.text)) return whyCommit([target.text], flags, io, s);
  if (target.kind === 'line') return whyLine(target, flags, io, s);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    let hit: { sessionId: string; toolUseId: string };
    let note: string | undefined;
    try {
      const found = findTarget(db, target, repoKey);
      hit = found;
      note = found.total > 1 ? `the latest of ${found.total} recorded matches` : undefined;
    } catch (e) {
      // Not a changed file or a shell command: it may be a value (a package, a URL, a name),
      // so answer for the latest call whose arguments used it.
      if (!(e instanceof ContrailError) || (target.kind !== 'command' && target.kind !== 'path')) throw e;
      const value = target.kind === 'path' ? target.shown : target.text;
      const use = latestUse(db, value, repoKey, io.home, hashToken);
      if (!use) {
        throw new ContrailError(
          `Nothing recorded matches "${value}": no agent change to that file, no shell command containing it, and no call that used it. ` +
            'Contrail only sees sessions recorded since it was installed. Run /contrail:why with no argument for the last action.',
        );
      }
      hit = use;
      note = `the latest recorded call that used "${value}"${use.total > 1 ? ` (${use.total} calls in that session used it; contrail find lists them all)` : ''}`;
    }
    const graph = loadGraph(db, hit.sessionId, io.home, hashToken);
    const explanation = explain(hit.toolUseId, graph);
    if (flags.json) io.out(`${JSON.stringify(explanation, null, 2)}\n`);
    else io.out(renderWhy(explanation, graph, note, s));
    return 0;
  });
}

/** The latest call, in the newest recent session that has one, whose arguments contain the value. */
function latestUse(db: Db, value: string, repoKey: string, home: string, hashToken?: (span: string) => string) {
  for (const row of recentSessions(db, repoKey, 50)) {
    const graph = loadGraph(db, row.id, home, hashToken);
    const uses = findValue(graph, value).filter(x => x.use);
    const last = uses.at(-1)?.use;
    if (last) return { sessionId: row.id, toolUseId: last.action.id, total: uses.length };
  }
  return null;
}

async function whyCommit(args: string[], flags: Flags, io: Io, s: Style): Promise<number> {
  const sha = args[0];
  if (!sha) throw new ContrailError('Usage: contrail why commit <sha>');
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const hit = findCommit(db, sha, io.cwd, repoKey);
    const graph = loadGraph(db, hit.sessionId, io.home, hashToken);
    const action = graph.actions.find(a => a.id === hit.toolUseId);
    if (!action) throw new ContrailError(`The action that made commit ${sha} is missing from its session.`);
    const explanation = explain(action.id, graph);
    const files = commitFiles(hit.cwd, hit.commit.sha)?.map(realPath);
    const seqOf = (id: string) => graph.actions.find(a => a.id === id)?.preSeq ?? 0;
    // Git reports real paths (/private/var/... on macOS) and hooks may record a symlinked one
    // (/var/...), so join on real paths and show the recorded one.
    const shown = new Map<string, string>();
    const writes = graph.effects
      .filter(e => e.kind === 'file' && e.path)
      .map(e => {
        const path = realPath(e.path!);
        shown.set(path, e.path!);
        return { path, seq: seqOf(e.actionId), actionId: e.actionId, expected: e.evidence === 'expected' };
      });
    const cwdReal = realPath(graph.env.cwd);
    const display = (file: string) =>
      shown.get(file) ?? (graph.env.cwd && file.startsWith(`${cwdReal}/`) ? graph.env.cwd + file.slice(cwdReal.length) : file);
    const joined = files
      ? commitContains(
          action.preSeq,
          files,
          writes,
          graph.effects
            .filter(e => e.kind === 'commit' && e.actionId !== action.id && e.commit)
            .map(e => ({ seq: seqOf(e.actionId), files: (commitFiles(hit.cwd, e.commit!.sha) ?? []).map(realPath) })),
        ).map(f => {
          const file = display(f.file);
          if (!f.actionId) return { ...f, file };
          const writer = explain(f.actionId, graph);
          return { ...f, file, writer: { action: writer.action, named: writer.requested.verdict === 'NAMED' } };
        })
      : null;
    if (flags.json) {
      const madeBy = { action: action.id, grade: hit.via === 'stdout' ? 'DIRECT' : 'LIKELY', rule: hit.via === 'stdout' ? 'R1' : 'R9' };
      io.out(`${JSON.stringify({ commit: hit.commit, madeBy, requested: explanation.requested, files: joined }, null, 2)}\n`);
    } else {
      io.out(renderCommit({ commit: hit.commit, action, explanation, files: joined, via: hit.via, commitSec: hit.commitSec }, graph, s));
    }
    return 0;
  });
}

/** why file.ts:42: the recorded call that last wrote that line, found as blame finds it, then that call's report. */
async function whyLine(target: Extract<Target, { kind: 'line' }>, flags: Flags, io: Io, s: Style): Promise<number> {
  return withStore(flags, io, ({ db, hashToken }) => {
    const b = blameFile(db, target.path, target.shown);
    if (target.start > b.lines.length) {
      throw new ContrailError(`${target.shown} has ${b.lines.length} line${b.lines.length === 1 ? '' : 's'} now; there is no line ${target.start}.`);
    }
    const hit = b.lines.slice(target.start - 1, target.end).find(l => l.call);
    if (!hit) throw new ContrailError(noLineWriter(target));
    const call = b.calls.find(c => c.id === hit.call)!;
    const graph = loadGraph(db, call.sessionId, io.home, hashToken);
    const explanation = explain(call.id, graph);
    if (flags.json) {
      const line = { file: b.path, line: hit.line, call: call.id, grade: hit.grade, rule: 'R10', match: hit.match, unambiguous: hit.unambiguous, writers: hit.writers, inFile: hit.inFile, byCall: hit.byCall };
      io.out(`${JSON.stringify({ line, ...explanation }, null, 2)}\n`);
    } else {
      io.out(`${renderLineNote(target, hit, call, s)}\n${renderWhy(explanation, graph, undefined, s)}`);
    }
    return 0;
  });
}

async function blame(args: string[], flags: Flags, io: Io, s: Style): Promise<number> {
  const arg = unquote((flags.stdin ? readStdin(io) : args.join(' ')).trim());
  if (!arg) throw new ContrailError('Usage: contrail blame <file> [--session <id>] [--json]');
  const path = resolve(io.cwd, arg);
  const shown = displayPath(path, io.cwd, io.home);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const session = flags.session ? pickSession(db, flags.session as string, repoKey) : null;
    const b = blameFile(db, path, shown, session);
    explainCalls(db, b, io.home, hashToken);
    if (flags.json) io.out(`${JSON.stringify(blameJson(b), null, 2)}\n`);
    else io.out(renderBlame(b, shown, s));
    return 0;
  });
}

async function trace(flags: Flags, io: Io, s: Style): Promise<number> {
  const chosen = FILTERS.filter(f => flags[f]);
  if (chosen.length > 1) throw new ContrailError(`Pick one filter: ${chosen.map(f => `--${f}`).join(', ')}`);
  const filter = chosen[0] ?? null;
  if (flags.tree && filter) throw new ContrailError(`--tree shows the whole session; it does not combine with --${filter}.`);
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const graph = loadGraph(db, pickSession(db, flags.session as string | undefined, repoKey), io.home, hashToken);
    if (flags.tree) {
      // Every call, reads included: a read is often the parent of what came after it.
      const explanations = new Map(graph.actions.slice(0, MAX_EXPLAINED).map(a => [a.id, explain(a.id, graph)]));
      const forest = trailForest(graph, explanations);
      const omitted = graph.actions.length - explanations.size;
      if (flags.json) io.out(`${JSON.stringify({ session: graph.sessionId, forest: forest.map(treeJson), omitted }, null, 2)}\n`);
      else io.out(renderTree(graph, forest, omitted, s));
      return 0;
    }
    const explanations = new Map<string, Explanation>();
    for (const a of graph.actions) {
      if (explanations.size >= MAX_EXPLAINED) break;
      if (!matchesFilter(a, graph, filter) || !EXPLAINED.has(kindForExplain(a.tool))) continue;
      explanations.set(a.id, explain(a.id, graph));
    }
    if (flags.json) io.out(`${JSON.stringify({ session: graph.sessionId, filter, explanations: [...explanations.values()] }, null, 2)}\n`);
    else io.out(renderTrace(graph, explanations, filter, s));
    return 0;
  });
}

function treeJson(root: TreeRoot): unknown {
  const node = (n: TreeNode): unknown => ({ action: n.action.id, tool: n.action.tool, seq: n.action.preSeq, token: n.token, grade: n.link?.grade ?? null, children: n.children.map(node) });
  return { kind: root.kind, source: root.source ? { id: root.source.id, label: root.source.label, trust: root.source.trust } : null, children: root.children.map(node) };
}

function kindForExplain(tool: string): string {
  if (tool.startsWith('mcp__')) return 'MCP';
  return ({ Edit: 'EDIT', MultiEdit: 'EDIT', NotebookEdit: 'EDIT', Write: 'WRITE', Bash: 'SHELL', WebFetch: 'WEB', WebSearch: 'WEB', Agent: 'AGENT', Task: 'AGENT' } as Record<string, string>)[tool] ?? '';
}

async function risks(flags: Flags, io: Io, s: Style): Promise<number> {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const ids = flags.session
      ? [pickSession(db, flags.session as string, repoKey)]
      : recentSessions(db, repoKey, flags.all ? 10_000 : 20, flags.all === true).map(r => r.id);
    const graphs = new Map<string, Graph>();
    let actions = 0;
    const findings: Finding[] = [];
    for (const id of ids) {
      const graph = loadGraph(db, id, io.home, hashToken);
      graphs.set(id, graph);
      actions += graph.actions.length;
      findings.push(...findingsFor(graph));
    }
    const ranked = rankFindings(findings);
    if (flags.json) {
      io.out(`${JSON.stringify(ranked.map(f => ({ action: f.action.id, session: f.action.scope.sessionId, kinds: f.kinds, requested: f.requested, externalUpstream: f.externalUpstream, sources: f.sources.map(x => ({ grade: x.link.grade, token: x.link.token, source: x.input.label, trust: x.input.trust, quote: x.link.quote })) })), null, 2)}\n`);
    } else {
      io.out(renderRisks(ranked, { actions, sessions: ids.length }, graphs, s));
    }
    return 0;
  });
}

async function sessions(flags: Flags, io: Io, s: Style): Promise<number> {
  const limit = Number(flags.limit ?? 10);
  if (!Number.isInteger(limit) || limit < 1) throw new ContrailError('--limit takes a positive whole number.');
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const rows = recentSessions(db, repoKey, limit, flags.all === true);
    const summaries = rows.map(r => {
      const graph = loadGraph(db, r.id, io.home, hashToken);
      return { ...r, graph, flagged: findingsFor(graph).filter(f => f.externalUpstream).length };
    });
    if (flags.json) {
      io.out(`${JSON.stringify(summaries.map(x => ({ id: x.id, lastUs: x.lastUs, cwd: x.cwd, turns: x.graph.prompts.length, toolCalls: x.graph.actions.length, flagged: x.flagged, firstPrompt: x.graph.prompts.find(p => p.from === 'you')?.text ?? null })), null, 2)}\n`);
    } else {
      io.out(renderSessions(summaries, s));
    }
    return 0;
  });
}

async function exportSession(args: string[], flags: Flags, io: Io): Promise<number> {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const id = pickSession(db, args[0] ?? (flags.session as string | undefined), repoKey);
    if (flags.otel) {
      // One OTLP/JSON request on one line, the shape collectors' file receivers read.
      const graph = loadGraph(db, id, io.home, hashToken);
      const explanations = new Map(graph.actions.slice(0, MAX_EXPLAINED).map(a => [a.id, explain(a.id, graph)]));
      io.out(`${JSON.stringify(toOtlp(graph, explanations, findingsFor(graph), VERSION))}\n`);
      return 0;
    }
    const events = loadRows(db, id).map(r => ({ ...r, payload: JSON.parse(r.payload) as unknown }));
    io.out(`${JSON.stringify({ contrail: VERSION, schema: SCHEMA_VERSION, session: id, events }, null, 2)}\n`);
    return 0;
  });
}

async function report(args: string[], flags: Flags, io: Io): Promise<number> {
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const id = pickSession(db, args[0] ?? (flags.session as string | undefined), repoKey);
    const graph = loadGraph(db, id, io.home, hashToken);
    const explanations = new Map(graph.actions.slice(0, MAX_EXPLAINED).map(a => [a.id, explain(a.id, graph)]));
    const html = renderReport({
      graph,
      explanations,
      findings: rankFindings(findingsFor(graph)),
      forest: trailForest(graph, explanations),
      omitted: graph.actions.length - explanations.size,
      version: VERSION,
      generatedAt: new Date(),
    });
    const path = flags.output as string | undefined;
    if (!path) {
      io.out(html);
      return 0;
    }
    writePrivate(path, html);
    io.out(`Wrote ${path}\n`);
    return 0;
  });
}

async function find(args: string[], flags: Flags, io: Io, s: Style): Promise<number> {
  const value = (flags.stdin ? readStdin(io) : args.join(' ')).trim();
  if (!value) throw new ContrailError('Usage: contrail find "<value>" [--all]');
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const sessions = flags.session
      ? [pickSession(db, flags.session as string, repoKey)]
      : recentSessions(db, repoKey, flags.all ? 500 : 50, flags.all === true).map(r => r.id);
    const hits = sessions.map(id => {
      const graph = loadGraph(db, id, io.home, hashToken);
      return { graph, sightings: findValue(graph, value) };
    });
    if (flags.json) {
      const json = hits
        .filter(h => h.sightings.length)
        .map(h => ({
          session: h.graph.sessionId,
          sightings: h.sightings.map(x =>
            x.source
              ? { seq: x.seq, held: { source: x.source.input.label, trust: x.source.input.trust, origin: x.source.input.origin, line: x.source.line } }
              : { seq: x.seq, used: { action: x.use!.action.id, tool: x.use!.action.tool, argPath: x.use!.argPath, sensitive: x.use!.kinds } },
          ),
        }));
      io.out(`${JSON.stringify({ value, sessions: json }, null, 2)}\n`);
    } else {
      io.out(renderFind(value, hits, sessions.length, s));
    }
    return 0;
  });
}

/**
 * The PreToolUse tripwire. Before a sensitive call runs (and before Claude Code asks for
 * permission), tell the person when values in it first appeared in external content. The
 * notice is a systemMessage: Claude Code shows it to the person and does not give it to the
 * model. It never blocks, never makes a permission decision, and on any failure prints nothing.
 */
async function tripwire(flags: Flags, io: Io): Promise<number> {
  try {
    const raw = readStdin(io);
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id : '';
    const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : '';
    if (payload.hook_event_name !== 'PreToolUse' || !sessionId || !toolUseId) return 0;
    const notice = await withStore(flags, io, ({ db, dataDir, hashToken }) => {
      if (!loadConfig(dataDir).config.tripwire) return null;
      const rows = loadRows(db, sessionId);
      // The capture hook stores this same event in parallel; it may not be ingested yet.
      if (!rows.some(r => r.hook_event === 'PreToolUse' && r.tool_use_id === toolUseId)) {
        rows.push({
          id: 0, spool_name: 'tripwire', captured_us: Date.now() * 1000, session_id: sessionId,
          prompt_id: typeof payload.prompt_id === 'string' ? payload.prompt_id : null,
          agent_id: typeof payload.agent_id === 'string' ? payload.agent_id : null,
          hook_event: 'PreToolUse', tool_name: typeof payload.tool_name === 'string' ? payload.tool_name : null,
          tool_use_id: toolUseId, cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
          // Capped and redacted exactly as ingest stores it, so a huge write costs no more here.
          payload: JSON.stringify(stored(payload, 'PreToolUse')), parse_error: null,
        });
      }
      const graph = buildGraph(rows, { home: io.home, user: basename(io.home) }, hashToken);
      const action = graph.actions.find(a => a.id === toolUseId);
      if (!action || !sensitivity(action).length) return null;
      const explanation = explain(action.id, graph);
      const finding = assess(explanation, graph);
      return finding?.externalUpstream ? renderTripwire(finding, explanation) : null;
    });
    if (notice) io.out(`${JSON.stringify({ systemMessage: redactString(notice) })}\n`);
  } catch {
    // A notice that cannot be computed is simply not shown.
  }
  return 0;
}

async function review(args: string[], flags: Flags, io: Io, s: Style): Promise<number> {
  const base = (flags.stdin ? readStdin(io) : (args[0] ?? '')).trim() || undefined;
  if (args.length > 1) throw new ContrailError('Usage: contrail review [<base>] [--markdown | --json] [-o review.md]');
  if (flags.json && flags.markdown) throw new ContrailError('Pick one of --json and --markdown.');
  return withStore(flags, io, ({ db, repoKey, hashToken }) => {
    const r = reviewBranch(db, { cwd: io.cwd, base, repoKey, home: io.home, ...(hashToken ? { hashToken } : {}) });
    const path = flags.output as string | undefined;
    if (path) {
      writePrivate(path, renderReviewMarkdown(r, VERSION));
    }
    if (flags.json) io.out(`${JSON.stringify(reviewJson(r), null, 2)}\n`);
    else if (flags.markdown && !path) io.out(renderReviewMarkdown(r, VERSION));
    else io.out(renderReview(r, s));
    if (path) io.out(`\nWrote the markdown for a pull request description to ${path}\n`);
    return 0;
  });
}

/**
 * A report holds what the agent read (redacted), so it gets the database's 0600: written beside
 * the target and renamed over it, so an existing file's mode or a symlink at that path is
 * replaced, never followed.
 */
function writePrivate(path: string, text: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new ContrailError(`Cannot write ${path}: ${(e as Error).message}`);
  }
}

const readStdin = (io: Io) => (io.stdin ? io.stdin() : readFileSync(0, 'utf8'));

/**
 * Claude Code runs a statusLine command after each message with the session as JSON on stdin.
 * One short line for this session, and never an error: a status bar that breaks is worse than
 * none, so any failure prints just the name.
 */
async function statusline(flags: Flags, io: Io): Promise<number> {
  const s = io.env.NO_COLOR ? PLAIN : COLOR;
  try {
    const input = JSON.parse(readStdin(io) || '{}') as Record<string, unknown>;
    const sessionId = typeof input.session_id === 'string' ? input.session_id : undefined;
    const line = await withStore(flags, { ...io, cwd: typeof input.cwd === 'string' ? input.cwd : io.cwd }, ({ db, repoKey, hashToken }) => {
      if (!sessionId || !db.get('SELECT 1 FROM events WHERE session_id = ? LIMIT 1', sessionId)) return renderStatusline(null, [], s);
      const graph = loadGraph(db, pickSession(db, sessionId, repoKey), io.home, hashToken);
      return renderStatusline(graph, findingsFor(graph), s);
    });
    io.out(`${line}\n`);
  } catch {
    io.out(`${s.dim('contrail')}\n`);
  }
  return 0;
}

async function ingestCommand(flags: Flags, io: Io): Promise<number> {
  const dataDir = resolveDataDir(flags.data as string | undefined, io.env, io.home, flags['plugin-data'] as string | undefined);
  prepareDataDir(dataDir);
  const db = await openDb(join(dataDir, 'contrail.db'));
  try {
    migrate(db);
    const { config } = loadConfig(dataDir);
    const r = ingest(db, join(dataDir, 'spool'), makeRepoKeyOf(), Date.now(), config.storeContent ? undefined : contentHmac(dataDir, true));
    const { sessionsRemoved } = prune(db, config, Date.now());
    if (!flags['from-hook']) {
      io.out(
        `ingested ${r.ingested} events (${r.duplicates} already stored, ${r.parseErrors} unparseable, ${r.staleTmpRemoved} stale temp files removed); ` +
          `pruned ${sessionsRemoved} sessions\n`,
      );
    }
    return 0;
  } finally {
    db.close();
  }
}

async function pruneCommand(flags: Flags, io: Io): Promise<number> {
  return withStore(flags, io, ({ db, dataDir }) => {
    const { config, problem } = loadConfig(dataDir);
    if (problem) io.err(`contrail: ${problem}\n`);
    const { sessionsRemoved } = prune(db, config, Date.now());
    db.exec('VACUUM');
    io.out(`removed ${sessionsRemoved} sessions (keeping ${config.retentionDays} days, up to ${config.maxDbMb} MB); database compacted\n`);
    return 0;
  });
}

/**
 * Deletes what Contrail recorded: one session, or everything with --all --yes. Freed pages are
 * zeroed, the database is rewritten and the write-ahead log truncated, so the deleted text is
 * not left behind in either file.
 */
async function forget(args: string[], flags: Flags, io: Io): Promise<number> {
  const target = args[0] ?? (flags.session as string | undefined);
  if (flags.all ? target : !target) throw new ContrailError('Usage: contrail forget <session> | contrail forget --all --yes');
  if (flags.all && !flags.yes) throw new ContrailError('contrail forget --all deletes every recorded session. Add --yes to confirm.');
  return withStore(flags, io, ({ db, dataDir, repoKey }) => {
    db.exec('PRAGMA secure_delete = ON');
    let what: string;
    let events: number;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (flags.all) {
        events = db.run('DELETE FROM events');
        what = 'every recorded session';
      } else {
        const id = pickSession(db, target, repoKey);
        events = db.run('DELETE FROM events WHERE session_id = ?', id);
        what = `session ${id.slice(0, 8)}`;
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (flags.all) {
      // Events not ingested yet are still in the spool: they go too.
      for (const name of readdirSync(join(dataDir, 'spool'))) rmSync(join(dataDir, 'spool', name), { force: true, recursive: true });
    }
    db.exec('VACUUM');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    io.out(`forgot ${what} (${events} event${events === 1 ? '' : 's'}); database compacted\n`);
    return 0;
  });
}

async function doctor(flags: Flags, io: Io): Promise<number> {
  const versions = process.versions as Record<string, string | undefined>;
  io.out(`contrail ${VERSION} on ${versions.bun ? `bun ${versions.bun}` : `node ${process.versions.node}`}\n`);
  return withStore(flags, io, ({ db, dataDir }) => {
    const backlog = readdirSync(join(dataDir, 'spool')).filter(n => n.endsWith('.json')).length;
    const stats = db.get<{ events: number; sessions: number; parseErrors: number | null; last: number | null }>(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions,
              SUM(parse_error IS NOT NULL) AS parseErrors, MAX(captured_us) AS last FROM events`,
    )!;
    const { config, problem } = loadConfig(dataDir);
    const hook = captureTiming();
    const lines = [
      `data directory   ${dataDir}`,
      `schema           v${SCHEMA_VERSION}`,
      `events stored    ${stats.events} across ${stats.sessions} sessions`,
      `waiting in spool ${backlog}`,
      `unparseable      ${stats.parseErrors ?? 0}`,
      `last event       ${stats.last ? new Date(Math.floor(stats.last / 1000)).toISOString() : 'never'}`,
      `retention        ${config.retentionDays} days, up to ${config.maxDbMb} MB${problem ? ` (${problem})` : ''}`,
      `content          ${config.storeContent ? 'stored as redacted text' : 'stored as keyed hashes only (store_content: false)'}`,
      `launcher         ${existsSync(join(dataDir, 'bin', 'contrail')) ? join(dataDir, 'bin', 'contrail') : 'written at the next session start'}`,
      ...(hook ? [`capture hook     ${hook} ms per event (median of 5)`] : []),
      stats.events === 0 && backlog === 0
        ? 'No events yet. Run a Claude Code session with the plugin enabled, then check again.'
        : 'Recording and queries work.',
    ];
    io.out(`${lines.join('\n')}\n`);
    return 0;
  });
}

/** Times the real capture hook shipped next to this bundle, writing into a throwaway directory. */
function captureTiming(): string | null {
  let hook: string;
  try {
    hook = fileURLToPath(new URL('../hooks/capture.sh', import.meta.url));
  } catch {
    return null;
  }
  if (!existsSync(hook)) return null;
  const dir = mkdtempSync(join(tmpdir(), 'contrail-doctor-'));
  try {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      spawnSync('sh', [hook], { input: '{"hook_event_name":"PreToolUse"}', env: { PATH: process.env.PATH ?? '', CONTRAIL_HOME: dir } });
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[2]!.toFixed(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
