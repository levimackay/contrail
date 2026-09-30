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
const PLACEHOLDER = /^(?:\$\{?[A-Za-z_]\w{0,127}\}?|<[^<>\n]{0,128}>|x{3,64}|\*{3,64}|\.{3}|changeme|your[-_a-z]{0,64})$/i;

/** Code that names a secret instead of holding one: getToken(), os.environ[, process.env.API_KEY, 1024. */
const CODE_REF = /^(?:[A-Za-z_][\w.]{0,127}(?:\(.{0,512}\)|\[.{0,512}\]|\[)|[A-Za-z_]\w{0,63}(?:\.[A-Za-z_]\w{0,63}){1,12}|\d{1,6})$/;

const namesSecret = (v: string) => PLACEHOLDER.test(v) || CODE_REF.test(v) || v.startsWith('[REDACTED');

/** JSON keys and KEY=VALUE names whose values are secrets. */
export const SECRET_NAME =
  /secret|token|passw(?:or)?d|pass(?:phrase)?(?![a-z])|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|authorization|cookie/i;

const PEM_BEGIN = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
const PEM_END = /-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
/** An unterminated key (truncated output) takes only whole base64 lines, split by real or JSON-escaped newlines. */
const PEM_BODY = /(?:(?:\r?\n|\\r\\n|\\n)[A-Za-z0-9+/=]{1,1024}(?=\r?\n|\\[rn]|["']|$)){0,1024}/y;
const PEM_SPAN = 65536;

/**
 * Private key blocks, found in one pass: every END marker is located once, and each BEGIN
 * takes the first END after it, so a run of headers with no END costs linear time.
 */
function redactPrivateKeys(s: string): string {
  if (!s.includes('PRIVATE KEY')) return s;
  const ends: Array<[number, number]> = [];
  for (const m of s.matchAll(PEM_END)) ends.push([m.index, m.index + m[0].length]);
  let out = '';
  let last = 0;
  let e = 0;
  PEM_BEGIN.lastIndex = 0;
  for (let m = PEM_BEGIN.exec(s); m; m = PEM_BEGIN.exec(s)) {
    const headerEnd = m.index + m[0].length;
    while (e < ends.length && ends[e]![0] < headerEnd) e++;
    let stop: number;
    if (e < ends.length && ends[e]![0] - headerEnd <= PEM_SPAN) {
      stop = ends[e]![1];
    } else {
      PEM_BODY.lastIndex = headerEnd;
      PEM_BODY.exec(s);
      stop = PEM_BODY.lastIndex;
    }
    out += s.slice(last, m.index) + tag('private-key');
    last = stop;
    PEM_BEGIN.lastIndex = stop;
  }
  return out + s.slice(last);
}

const RULES: Rule[] = [
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: 'gitlab-token', re: /\bgl(?:pat|dt|ptt|rt|cbt|imt|agent|soat|ffct|oas)-[A-Za-z0-9_.-]{20,128}/g },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'pypi-token', re: /\bpypi-AgE[A-Za-z0-9_-]{50,1024}/g },
  { id: 'rubygems-token', re: /\brubygems_[a-f0-9]{48}\b/g },
  { id: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,64}\b/g },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,256}/g },
  {
    id: 'openai-key',
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,256}/g,
    // A project, service or admin key is always one; a bare sk- key mixes digits and capitals, and a kebab-case CSS class does not.
    replace: m => (/^sk-(?:proj|svcacct|admin)-/.test(m) || (/\d/.test(m) && /[A-Z]/.test(m)) ? tag('openai-key') : m),
  },
  { id: 'xai-key', re: /\bxai-[A-Za-z0-9]{40,128}\b/g },
  { id: 'groq-key', re: /\bgsk_[A-Za-z0-9]{48,64}\b/g },
  { id: 'perplexity-key', re: /\bpplx-[A-Za-z0-9]{40,64}\b/g },
  { id: 'replicate-token', re: /\br8_[A-Za-z0-9]{30,64}\b/g },
  { id: 'slack-token', re: /\b(?:xox(?:[abposre]|e\.xox[bp])-|xapp-\d-)[A-Za-z0-9-]{10,256}/g },
  {
    id: 'webhook-url',
    re: /https:\/\/(?:hooks\.slack\.com\/services|(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks)\/[A-Za-z0-9/_-]{8,256}/g,
  },
  { id: 'stripe-key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,256}/g },
  { id: 'stripe-webhook-secret', re: /\bwhsec_[A-Za-z0-9]{24,256}/g },
  { id: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{16,128}/g },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { id: 'google-oauth-token', re: /\bya29\.[A-Za-z0-9_-]{20,4096}/g },
  { id: 'google-oauth-secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,64}/g },
  {
    id: 'vault-token',
    re: /\bhv[sbr]\.[A-Za-z0-9_-]{20,1024}/g,
    replace: m => (/\d/.test(m) && /[A-Z]/.test(m) ? tag('vault-token') : m),
  },
  { id: 'digitalocean-token', re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g },
  { id: 'shopify-token', re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g },
  { id: 'linear-key', re: /\blin_api_[A-Za-z0-9]{40}\b/g },
  { id: 'postman-key', re: /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/g },
  { id: 'sentry-token', re: /\bsntry[su]_[A-Za-z0-9+/=_-]{40,1024}/g },
  { id: 'databricks-token', re: /\bdapi[a-f0-9]{32}(?:-\d)?\b/g },
  { id: 'doppler-token', re: /\bdp\.(?:st|sa|ct|pt|scim|audit)\.[A-Za-z0-9_.-]{40,128}/g },
  { id: 'supabase-key', re: /\b(?:sbp_[a-f0-9]{40}\b|sb_secret_[A-Za-z0-9_-]{20,128})/g },
  { id: 'tailscale-key', re: /\btskey-[a-z]{1,16}-[A-Za-z0-9]{8,64}-[A-Za-z0-9]{16,128}/g },
  { id: 'age-secret-key', re: /\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/g },
  { id: 'terraform-token', re: /\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,128}/g },
  { id: 'onepassword-token', re: /\bops_eyJ[A-Za-z0-9+/=_-]{50,8192}/g },
  { id: 'azure-client-secret', re: /(?<![A-Za-z0-9_~.-])[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}(?![A-Za-z0-9_~.-])/g },
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
  let out = redactPrivateKeys(s);
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

/** Every pattern this module runs, for the test that checks each quantifier is bounded. */
export const PATTERNS: RegExp[] = [...RULES.map(r => r.re), PLACEHOLDER, CODE_REF, SECRET_NAME, PEM_BEGIN, PEM_END, PEM_BODY];
