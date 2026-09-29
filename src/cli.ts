import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { explain } from './engine/explain.ts';
import { ContrailError } from './errors.ts';
import { buildGraph, type EventRow } from './graph/build.ts';
import { ingest } from './ingest/ingest.ts';
import { makeRepoKeyOf } from './ingest/repo.ts';
import { resolveDataDir } from './paths.ts';
import { findTarget, parseTarget } from './query/target.ts';
import { renderWhy } from './render/why.ts';
import { migrate, SCHEMA_VERSION } from './store/schema.ts';
import { openDb, type Db } from './store/sqlite.ts';
import { VERSION } from './version.ts';

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
  env: NodeJS.ProcessEnv;
  home: string;
}

type Flags = { json?: boolean; data?: string; 'from-hook'?: boolean; help?: boolean; version?: boolean };

export const USAGE = `contrail ${VERSION}: the observable trail behind Claude Code actions

Usage:
  contrail why <path>             the latest recorded agent change to a file
  contrail why "<command text>"   the latest recorded shell command containing the text
  contrail why last               the latest side-effecting action in this repository
  contrail ingest                 move recorded events from the spool into the database
  contrail doctor                 check that recording and queries work

Options:
  --json          print the explanation as JSON
  --data <dir>    data directory (default: $CONTRAIL_HOME, $CLAUDE_PLUGIN_DATA, or the installed plugin's)
  -h, --help      show this help
  -v, --version   show the version
`;

export async function main(argv: string[], io: Io): Promise<number> {
  let flags: Flags;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        data: { type: 'string' },
        'from-hook': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    flags = parsed.values;
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

  try {
    switch (command) {
      case 'why':
        return await why(rest, flags, io);
      case 'ingest':
        return await ingestCommand(flags, io);
      case 'doctor':
        return await doctor(flags, io);
      default:
        io.err(`contrail: unknown command "${command}"\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    if (flags['from-hook']) return 0; // a hook must never fail loudly
    if (e instanceof ContrailError) {
      io.err(`contrail: ${e.message}\n`);
      return 1;
    }
    io.err(`contrail: unexpected error. Please report it with this output.\n${(e as Error).stack ?? String(e)}\n`);
    return 3;
  }
}

async function openStore(flags: Flags, io: Io): Promise<{ db: Db; dataDir: string }> {
  const dataDir = resolveDataDir(flags.data, io.env, io.home);
  mkdirSync(join(dataDir, 'spool'), { recursive: true, mode: 0o700 });
  const db = await openDb(join(dataDir, 'contrail.db'));
  migrate(db);
  return { db, dataDir };
}

async function why(args: string[], flags: Flags, io: Io): Promise<number> {
  const target = parseTarget(args, io.cwd);
  const { db, dataDir } = await openStore(flags, io);
  try {
    const repoKeyOf = makeRepoKeyOf();
    ingest(db, join(dataDir, 'spool'), repoKeyOf);
    const hit = findTarget(db, target, repoKeyOf(io.cwd));
    const rows = db.all<EventRow>('SELECT * FROM events WHERE session_id = ? ORDER BY captured_us, spool_name', hit.sessionId);
    const graph = buildGraph(rows, { home: io.home, user: basename(io.home) });
    const explanation = explain(hit.toolUseId, graph);
    if (flags.json) io.out(`${JSON.stringify(explanation, null, 2)}\n`);
    else io.out(renderWhy(explanation, graph, hit.total > 1 ? `the latest of ${hit.total} recorded matches` : undefined));
    return 0;
  } finally {
    db.close();
  }
}

async function ingestCommand(flags: Flags, io: Io): Promise<number> {
  const { db, dataDir } = await openStore(flags, io);
  try {
    const r = ingest(db, join(dataDir, 'spool'), makeRepoKeyOf());
    if (!flags['from-hook']) {
      io.out(`ingested ${r.ingested} events (${r.duplicates} already stored, ${r.parseErrors} unparseable, ${r.staleTmpRemoved} stale temp files removed)\n`);
    }
    return 0;
  } finally {
    db.close();
  }
}

async function doctor(flags: Flags, io: Io): Promise<number> {
  const runtime = (process.versions as Record<string, string | undefined>).bun
    ? `bun ${(process.versions as Record<string, string>).bun}`
    : `node ${process.versions.node}`;
  io.out(`contrail ${VERSION} on ${runtime}\n`);
  const { db, dataDir } = await openStore(flags, io);
  try {
    const backlog = readdirSync(join(dataDir, 'spool')).filter(n => n.endsWith('.json')).length;
    const stats = db.get<{ events: number; sessions: number; parseErrors: number; last: number | null }>(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions,
              SUM(parse_error IS NOT NULL) AS parseErrors, MAX(captured_us) AS last FROM events`,
    )!;
    const last = stats.last ? new Date(Math.floor(stats.last / 1000)).toISOString() : 'never';
    io.out(
      [
        `data directory   ${dataDir}`,
        `schema           v${SCHEMA_VERSION}`,
        `events stored    ${stats.events} across ${stats.sessions} sessions`,
        `waiting in spool ${backlog}`,
        `unparseable      ${stats.parseErrors ?? 0}`,
        `last event       ${last}`,
        stats.events === 0 && backlog === 0
          ? 'No events yet. Run a Claude Code session with the plugin enabled, then check again.'
          : 'Recording and queries work.',
      ].join('\n') + '\n',
    );
    return 0;
  } finally {
    db.close();
  }
}
