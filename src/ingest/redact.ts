/**
 * Secret redaction, applied to every string before anything is stored.
 *
 * Rule-based, not entropy-based: entropy checks flag git SHAs, UUIDs and tool
 * ids, which are exactly the keys provenance joins on. Every quantifier is
 * bounded so a long run of text can't make a pattern backtrack for minutes.
 * Provider patterns are adapted from gitleaks (MIT) and secretlint (MIT).
 */

type Replace = (match: string, ...groups: string[]) => string;

interface Rule {
  id: string;
  re: RegExp;
  replace?: Replace;
}

const tag = (id: string) => `[REDACTED:${id}]`;

/** Obvious stand-ins, never secrets. */
const PLACEHOLDER = /^(?:\$\{?[A-Za-z_]\w*\}?|<[^>]*>|x{3,}|\*{3,}|\.{3}|changeme|your[-_a-z]*)$/i;

/** Code that names a secret instead of holding one: getToken(), os.environ[, process.env.API_KEY, 1024. */
const CODE_REF = /^(?:[A-Za-z_][\w.]*(?:\(.*\)|\[.*\]|\[)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|\d{1,6})$/;

const namesSecret = (v: string) => PLACEHOLDER.test(v) || CODE_REF.test(v) || v.startsWith('[REDACTED');

/** JSON keys and KEY=VALUE names whose values are secrets. */
export const SECRET_NAME =
  /secret|token|passw(?:or)?d|pass(?:phrase)?(?![a-z])|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|cookie/i;

const RULES: Rule[] = [
  {
    id: 'private-key',
    // Unterminated keys (truncated output) take only whole base64 lines, so the text after them survives.
    re: /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]{0,65536}?-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----|(?:\r?\n[A-Za-z0-9+/=]{1,128}(?=\r?\n|$)){0,1024})/g,
  },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,64}/g },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,64}\b/g },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,256}/g },
  {
    id: 'openai-key',
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,256}/g,
    // Real keys mix digits and capitals; a kebab-case CSS class does not.
    replace: m => (/\d/.test(m) && /[A-Z]/.test(m) ? tag('openai-key') : m),
  },
  { id: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,256}/g },
  {
    id: 'webhook-url',
    re: /https:\/\/(?:hooks\.slack\.com\/services|(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks)\/[A-Za-z0-9/_-]{8,256}/g,
  },
  { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,256}/g },
  { id: 'stripe-webhook-secret', re: /\bwhsec_[A-Za-z0-9]{24,256}/g },
  { id: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,128}/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,8192}\.eyJ[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{8,8192}/g },
  { id: 'azure-sas', re: /([?&]sig=)[A-Za-z0-9%+/=]{16,512}/g, replace: (_m, prefix) => `${prefix}${tag('azure-sas')}` },
  {
    id: 'auth-header',
    re: /\b((?:proxy-)?authorization|x-api-key)(["']?\s{0,4}[:=]\s{0,4}["']?)((?:bearer|basic|token)\s{1,4})?([^\s"',;]{1,4096})/gi,
    replace: (m, name, sep, scheme, value) =>
      PLACEHOLDER.test(value!) || value!.startsWith('[REDACTED') ? m : `${name}${sep}${scheme ?? ''}${tag('auth-header')}`,
  },
  {
    id: 'cookie',
    re: /\b((?:set-)?cookie)(\s{0,4}:\s{0,4})[^\r\n]{1,4096}/gi,
    replace: (_m, name, sep) => `${name}${sep}${tag('cookie')}`,
  },
  {
    id: 'url-password',
    // Greedy up to the last @ so a password containing @ is fully removed; container digests are not credentials.
    re: /\b([a-z][a-z0-9+.-]{0,31}:\/\/[^\s:@/]{0,256}:)([^\s/]{1,256})@(?!sha256:)/gi,
    replace: (m, prefix, password) => (PLACEHOLDER.test(password!) ? m : `${prefix}${tag('url-password')}@`),
  },
  {
    id: 'cli-password',
    re: /((?:^|\s)--(?:password|passwd|pass)(?:=|\s{1,4}))(["']?)([^\s"']{1,256})/g,
    replace: (m, flag, quote, value) => (PLACEHOLDER.test(value!) ? m : `${flag}${quote}${tag('cli-password')}`),
  },
  {
    id: 'cli-password',
    re: /((?:^|\s)(?:-u|--user)(?:=|\s{1,4})["']?[^\s:"']{1,128}:)([^\s"']{1,256})/g,
    replace: (_m, prefix) => `${prefix}${tag('cli-password')}`,
  },
  {
    id: 'cli-password',
    re: /(\bmysql(?:dump|admin)?\b[^\n]{0,200}?\s-p)([^\s-][^\s]{2,255})/g,
    replace: (_m, prefix) => `${prefix}${tag('cli-password')}`,
  },
  {
    id: 'env-secret',
    re: /\b([A-Za-z0-9_.-]{0,64}(?:secret|token|passw(?:or)?d|pass(?:phrase)?(?![a-z])|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_]{0,64})(["']?\s{0,4}[:=]\s{0,4})(?:(["'])([^"'\n]{6,512})\3|([^\s"',;]{6,512}))/gi,
    replace: (m, key, sep, quote, quoted, bare) => {
      const value = quoted ?? bare ?? '';
      if (namesSecret(value)) return m;
      return quote ? `${key}${sep}${quote}${tag('env-secret')}${quote}` : `${key}${sep}${tag('env-secret')}`;
    },
  },
];

export function redactString(s: string): string {
  let out = s;
  for (const rule of RULES) {
    const replace: Replace = rule.replace ?? (() => tag(rule.id));
    out = out.replace(rule.re, replace);
  }
  return out;
}

/**
 * Redacts every string in a JSON value. Walks decoded strings rather than the serialized
 * JSON, because \n escapes break pattern boundaries. A string stored under a secret-named
 * key ({"password": "…"}, or {"key": "DB_PASSWORD", "value": "…"}) is redacted whole.
 */
export function redactValue(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (key && SECRET_NAME.test(key) && value.length >= 6 && !namesSecret(value)) return tag('secret-field');
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map(v => redactValue(v));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const pairName = typeof o.key === 'string' ? o.key : typeof o.name === 'string' ? o.name : '';
    const secretPair = pairName !== '' && SECRET_NAME.test(pairName);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, redactValue(v, secretPair && k === 'value' ? 'secret' : k)]),
    );
  }
  return value;
}
