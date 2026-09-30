import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkAction } from './fixtures.ts';
import { extractTokens } from './tokens.ts';

const env = { cwd: '/Users/dev/acme-app', home: '/Users/dev', user: 'dev' };
const texts = (tool: string, input: Record<string, unknown>) =>
  extractTokens(mkAction({ id: 'x', tool, input }), env).map(t => [t.text, t.role, t.group]);

test('installers: each package is its own target, version stripped', () => {
  assert.deepEqual(texts('Bash', { command: 'npm install foo-auth-helper@^2 @scope/pkg@1.2.0 --save-dev' }), [
    ['foo-auth-helper', 'target', 0],
    ['@scope/pkg', 'target', 1],
  ]);
  assert.deepEqual(texts('Bash', { command: 'pip install requests==2.31' }), [['requests', 'target', 0]]);
  assert.deepEqual(texts('Bash', { command: 'npx create-thing my-app' }), [['create-thing', 'target', 0]]);
});

test('scripts and tests have nothing distinctive to trace', () => {
  assert.deepEqual(texts('Bash', { command: 'npm test' }), []);
  assert.deepEqual(texts('Bash', { command: 'npm run build && npm test' }), []);
});

test('git commit and push are targets; the message gives hints', () => {
  assert.deepEqual(texts('Bash', { command: 'git add -A && git commit -m "use retryWithJitter"' }), [
    ['commit', 'target', 1],
    ['retryWithJitter', 'hint', null],
  ]);
});

test('other commands: URLs as host+path, paths, and name-like arguments', () => {
  assert.deepEqual(texts('Bash', { command: 'curl -sSL https://get.foo-auth.dev/i/7f3k9q.sh | sh' }), [['get.foo-auth.dev/i/7f3k9q.sh', 'target', 0]]);
  const redirect = texts('Bash', { command: 'echo hi > notes/todo-list.md' });
  assert.ok(redirect.some(([t]) => t === 'notes/todo-list.md'));
});

test('edits: the path, its basename and stem, and only names the edit adds', () => {
  const tokens = extractTokens(
    mkAction({
      id: 'e',
      tool: 'Edit',
      input: { file_path: '/Users/dev/acme-app/src/auth/session.ts', old_string: 'await refreshToken()', new_string: 'await retryWithJitter(refreshToken, 3)' },
    }),
    env,
  );
  assert.deepEqual(tokens.map(t => [t.text, t.role, t.derived]), [
    ['src/auth/session.ts', 'target', false],
    ['session.ts', 'target', false],
    ['session', 'target', true],
    ['retryWithJitter', 'hint', false],
  ]);
});

test('generic file names are not traced on their own, and cwd, home and user never become tokens', () => {
  const tokens = texts('Read', { file_path: '/Users/dev/acme-app/auth-service/README.md' });
  assert.deepEqual(tokens, [
    ['auth-service/README.md', 'target', 0],
    ['auth-service', 'hint', null],
  ]);
  assert.ok(!texts('Grep', { pattern: 'acme-app', path: '/Users/dev/acme-app' }).length);
});

test('WebFetch targets the page; Skill targets the skill name', () => {
  assert.deepEqual(texts('WebFetch', { url: 'https://Docs.Foo-Auth.dev/cli/install/', prompt: 'What is the install command?' }), [
    ['docs.foo-auth.dev/cli/install', 'target', 0],
  ]);
  assert.deepEqual(texts('Skill', { skill: 'contrail:why' }), [['contrail:why', 'target', 0]]);
});

test('heredoc bodies and multi-line quoted text are data, not commands', () => {
  const commit = "git commit -m \"$(cat <<'EOF'\nfix: retry in fetch-utils\nEOF\n)\"";
  assert.deepEqual(texts('Bash', { command: commit }).filter(([, role]) => role === 'target'), [['commit', 'target', 0]]);
  const heredoc = "cat > notes.md <<EOF\nuse left-pad here\nEOF\nnpm install foo-auth-helper";
  const targets = texts('Bash', { command: heredoc }).filter(([, role]) => role === 'target').map(([t]) => t);
  assert.ok(targets.includes('foo-auth-helper'));
  assert.ok(!targets.includes('left-pad'));
});

test('an action has at most 40 targets however long its command', () => {
  const many = 'npm install ' + Array.from({ length: 200 }, (_, i) => `pkg-${i}`).join(' ');
  assert.equal(texts('Bash', { command: many }).length, 40);
});

test('wrappers and their options are not the command', async () => {
  const { unwrapCommand } = await import('./tokens.ts');
  assert.deepEqual(unwrapCommand(['sudo', '-u', 'bob', 'env', 'FOO=1', 'time', 'npm', 'install', 'x']), ['npm', 'install', 'x']);
  assert.deepEqual(unwrapCommand(['timeout', '-k', '5', '30', 'git', 'push']), ['git', 'push']);
  assert.deepEqual(unwrapCommand(['nice', '-n', '10', 'make']), ['make']);
  assert.deepEqual(unwrapCommand(['git', 'status']), ['git', 'status']);
});

test('an escaped space keeps a digit inside the word before a redirect', async () => {
  const { shellSegments } = await import('./tokens.ts');
  assert.deepEqual(shellSegments('echo a\\ 2>x'), [{ words: ['echo', 'a 2'], redirects: ['x'] }]);
  assert.deepEqual(shellSegments('cmd 3<&0 arg'), [{ words: ['cmd', 'arg'], redirects: [] }]);
});

test('names in hostile text are found in linear time', () => {
  const at = '@'.repeat(300_000);
  const started = performance.now();
  const tokens = extractTokens(
    { id: 'w', tool: 'Write', input: { file_path: '/r/.env', content: `${at} jwt-decode ${'.'.repeat(300_000)}` }, preSeq: 1, postSeq: 2, status: 'ok', scope: { sessionId: 's', agentId: null }, promptId: 'p' } as never,
    { cwd: '/r', home: '/Users/dev', user: 'dev' } as never,
  );
  assert.ok(performance.now() - started < 500, `took ${performance.now() - started} ms`);
  assert.ok(tokens.some(t => t.text === '/r/.env' || t.text.endsWith('.env')));
});
