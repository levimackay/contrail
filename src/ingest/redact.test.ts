import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactString, redactValue } from './redact.ts';

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
