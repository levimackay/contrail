import { stringLeaves } from '../util.ts';
import { findInInput } from './context.ts';
import { sensitivity, type Sensitivity } from './risks.ts';
import { findNormalized, lineOf, normalize } from './text.ts';
import type { Action, Graph, Input } from './types.ts';

export interface Sighting {
  seq: number;
  /** an input that held the value, with the line it sits on */
  source?: { input: Input; line: number | null; text: string };
  /** a tool call whose arguments contain the value */
  use?: { action: Action; argPath: string; kinds: Sensitivity[] };
}

/**
 * Every place one value appears in a session, in order: the inputs that held it (whole-token
 * match, as grading uses) and the calls whose arguments contain it. Pure, and it grades
 * nothing: it lists where the value was seen.
 */
export function findValue(g: Graph, value: string): Sighting[] {
  const needle = normalize(value.trim());
  if (!needle) return [];
  // Contrail's own queries (a /contrail: command, a contrail run through the shell, and what it
  // printed) hold the value only because someone searched for it.
  const own = new Set(g.actions.filter(runsContrail).map(a => a.id));
  const out: Sighting[] = [];
  for (const input of g.inputs) {
    if ((input.producedBy && own.has(input.producedBy)) || (input.origin === 'prompt' && /^\s*\/contrail:/.test(input.text))) continue;
    const index = findInInput(input, needle, g.hashToken);
    if (index < 0) continue;
    const { line, text } = lineOf(input.text, index);
    out.push({ seq: input.availableAt, source: { input, line, text: input.hashed ? '' : text } });
  }
  for (const action of g.actions) {
    if (own.has(action.id)) continue;
    const leaf = stringLeaves(action.input).find(l => findNormalized(normalize(l.value), needle) >= 0);
    if (leaf) out.push({ seq: action.preSeq, use: { action, argPath: leaf.path, kinds: sensitivity(action) } });
  }
  return out.sort((a, b) => a.seq - b.seq || Number(Boolean(a.use)) - Number(Boolean(b.use)));
}

function runsContrail(a: Action): boolean {
  const command = a.tool === 'Bash' ? stringLeaves(a.input).find(l => l.path === '$.command')?.value ?? '' : '';
  return /(^|[\s;&|(/])(bin\/contrail|contrail)\s+(why|blame|find|trace|risks|sessions|report|export|doctor|statusline)\b/.test(command);
}
