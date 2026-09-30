import type { ImportSummary, SessionStatus } from '../ingest/import.ts';
import { clip } from '../util.ts';
import { localTime } from './session.ts';
import { PLAIN, type Style } from './style.ts';

export interface ImportView {
  summary: ImportSummary;
  /** where transcripts were looked for, as shown */
  root: string;
  /** whose sessions: a repository, a project folder, or all projects, as shown */
  scope: string;
  dryRun: boolean;
  since: string | null;
  retentionDays: number;
  maxDbMb: number;
  /** turns a recorded working directory into how it is shown */
  shown: (cwd: string) => string;
}

const MAX_LISTED = 20;

/** What contrail import found and did, in counts, then the sessions it brought in. */
export function renderImport(v: ImportView, s: Style = PLAIN): string {
  const { summary } = v;
  const count = (status: SessionStatus) => summary.sessions.filter(x => x.status === status).length;
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const out = [`${s.bold(`${plural(summary.found, 'Claude Code session')} found`)} ${s.dim(`for ${v.scope}, in ${v.root}`)}`];
  if (!summary.found) {
    out.push(`  No transcripts here belong to ${v.scope}. ${s.dim('contrail import --all takes every project; --project <dir> takes another one.')}`);
    return `${out.join('\n')}\n`;
  }

  const imported = summary.sessions.filter(x => x.status === 'imported');
  const events = imported.reduce((n, x) => n + x.events, 0);
  const skipped: Array<[number, string, boolean]> = [
    [count('recorded'), "already recorded live by Contrail's hooks, left as recorded", true],
    [count('imported-before'), 'already imported', true],
    [count('older'), `last active before --since ${v.since ?? ''}`.trim(), v.since !== null],
    [count('expired'), `last active over ${v.retentionDays} days ago, which retention would remove at once`, false],
    [count('unparseable'), 'unparseable: no entry in them could be read', true],
    [count('empty'), 'with no prompt or tool call to import', false],
    [count('duplicate'), 'with a session id already taken from another project folder', false],
    [count('full'), `left out once the database reached its ${v.maxDbMb} MB size cap (max_db_mb), so no recorded session is pushed out`, false],
  ];
  const label = v.dryRun ? 'would import' : 'imported';
  out.push(`  ${label.padEnd(12)} ${plural(imported.length, 'session')}, ${plural(events, 'event')}`);
  let first = true;
  for (const [n, what, always] of skipped) {
    if (!n && !always) continue;
    out.push(`  ${(first ? 'skipped' : '').padEnd(12)} ${n} ${what}`);
    first = false;
  }
  const { malformed, unknown } = summary.stats;
  if (malformed || unknown) {
    const parts = [malformed ? `${plural(malformed, 'malformed line')}` : '', unknown ? `${plural(unknown, 'entry')} of a type this version does not know` : ''].filter(Boolean);
    out.push(s.dim(`  Left out while reading: ${parts.join(' and ')}.`));
  }

  if (imported.length) {
    out.push('');
    for (const x of imported.slice(0, MAX_LISTED)) {
      out.push(`  ${x.sessionId.slice(0, 8)}  ${x.lastUs ? localTime(x.lastUs) : ''.padEnd(16)}  ${plural(x.events, 'event').padEnd(11)}  ${s.dim(clip(x.cwd ? v.shown(x.cwd) : '', 80))}`);
    }
    if (imported.length > MAX_LISTED) out.push(s.dim(`  and ${imported.length - MAX_LISTED} more`));
  }

  out.push('');
  if (v.dryRun) {
    out.push(s.bold('Dry run: nothing was written.') + s.dim(' Run again without --dry-run to import.'));
  } else if (imported.length) {
    out.push(
      s.dim("Every report marks these sessions as reconstructed from Claude Code's transcript, not recorded live, and lists what a transcript does not hold."),
      `Next: ${s.bold('contrail sessions')}, or ${s.bold('contrail why last')}`,
    );
  }
  return `${out.join('\n')}\n`;
}

/** The same, as data. */
export function importJson(v: ImportView): unknown {
  const { summary } = v;
  const count = (status: SessionStatus) => summary.sessions.filter(x => x.status === status).length;
  const imported = summary.sessions.filter(x => x.status === 'imported');
  return {
    dryRun: v.dryRun,
    found: summary.found,
    imported: imported.length,
    events: imported.reduce((n, x) => n + x.events, 0),
    skipped: {
      recorded: count('recorded'),
      importedBefore: count('imported-before'),
      older: count('older'),
      expired: count('expired'),
      unparseable: count('unparseable'),
      empty: count('empty'),
      duplicate: count('duplicate'),
      full: count('full'),
    },
    malformedLines: summary.stats.malformed,
    unknownEntries: summary.stats.unknown,
    sessions: summary.sessions.map(x => ({ id: x.sessionId, status: x.status, events: x.events, lastUs: x.lastUs, cwd: x.cwd })),
  };
}
