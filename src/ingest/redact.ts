/**
 * Secret redaction, applied to every string before anything is stored.
 *
 * Deliberately rule-based, not entropy-based: entropy checks flag git SHAs,
 * UUIDs and tool ids, which are exactly the keys provenance joins on.
 * Provider patterns are adapted from gitleaks (MIT) and secretlint (MIT).
 */

interface Rule {
  id: string;
  re: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const tag = (id: string) => `[REDACTED:${id}]`;

/** Values that name a secret instead of containing one. */
const NOT_A_SECRET =
  /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|<[^>]*>|x{3,}|\*{3,}|\.{3}|changeme|your[-_a-z]*|.*[([].*|[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+|\d+)$/i;

const whole = (id: string): Rule['replace'] => () => tag(id);

const RULES: Rule[] = [
  {
    id: 'private-key',
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    replace: whole('private-key'),
  },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g, replace: whole('aws-access-key') },
  {
    id: 'github-token',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
    replace: whole('github-token'),
  },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, replace: whole('anthropic-key') },
  { id: 'openai-key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, replace: whole('openai-key') },
  { id: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, replace: whole('slack-token') },
  { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, replace: whole('stripe-key') },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/g, replace: whole('google-api-key') },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: whole('jwt') },
  {
    id: 'auth-header',
    re: /\b((?:proxy-)?authorization|x-api-key)(["']?\s*[:=]\s*["']?)((?:bearer|basic|token)\s+)?([^\s"',;]+)/gi,
    replace: (m, name, sep, scheme, value) =>
      NOT_A_SECRET.test(value!) || value!.startsWith('[REDACTED') ? m : `${name}${sep}${scheme ?? ''}${tag('auth-header')}`,
  },
  {
    id: 'url-password',
    re: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)@/gi,
    replace: (m, prefix, password) => (NOT_A_SECRET.test(password!) ? m : `${prefix}${tag('url-password')}@`),
  },
  {
    id: 'env-secret',
    re: /\b([A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d?|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_]*)(["']?\s*[:=]\s*)(["']?)([^\s"',;]{6,})/gi,
    replace: (m, key, sep, quote, value) =>
      NOT_A_SECRET.test(value!) || value!.startsWith('[REDACTED') ? m : `${key}${sep}${quote ?? ''}${tag('env-secret')}`,
  },
];

export function redactString(s: string): string {
  let out = s;
  for (const rule of RULES) out = out.replace(rule.re, rule.replace as (m: string, ...g: string[]) => string);
  return out;
}

/** Redacts every string leaf. Walking leaves (not the serialized JSON) keeps \n escapes from hiding secrets. */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)]));
  }
  return value;
}
