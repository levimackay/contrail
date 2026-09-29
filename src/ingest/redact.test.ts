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
