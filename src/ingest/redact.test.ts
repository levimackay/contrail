import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PATTERNS, redactString, redactValue } from './redact.ts';

// Fake credentials assembled at runtime so this file never contains a literal secret.
const repeat = (s: string, n: number) => s.repeat(n);
const SECRETS: Array<[string, string]> = [
  ['aws-access-key', `aws_key AKIA${repeat('Q', 16)} here`],
  ['github-token', `token ghp_${repeat('a1B2', 9)}`],
  ['anthropic-key', `key sk-ant-api03-${repeat('x9', 20)}`],
  ['openai-key', `OPENAI sk-proj-${repeat('Ab3', 10)}`],
  ['slack-token', `xoxb-${repeat('1234', 3)}-abcdefghij`],
  ['stripe-key', `sk_live_${repeat('Z9', 12)}`],
  ['google-api-key', `AIza${repeat('B', 35)}`],
  ['jwt', `eyJ${repeat('a', 12)}.eyJ${repeat('b', 12)}.${repeat('c', 20)}`],
  ['private-key', `-----BEGIN RSA PRIVATE KEY-----\n${repeat('MIIE', 10)}\n-----END RSA PRIVATE KEY-----`],
  ['auth-header', `Authorization: Bearer ${repeat('t0k', 8)}`],
  ['url-password', `postgres://admin:${repeat('pw9', 4)}@db.internal:5432/app`],
  ['env-secret', `OPENAI_API_KEY=${repeat('q', 30)}`],
  ['env-secret', `DB_PASSWORD="${repeat('hunter', 2)}"`],
];

for (const [rule, text] of SECRETS) {
  test(`redacts ${rule}`, () => {
    const out = redactString(text);
    assert.match(out, new RegExp(`\\[REDACTED:${rule}\\]`));
  });
}

test('keeps the name of an env secret and removes only its value', () => {
  assert.equal(redactString(`OPENAI_API_KEY=${repeat('q', 30)}`), 'OPENAI_API_KEY=[REDACTED:env-secret]');
});

const KEEP = [
  '9f3c2a1d4e5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
  '3b241101-e2bb-4255-8caf-4136c566a962',
  'toolu_01ABCDEFGHJKLMNPQRSTUVWX',
  'sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==',
  'password = os.environ["DB_PASSWORD"]',
  'API_KEY=${API_KEY}',
  'Authorization: Bearer <token>',
  'max_tokens: 1024',
  'const token = getToken()',
  'the token expired after 30 minutes',
  'npm install foo-auth-helper',
];

for (const text of KEEP) {
  test(`leaves alone: ${text.slice(0, 40)}`, () => assert.equal(redactString(text), text));
}

test('walks string leaves, including inside escaped multi-line content, and never touches keys', () => {
  const value = { tool_input: { command: 'echo hi' }, tool_response: { stdout: `line one\nGITHUB_TOKEN=ghp_${repeat('a1B2', 9)}\n` } };
  const out = redactValue(value) as typeof value;
  assert.equal(out.tool_input.command, 'echo hi');
  assert.match(out.tool_response.stdout, /GITHUB_TOKEN=\[REDACTED:(github-token|env-secret)\]/);
  assert.ok(!out.tool_response.stdout.includes('ghp_'));
});

// Found in the security audit: formats that used to survive redaction.
const MORE_SECRETS: Array<[string, string]> = [
  ['gitlab-token', `glpat-${repeat('Ab12', 6)}`],
  ['npm-token', `npm_${repeat('aB3d', 9)}`],
  ['huggingface-token', `hf_${repeat('Qw7e', 9)}`],
  ['sendgrid-key', `SG.${repeat('ab', 11)}.${repeat('cd', 22)}`],
  ['stripe-webhook-secret', `whsec_${repeat('Zx9', 9)}`],
  ['webhook-url', `https://hooks.slack.com/services/T0000/B0000/${repeat('x1', 12)}`],
  ['cookie', 'Set-Cookie: session=abc123def456; HttpOnly'],
  ['url-password', `redis://:${repeat('pw', 5)}@cache.internal:6379`],
  ['cli-password', `psql --password ${repeat('Pw9', 4)} -h db`],
  ['cli-password', `curl -u admin:${repeat('Pw9', 4)} https://api.example.com`],
  ['cli-password', `mysql -uroot -p${repeat('Pw9', 4)} app`],
  ['env-secret', 'PASSWORD="my pass phrase here"'],
  ['env-secret', `DB_PWD=${repeat('z9', 5)}`],
  ['env-secret', `MYSQL_PASS=${repeat('z9', 5)}`],
  ['env-secret', 'PASSWORD=Sup3r(Secret)123'],
  ['private-key', `-----BEGIN PGP PRIVATE KEY BLOCK-----\n${repeat('lQdG', 10)}\n-----END PGP PRIVATE KEY BLOCK-----`],
  ['auth-header', 'Authorization: Bearer AbCd1234.EfGh5678.IjKl9012'],
];
for (const [rule, text] of MORE_SECRETS) {
  test(`redacts ${rule}: ${text.slice(0, 24)}`, () => assert.match(redactString(text), new RegExp(`\\[REDACTED:${rule}\\]`)));
}

test('a password containing @ is removed whole from a URL', () => {
  const out = redactString('postgres://user:hun@ter2@db.internal/app');
  assert.equal(out, 'postgres://user:[REDACTED:url-password]@db.internal/app');
});

const MORE_KEEP = [
  'class="sk-kebab-case-css-class-name-for-spinner"',
  'docker://registry/img:tag@sha256:9f3c2a1d4e5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d',
  'mkdir -p build/output',
  'PASSTHROUGH=enabled',
];
for (const text of MORE_KEEP) {
  test(`leaves alone: ${text.slice(0, 40)}`, () => assert.equal(redactString(text), text));
}

test('an unterminated private key header does not swallow the ids after it', () => {
  const out = redactString(`-----BEGIN RSA PRIVATE KEY-----\nMIIEow\ntoolu_01ABCDEFGH more text`);
  assert.match(out, /\[REDACTED:private-key\]/);
  assert.match(out, /toolu_01ABCDEFGH more text/);
});

test('values under secret-named JSON keys are redacted whole', () => {
  const out = redactValue({
    password: 'Sup3rS3cret!xyz',
    api_key: 'abcd1234efgh5678',
    headers: { Authorization: 'Bearer abc123def456ghi' },
    env: [{ key: 'DB_PASSWORD', value: 'hunter2hunter2' }],
    max_tokens: 1024,
    tool_use_id: 'toolu_01ABCDEFGH',
  }) as Record<string, any>;
  assert.equal(out.password, '[REDACTED:secret-field]');
  assert.equal(out.api_key, '[REDACTED:secret-field]');
  assert.equal(out.headers.Authorization, '[REDACTED:secret-field]');
  assert.equal(out.env[0].value, '[REDACTED:secret-field]');
  assert.equal(out.max_tokens, 1024);
  assert.equal(out.tool_use_id, 'toolu_01ABCDEFGH');
});

test('long adversarial text redacts in linear time, not minutes', () => {
  const size = 256 * 1024;
  const inputs = [
    'a.a.'.repeat(size / 4),
    Array.from({ length: size / 12 }, (_, i) => `slug-${i}-part`).join(' '),
    'x'.repeat(size),
    Array.from({ length: size / 4 }, (_, i) => 'Ab9_-'[i % 5]).join('').repeat(4),
    'token='.repeat(size / 6),
  ];
  const start = performance.now();
  for (const s of inputs) redactString(s);
  const ms = performance.now() - start;
  // ~0.3 s alone; the quadratic version this guards against took minutes. Loose for busy CI runners.
  assert.ok(ms < 15_000, `took ${Math.round(ms)} ms`);
});

/** Finds a *, + or {n,} outside a character class: a quantifier with no upper bound. */
function unboundedQuantifier(source: string): string | undefined {
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      i++;
    } else if (inClass) {
      if (c === ']') inClass = false;
    } else if (c === '[') {
      inClass = true;
    } else if (c === '*' || c === '+' || (c === '{' && /^\{\d+,\}/.test(source.slice(i)))) {
      return source.slice(Math.max(0, i - 30), i + 1);
    }
  }
  return undefined;
}

test('every quantifier in every redaction pattern is bounded', () => {
  for (const re of PATTERNS) assert.equal(unboundedQuantifier(re.source), undefined, re.source.slice(0, 80));
});

/** Runs fn up to three times and returns the fastest, so one pause on a busy runner does not fail a test. */
function fastest(fn: () => void): number {
  let best = Infinity;
  for (let i = 0; i < 3 && best >= 200; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}
const CAP = 256 * 1024;
const fill = (unit: string, prefix = '') => prefix + unit.repeat(Math.ceil(CAP / unit.length)).slice(0, CAP);

test('a run of private key headers with no END redacts in linear time', () => {
  for (const s of [fill('-----BEGIN PRIVATE KEY-----'), fill('-----BEGIN PRIVATE KEY-----\n-----END '), fill('\\nAAAA', '-----BEGIN PRIVATE KEY-----')]) {
    const ms = fastest(() => redactString(s));
    assert.ok(ms < 200, `took ${Math.round(ms)} ms`);
  }
});

test('an unterminated private key inside JSON text, with escaped newlines, loses its body too', () => {
  const body = [repeat('MIIE', 16), repeat('ABCD', 16), repeat('x9Z+', 4)];
  const out = redactString(`{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----\\n${body.join('\\n')}\\n`);
  assert.match(out, /\[REDACTED:private-key\]/);
  for (const line of body) assert.ok(!out.includes(line), line);
});

// Token formats with a distinctive prefix. Built at runtime; no literal token appears here.
const TOKENS: Array<[string, string]> = [
  ['slack-token', `xapp-1-A${repeat('0', 10)}-${repeat('1', 13)}-${repeat('ab', 20)}`],
  ['slack-token', `xoxe-1-${repeat('My0x', 8)}`],
  ['slack-token', `xoxe.xoxp-1-${repeat('My0x', 8)}`],
  ['google-oauth-token', `ya29.a0Af${repeat('H6sM', 10)}`],
  ['google-oauth-secret', `GOCSPX-${repeat('aB3d', 7)}`],
  ['vault-token', `hvs.CAESI${repeat('Jl9U', 20)}`],
  ['vault-token', `hvb.AAAAAQ${repeat('Jx9Y', 20)}`],
  ['openai-key', `sk-proj-${repeat('abc0', 12)}`],
  ['pypi-token', `pypi-AgEIcHlwaS5vcmc${repeat('Ab9_', 16)}`],
  ['rubygems-token', `rubygems_${repeat('a1b2', 12)}`],
  ['xai-key', `xai-${repeat('Ab9x', 20)}`],
  ['groq-key', `gsk_${repeat('Ab9x', 13)}`],
  ['perplexity-key', `pplx-${repeat('Ab9x', 12)}`],
  ['replicate-token', `r8_${repeat('Ab9', 12)}x`],
  ['digitalocean-token', `dop_v1_${repeat('a1', 32)}`],
  ['shopify-token', `shpat_${repeat('a1', 16)}`],
  ['linear-key', `lin_api_${repeat('Ab9x', 10)}`],
  ['postman-key', `PMAK-${repeat('a1', 12)}-${repeat('b2', 17)}`],
  ['sentry-token', `sntrys_eyJ${repeat('pYXQ', 12)}`],
  ['databricks-token', `dapi${repeat('a1', 16)}`],
  ['doppler-token', `dp.st.prd.${repeat('Ab9x', 11)}`],
  ['supabase-key', `sbp_${repeat('a1', 20)}`],
  ['tailscale-key', `tskey-auth-k${repeat('Ab9', 4)}-${repeat('Ab9x', 8)}`],
  ['age-secret-key', `AGE-SECRET-KEY-1${repeat('QZ9', 19)}Q`],
  ['terraform-token', `${repeat('Ab9x', 3)}Ab.atlasv1.${repeat('Ab9x', 16)}`],
  ['onepassword-token', `ops_eyJ${repeat('hbGc', 16)}`],
  ['azure-client-secret', `abc1Q~${repeat('Ab9x', 8)}`],
  ['gitlab-token', `glrt-${repeat('Ab9x', 6)}`],
];
for (const [rule, text] of TOKENS) {
  test(`redacts ${rule}: ${text.slice(0, 10)}`, () => assert.equal(redactString(`key ${text} end`), `key [REDACTED:${rule}] end`));
}

test('token patterns redact hostile 256 KB input in linear time', () => {
  const inputs = [
    fill('xoxb-'), fill('xapp-1-'), fill('ya29.'), fill('hvs.a'), fill('pypi-AgE'), fill('GOCSPX-'), fill('aaaQ~'), fill('aaa1Q~b'),
    fill('sntrys_'), fill('dp.st.'), fill('tskey-a-'), fill('ops_eyJ'), fill('AAAAAAAAAAAAAA.atlasv1.'), fill('PMAK-a-'), fill('sk-proj-'),
  ];
  for (const s of inputs) {
    const ms = fastest(() => redactString(s));
    assert.ok(ms < 200, `${s.slice(0, 12)}: ${Math.round(ms)} ms`);
  }
});

const PW = repeat('Pw9', 4);
const B64 = Buffer.from(`user:${PW}`).toString('base64');

/** [what, text, the part that must not survive] */
const LEAKS: Array<[string, string, string]> = [
  // Credential files
  ['docker config auth', `{"auths":{"https://index.docker.io/v1/":{"auth":"${B64}"}}}`, B64],
  ['docker config identitytoken', `{"auths":{"r":{"identitytoken":"${PW}"}}}`, PW],
  ['kubeconfig client-key-data', `    client-key-data: ${B64}`, B64],
  ['kubeconfig client-certificate-data', `    client-certificate-data: ${B64}`, B64],
  ['kubeconfig token', `    token: ${PW}`, PW],
  ['azure AccountKey', `DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=${B64};EndpointSuffix=core.windows.net`, B64],
  ['azure SharedAccessKey', `Endpoint=sb://x.servicebus.windows.net/;SharedAccessKeyName=Root;SharedAccessKey=${B64}`, B64],
  ['npm _auth', `_auth=${B64}`, B64],
  ['npm _authToken', `_authToken=${PW}`, PW],
  ['npm registry _authToken', `//registry.npmjs.org/:_authToken=${PW}`, PW],
  // .env names
  ['ENCRYPTION_KEY', `ENCRYPTION_KEY=${repeat('9f86', 8)}`, repeat('9f86', 8)],
  ['SIGNING_KEY', `SIGNING_KEY=${B64}`, B64],
  ['APP_KEY=base64:', `APP_KEY=base64:${B64}`, B64],
  ['RAILS_MASTER_KEY', `RAILS_MASTER_KEY=${repeat('0a1b', 8)}`, repeat('0a1b', 8)],
  ['TWILIO_AUTH', `TWILIO_AUTH=${repeat('0a1b', 8)}`, repeat('0a1b', 8)],
  ['an all-digit password', 'DB_PASSWORD=123456', '123456'],
  ['a dotted password', 'PASSWORD=Summer.Winter', 'Summer'],
  ['a password with brackets', 'PASSWORD=P(ssw0rd!)', 'ssw0rd'],
  ['a quoted password that reads like code', 'password = "Hello(World).x"', 'World'],
  ['-Dapp.password=X', `java -Dspring.datasource.password=${PW} -jar app.jar`, PW],
];
for (const [what, text, secret] of LEAKS) {
  test(`redacts ${what}`, () => {
    const out = redactString(text);
    assert.ok(!out.includes(secret), out);
    assert.match(out, /\[REDACTED:/);
  });
}

// Ordinary code and config that names secrets without holding one.
const CODE = [
  'const tokenCount = 5',
  'const tokenCount = 123456',
  'password: string',
  '  password: string;',
  'password?: string',
  'privateKey: Uint8Array;',
  'apiKey: config.apiKey',
  'apiKey: config.apiKey,',
  'const apiKey = process.env.API_KEY',
  'max_tokens: 200000',
  '"input_tokens": 123456,',
  'tokenizer: "gpt2"',
  'PWD=/home/user/project',
  "credentials: 'include'",
  'const password = await getPassword()',
  'token = jwt.sign(payload, secret)',
  'password = request.form["password"]',
  'password: z.string().min(8)',
  'password = Column(String(128))',
  'this.password = password;',
  'isPrivate={isPrivate}',
  'auth: true',
  "queryKey: ['todos']",
  'sortKey: "createdAt"',
  'SECRET_NAME=prod-db-creds',
  'TOKEN_URL=https://oauth2.googleapis.com/token',
  'PASSWORD=${DB_PASSWORD}',
  'PASSWORD=$(cat /run/secrets/db)',
  'PASSWORD=<your-password>',
  'PASSWORD=changeme',
  'PASSWORD=xxxxxxxx',
  'PASSWORD=********',
  'PASSWORD=',
  '"auth": "required"',
];
for (const text of CODE) {
  test(`leaves alone: ${text.slice(0, 40)}`, () => assert.equal(redactString(text), text));
}

test('values under secret-named JSON keys are redacted whatever they look like', () => {
  const out = redactValue({ password: '123456', token: 'Summer.Winter', auth: B64, max_tokens: '1024', auths: { auth: 'required' } });
  assert.deepEqual(out, {
    password: '[REDACTED:secret-field]', token: '[REDACTED:secret-field]', auth: '[REDACTED:secret-field]', max_tokens: '1024', auths: { auth: 'required' },
  });
});

test('name patterns redact hostile 256 KB input in linear time', () => {
  const inputs = [
    fill('a_token='), fill('password="'), fill("key: '"), fill('secret:'), fill('a.b.password.'), fill('x-key-'), fill('KEY=,'),
    fill('x', 'PASSWORD='), fill('(', 'PASSWORD=ab'), fill('a.', 'PASSWORD=ab'), fill('{"auth":"a","token":"b","key":1},'),
    fill('const password = getPassword(a, b);\n'),
  ];
  for (const s of inputs) {
    const ms = fastest(() => redactString(s));
    assert.ok(ms < 200, `${JSON.stringify(s.slice(0, 16))}: ${Math.round(ms)} ms`);
  }
});
