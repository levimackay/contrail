import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HASHED } from '../engine/hashed.ts';
import { hashContent } from './content.ts';

const hmac = (s: string) => s.length.toString(16).padStart(12, '0');

test('a background report keeps the header that marks it, and only the report is hashed', () => {
  const p: Record<string, unknown> = {
    prompt: '<task-notification>\n<task-id>a7</task-id>\n<tool-use-id>t1</tool-use-id>\n<summary>Agent "x" finished</summary>\n<result>secret plans</result>',
  };
  hashContent(p, 'UserPromptSubmit', hmac);
  assert.match(p.prompt as string, /^<task-notification>\n<task-id>a7<\/task-id>\n<tool-use-id>t1<\/tool-use-id>\n<summary>Agent "x" finished<\/summary>\n⟦contrail:hashed⟧ /);
  assert.doesNotMatch(p.prompt as string, /secret|plans/);

  const yours: Record<string, unknown> = { prompt: 'fix the login bug' };
  hashContent(yours, 'UserPromptSubmit', hmac);
  assert.equal(yours.prompt, 'fix the login bug');
});

test("tool output is hashed, but paths, ids and git's commit line stay; the agent's words and patches go", () => {
  const post: Record<string, unknown> = {
    tool_input: { command: 'git commit -q -m x' },
    tool_response: { stdout: '[main 9f3c2a1] x\n 1 file changed', stderr: 'warning: secret', filePath: '/r/a.ts', structuredPatch: [{ lines: ['+x'] }] },
  };
  hashContent(post, 'PostToolUse', hmac);
  const r = post.tool_response as Record<string, unknown>;
  assert.match(r.stdout as string, /^\[main 9f3c2a1\] x\n⟦contrail:hashed⟧ /);
  assert.ok((r.stderr as string).startsWith(HASHED));
  assert.equal(r.filePath, '/r/a.ts');
  assert.deepEqual(r.structuredPatch, []);
  assert.deepEqual(post.tool_input, { command: 'git commit -q -m x' });

  const stop: Record<string, unknown> = { last_assistant_message: 'I read your .env' };
  hashContent(stop, 'Stop', hmac);
  assert.equal(stop.last_assistant_message, '');
});
