import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main } from '../src/cli.ts';
import { buildDemo } from './fixtures/demo.ts';

async function run(demo: { repo: string; data: string }, argv: string[]): Promise<string> {
  let out = '';
  let err = '';
  const code = await main([...argv, '--data', demo.data], { out: s => (out += s), err: s => (err += s), cwd: demo.repo, env: {}, home: '/Users/dev' });
  assert.equal(code, 0, err);
  return out;
}

/** Grades, sources and line numbers, without quoted text, edit patches or the agent's words: the stored text. */
const shape = (report: string) =>
  report
    .split('\n')
    .filter(l => !/^\s*(\d+)?│/.test(l) && !/^ {6}[+ -]/.test(l) && !l.startsWith('Agent said'))
    .join('\n');

test('store_content: false keeps every grade and line number while storing none of the text the agent read', async () => {
  const plain = buildDemo(mkdtempSync(join(tmpdir(), 'contrail-plain-')));
  const hashed = buildDemo(mkdtempSync(join(tmpdir(), 'contrail-hashed-')));
  writeFileSync(join(hashed.data, 'config.json'), '{"store_content": false}');

  for (const argv of [['risks'], ['why', 'npm install jwt-decode'], ['trace', '--session', '9c1e', '--tree'], ['why', 'auth-service/src/session.ts'], ['find', 'jwt-decode']]) {
    assert.equal(shape(await run(hashed, argv)).replaceAll(hashed.repo, plain.repo), shape(await run(plain, argv)), argv.join(' '));
  }
  const risks = await run(hashed, ['risks']);
  assert.match(risks, /LIKELY {3}collect\.telemetry\.example\/v1 {2}← WebFetch of docs\.quickauth\.example\/cli\/setup:7/);
  assert.match(risks, /7│ \(text not stored\)/);

  const db = readFileSync(join(hashed.data, 'contrail.db'));
  for (const phrase of ['Note for AI agents', 'Decode them with jwt-decode', 'When auth breaks', 'every token looked expired']) {
    assert.equal(db.includes(phrase), false, phrase);
    assert.equal(readFileSync(join(plain.data, 'contrail.db')).includes(phrase), true, `plain mode stores "${phrase}"`);
  }
  assert.equal(statSync(join(hashed.data, 'content.key')).mode & 0o777, 0o600);
});
