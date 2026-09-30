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
const isTag = (v: string) => v.startsWith('[REDACTED');

/** Obvious stand-ins, never secrets: $VAR, ${VAR}, $(cmd), {{ template }}, <placeholder>, xxx, ***, changeme. */
const PLACEHOLDER =
  /^(?:\$\{?[A-Za-z_]\w{0,127}\}?|\$\(.{0,512}|\$?\{\{.{0,256}\}\}|%[A-Za-z_]\w{0,127}%|<[^<>\n]{0,128}>|x{3,64}|\*{3,64}|\.{3}|…|change[-_]?me|your[-_a-z]{0,64}|redacted|placeholder)$/i;

/** Values that are words in code or config, not secrets: `auth: true`, `password: string`, `credentials: 'include'`. */
const KEYWORD =
  /^(?:true|false|yes|no|on|off|null|nil|none|undefined|empty|required|optional|enabled|disabled|include|omit|same-origin|string|str|number|int|bool|boolean|bytes|any|unknown|object|SecretStr|await|new|yield|typeof|lambda|function|async|not|infer|keyof)$/i;

/**
 * A type after a colon is an annotation: token: Buffer, sharedKey: ArrayBuffer, key: Uint8Array[].
 * Each capitalised word is letters, with only a bit width after it (Uint8Array), so Pw9Pw9, P4SSW0RD
 * and Hunter2 are not types.
 */
const TYPE_NAME = /^(?:[A-Z][a-z]{2,31}(?:8|16|32|64)?){1,8}(?:<[\w$<>, |[\].]{0,128}>)?(?:\[\])?$/;

const ID = String.raw`[A-Za-z_$][\w$]{0,63}`;
const ARG = String.raw`(?:"[^"\n]{0,128}"|'[^'\n]{0,128}'|${ID}(?:\.${ID}){0,8}|\d{1,10})`;
/**
 * A call or lookup on a named function or object: getToken(), get_secret("db"), os.environ["X"],
 * z.string().min(8), or one cut short at a quote or space (getenv(, jwt.sign(payload). The name
 * takes two characters or more and nothing but code follows a closing bracket, so P(ssw0rd!) and
 * Sup3r(Secret)123 are passwords, not calls.
 */
const CALL_START = /^(?:[A-Za-z_$][\w$]{1,63}|[A-Za-z_$](?=\??\.))(?:\??\.[A-Za-z_$][\w$]{0,63}){0,12}[([]/;
const CODE_CHARS = /^[\w$.?,'"\s()[\]:=/+*-]{0,1024}$/;
const AFTER_BRACKET = /[)\]][\w$]/;
/** A member of something that holds settings: process.env.X, config.apiKey, self.password, import.meta.env.X. */
const MEMBER = new RegExp(
  String.raw`^(?:process|import\.meta|os|env|Deno|Bun|System|config|cfg|conf|settings|options|opts|props|args|argv|params|parameters|inputs|secrets|vars|variables|credentials|creds|ctx|context|req|request|app|window|globalThis|global|module|exports|this|self|cls|data|values|form|state|store|environment|vault|session|user|account|client|locals|kwargs|payload|body|headers|query|github|steps|needs|matrix|Rails)(?:\??\.${ID}|\[${ARG}\]){1,12}$`,
  'i',
);
const CHAIN = new RegExp(String.raw`^${ID}(?:\.${ID}){0,12}$`);
/** A JSX or template expression: {apiKey}, {props.token}. */
const EXPRESSION = /^\{[\w$.?()[\] ,]{1,256}\}$/;

/**
 * A value that names or stands in for a secret instead of holding one. A quoted value is a string
 * literal, not code, so only a placeholder or keyword excuses it.
 */
function namesSecret(value: string, name = '', literal = false): boolean {
  if (value === '' || isTag(value) || PLACEHOLDER.test(value) || KEYWORD.test(value)) return true;
  if (literal) return false;
  if (CALL_START.test(value) && CODE_CHARS.test(value) && !AFTER_BRACKET.test(value)) return true;
  if (MEMBER.test(value) || EXPRESSION.test(value)) return true;
  if (CHAIN.test(value)) {
    const parts = value.split('.');
    const tail = name.slice(name.lastIndexOf('.') + 1);
    // Passing a variable on under its own name: password=password, api_key=self.api_key.
    if (flat(parts[parts.length - 1]!) === flat(tail)) return true;
    // A variable named for a secret: password=db_password, token=tokenInput.value. Summer.Winter is not one.
    if (/[_.]|[a-z][A-Z]/.test(value) && parts.some(isSecretName)) return true;
  }
  return false;
}

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** CamelCase and snake_case words, lower-cased: SecretAccessKey → secret, access, key. */
function segments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]{1,64}/)
    .filter(Boolean);
}

/** Words that alone make a name secret, in any case and position. */
const STRONG = /secret|passw(?:or)?d|passphrase|credential|authori[sz]ation|cookie|^pass$|^pw$|pwd$|^creds?$|(?:api|access|private|signing|master|encryption|auth|app)key|token(?!s$|iz)/;
/** Words that make a name secret when it is an environment variable (APP_KEY, TWILIO_AUTH), or end it (basicAuth). */
const WEAK = new Set(['key', 'auth', 'private', 'master', 'signing', 'encryption', 'crypt']);
/** A lower- or camel-case name ending in key is secret after one of these: apiKey, signing_key, client-key-data. */
const KEY_QUALIFIER = new Set([
  'api', 'app', 'access', 'secret', 'private', 'master', 'signing', 'sign', 'encryption', 'encrypt', 'crypto', 'cipher',
  'hmac', 'jwt', 'auth', 'client', 'license', 'licence', 'service', 'account', 'shared', 'webhook', 'deploy', 'ssh',
  'gpg', 'pgp', 'aes', 'rsa', 'consumer', 'subscription', 'session', 'csrf', 'admin', 'root', 'write', 'storage',
]);
/** A name ending in one of these holds something about a secret, not the secret: TOKEN_URL, token_file, password_min_length. */
const ABOUT = new Set([
  'file', 'files', 'path', 'dir', 'directory', 'filename', 'fd', 'stdin', 'url', 'uri', 'endpoint', 'host', 'hostname', 'port',
  'name', 'names', 'id', 'ids', 'type', 'types', 'kind', 'length', 'len', 'size', 'count', 'limit', 'max', 'min', 'budget',
  'usage', 'used', 'ttl', 'timeout', 'expiry', 'expires', 'expiration', 'lifetime', 'prefix', 'suffix', 'field', 'env',
  'mode', 'method', 'provider', 'policy', 'algorithm', 'alg', 'version', 'format', 'encoding', 'strategy', 'scheme', 'helper',
  'enabled', 'disabled', 'required', 'rotation', 'hint', 'prompt', 'label', 'placeholder', 'description', 'title', 'message',
  'error', 'user', 'username', 'email', 'ip', 'address', 'domain', 'issuer', 'audience', 'scope', 'scopes', 'callback',
  'redirect', 'store', 'backend', 'driver', 'manager', 'command', 'cmd',
]);
/** Names that are secret only as whole names: Docker's and npm's "auth", kubeconfig's certificate data. */
const WHOLE = new Set(['auth', 'identitytoken', 'clientcertificatedata']);

/** Is this the name of a setting whose value is a secret? DB_PASSWORD, apiKey, client-key-data: yes. max_tokens, TOKEN_URL, PWD: no. */
export function isSecretName(name: string): boolean {
  if (/^(?:old)?pwd$/i.test(name)) return false; // the shell's working directory
  const segs = segments(name);
  if (segs.length === 0 || ABOUT.has(segs[segs.length - 1]!)) return false;
  if (WHOLE.has(segs.join(''))) return true;
  const envStyle = !/[a-z]/.test(name);
  return segs.some((s, i) => {
    if (STRONG.test(s)) return true;
    if (s === 'key') return envStyle || (i > 0 && KEY_QUALIFIER.has(segs[i - 1]!));
    return WEAK.has(s) && (envStyle || (segs.length > 1 && i === segs.length - 1));
  });
}

/** A Docker or npm "auth" value is base64 user:password; "auth": "required" is not. */
const BASE64ISH = /^[A-Za-z0-9+/=_-]{8,8192}$/;
const credentialBlob = (v: string) => BASE64ISH.test(v) && (/[0-9+/=]/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v)));

/** Does a value stored under this name look like the secret itself? */
function secretValue(name: string, value: string, literal = false): boolean {
  if (!isSecretName(name) || namesSecret(value, name, literal)) return false;
  return flat(name) === 'auth' ? credentialBlob(value) : true;
}

/** The bare value's last character when it is sentence or list punctuation, not part of the secret. */
function splitTrailing(value: string): [string, string] {
  let end = value.length;
  while (end > 0) {
    const c = value[end - 1]!;
    const opener = c === ')' ? '(' : c === ']' ? '[' : c === '}' ? '{' : '';
    if (c === ',' || c === '.') end--;
    else if (opener && count(value.slice(0, end), c) > count(value.slice(0, end), opener)) end--;
    else break;
  }
  return [value.slice(0, end), value.slice(end)];
}
const count = (s: string, c: string) => s.split(c).length - 1;

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

/**
 * A name, then = : => := or a typed assignment (password: str =), then maybe a Bearer/Basic scheme.
 * A name starts only where a run of name characters starts (or after a flag's dash, as in
 * -Dapp.password=), so a long a-b-c-key-… run is tried once, not at every word in it.
 */
const NAME = String.raw`(?<![A-Za-z0-9_.])(?<![A-Za-z0-9_.]-)(?=[A-Za-z_])([A-Za-z0-9_.-]{0,128}(?:secret|token|pass|pwd|pw|key|auth|credential|cred|private|master|signing|encryption|crypt|cookie|certificate)[A-Za-z0-9_.-]{0,64})`;
const SEP = String.raw`(["']?[ \t]{0,4}(?::[ \t]{0,4}[A-Za-z_][\w.[\]|]{0,40}[ \t]{1,4}=(?![=>~])|:=|=>|:(?!:)|=(?![=>~]))[ \t]{0,4})`;
/** A bare value runs to whitespace or a quote, and stops at a , or & that starts the next name=value. */
const BARE = String.raw`((?:[^\s"'\`;&,]|[&,](?![ \t]{0,4}["']?[A-Za-z_][\w.-]{0,64}["']?[ \t]{0,4}[:=])){1,16384})`;
const QUOTED = String.raw`"((?:[^"\\\n]|\\.){1,16384})"|'([^'\n]{1,16384})'`;

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
      PLACEHOLDER.test(value!) || isTag(value!) ? m : `${name}${sep}${scheme ?? ''}${tag('auth-header')}`,
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
    re: new RegExp(`${NAME}${SEP}((?:bearer|basic|token)[ \\t]{1,4})?(?:${QUOTED}|${BARE})`, 'gi'),
    replace: (m, name, sep, scheme, dq, sq, bare) => {
      if (dq !== undefined || sq !== undefined) {
        const value = dq ?? sq ?? '';
        if (!secretValue(name!, value, true)) return m;
        const quote = dq !== undefined ? '"' : "'";
        return `${name}${sep}${scheme ?? ''}${quote}${tag('env-secret')}${quote}`;
      }
      const [value, trailing] = splitTrailing(bare ?? '');
      if (value.length < 4 || !secretValue(name!, value)) return m;
      if (/^["']?[ \t]*:[ \t]*$/.test(sep!) && TYPE_NAME.test(value)) return m; // secret: NonSharedBuffer
      return `${name}${sep}${scheme ?? ''}${tag('env-secret')}${trailing}`;
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
    if (key && secretValue(key, value, true)) return tag('secret-field');
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map(v => redactValue(v));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const pairName = typeof o.key === 'string' ? o.key : typeof o.name === 'string' ? o.name : '';
    const secretPair = pairName !== '' && isSecretName(pairName);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, redactValue(v, secretPair && k === 'value' ? 'secret' : k)]),
    );
  }
  return value;
}

/** Every pattern this module runs, for the test that checks each quantifier is bounded. */
export const PATTERNS: RegExp[] = [
  ...RULES.map(r => r.re),
  PLACEHOLDER, KEYWORD, TYPE_NAME, CALL_START, CODE_CHARS, AFTER_BRACKET, MEMBER, CHAIN, EXPRESSION, STRONG, BASE64ISH,
  PEM_BEGIN, PEM_END, PEM_BODY,
];
