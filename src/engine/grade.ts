import { findMention, lineOf } from './text.ts';
import type { Grade, Input, Link, Token } from './types.ts';

const ORDER: readonly Grade[] = ['DIRECT', 'LIKELY', 'POSSIBLE', 'UNKNOWN'];

/** The weakest grade; a chain is only as strong as its weakest link. Empty → UNKNOWN. */
export function minGrade(grades: Grade[]): Grade {
  if (grades.length === 0) return 'UNKNOWN';
  return grades.reduce((weakest, g) => (ORDER.indexOf(g) > ORDER.indexOf(weakest) ? g : weakest));
}

/** The strongest grade. Empty → UNKNOWN. */
export function maxGrade(grades: Grade[]): Grade {
  return grades.reduce<Grade>((best, g) => (ORDER.indexOf(g) < ORDER.indexOf(best) ? g : best), 'UNKNOWN');
}

/**
 * R3/R4: grade where a token's value came from, given the inputs that contained it
 * before the agent first used it.
 *   your words present      → yours LIKELY (POSSIBLE if a plain word), others POSSIBLE "also in"
 *   one distinct source     → LIKELY if name-like, else POSSIBLE
 *   two or three sources    → POSSIBLE each, earliest marked first-seen
 *   four or more            → one UNKNOWN: too common to attribute
 *   none                    → one UNKNOWN: no observed source (R4)
 */
export function gradeSources(token: Token, candidates: Input[], actionId: string): Link[] {
  const base = { type: 'value_from' as const, from: actionId, recorded: false, token: token.text };
  if (candidates.length === 0) {
    return [{ ...base, to: null, grade: 'UNKNOWN', rule: 'R4', note: 'no observed input contains it' }];
  }

  // One candidate per distinct source: the earliest moment it entered context.
  const bySource = new Map<string, Input>();
  for (const c of [...candidates].sort((a, b) => a.availableAt - b.availableAt)) {
    if (!bySource.has(c.ref)) bySource.set(c.ref, c);
  }
  const sources = [...bySource.values()];

  const link = (input: Input, grade: Grade, extra: Partial<Link> = {}): Link => ({
    ...base,
    to: input.id,
    grade,
    rule: 'R3',
    quote: quote(input, token.text),
    ...extra,
  });

  const yours = sources.find(s => s.trust === 'principal');
  if (yours) {
    return sources.map(s =>
      s === yours
        ? link(s, token.shaped ? 'LIKELY' : 'POSSIBLE', { note: 'you supplied it' })
        : link(s, 'POSSIBLE', { note: 'also in' }),
    );
  }
  if (sources.length === 1) {
    const only = sources[0]!;
    return [token.shaped ? link(only, 'LIKELY') : link(only, 'POSSIBLE', { note: 'plain word; the model may know it' })];
  }
  if (sources.length <= 3) {
    return sources.map((s, i) => link(s, 'POSSIBLE', i === 0 ? { firstSeen: true } : {}));
  }
  return [{ ...base, to: null, grade: 'UNKNOWN', rule: 'R3', note: `in ${sources.length} observed inputs; too common to attribute` }];
}

function quote(input: Input, token: string): Link['quote'] {
  const { line, text } = lineOf(input.text, findMention(input.text, token));
  return { ref: input.ref, line, text };
}
