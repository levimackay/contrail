import { findMention } from './text.ts';
import type { Action, RequestVerdict, Sentence, Token } from './types.ts';

// Whole words only: "not-found.tsx" and "no-cache" are names, not negations.
const NEGATOR = /(?<![\w./-])(?:not|never|no|without|avoid|stop|skip|instead of|rather than)(?![\w-])|n't(?![\w-])/i;

/** Your prompt as sentences, with fenced pastes removed: pasted text is not something you asked for. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, '\n')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * R8: do your own words name what this action acts on?
 * A claim about your words only, never about intent or permission.
 * Each target group must be named somewhere before the action; for each group the latest
 * matching sentence counts, and a negated latest mention ("actually don't …") is flagged.
 */
export function requested(action: Action, tokens: Token[], sentences: Sentence[]): RequestVerdict {
  const before = sentences.filter(s => s.seq < action.preSeq);
  const searched = before.length;

  const groups = new Map<number, Token[]>();
  for (const t of tokens) {
    if (t.role === 'target' && t.group !== null) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  }
  if (groups.size === 0) return { verdict: 'NOTHING_TO_MATCH', grade: 'UNKNOWN', searched };

  const kept: Array<{ sentence: Sentence; token: Token; strong: boolean }> = [];
  for (const alternatives of groups.values()) {
    let latest: (typeof kept)[number] | null = null;
    for (const s of before) {
      const hit =
        alternatives.find(t => !t.derived && findMention(s.text, t.text) >= 0) ??
        alternatives.find(t => findMention(s.text, t.text) >= 0);
      if (hit) latest = { sentence: s, token: hit, strong: !hit.derived };
    }
    if (latest) kept.push(latest);
  }

  if (kept.length === 0) return { verdict: 'NOT_NAMED', grade: 'UNKNOWN', searched };

  const negated = kept.find(k => NEGATOR.test(k.sentence.text));
  if (negated) {
    return { verdict: 'NAMED_NEGATED', grade: 'POSSIBLE', searched, sentence: negated.sentence, matched: negated.token.text };
  }
  // Quote your most recent words about it: "commit it" over the task you set two turns ago.
  const latest = kept.reduce((a, b) => (b.sentence.seq > a.sentence.seq ? b : a));
  const verdict = kept.length === groups.size && kept.every(k => k.strong) ? 'NAMED' : 'PARTLY_NAMED';
  return {
    verdict,
    grade: verdict === 'NAMED' ? 'LIKELY' : 'POSSIBLE',
    searched,
    sentence: latest.sentence,
    matched: latest.token.text,
  };
}
