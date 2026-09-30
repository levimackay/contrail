import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = join(import.meta.dirname, '..', 'plugin', 'skills');
const skills = readdirSync(dir).map(name => ({ name, text: readFileSync(join(dir, name, 'SKILL.md'), 'utf8') }));

test('every skill is manual-only and may run nothing but the Contrail launcher', () => {
  assert.deepEqual(skills.map(s => s.name).sort(), ['blame', 'find', 'report', 'review', 'risks', 'sessions', 'trace', 'why']);
  for (const { name, text } of skills) {
    assert.match(text, new RegExp(`^---\\nname: ${name}\\n`), name);
    assert.match(text, /\ndisable-model-invocation: true\n/, name);
    // Quoted: the plugin root is under the home directory, which can hold a space.
    assert.match(text, /\nallowed-tools: Bash\(sh "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/contrail" \*\)\n/, name);
    assert.match(text, /\n```!\nsh "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/contrail" \w+ /, name);
    assert.match(text, /exactly as printed/, name);
    // The permission check refuses shell expansion, so the data directory is plain substitution,
    // and it must not override CONTRAIL_HOME, which the capture hook honors first. --from-skill
    // makes an error the output, since Claude Code shows a failing command as a broken block.
    assert.match(text, /contrail" \w+ --from-skill --plugin-data "\$\{CLAUDE_PLUGIN_DATA\}"/, name);
    assert.doesNotMatch(text, /--data |:-/, name);
  }
});

test('why, find, blame and review pass their argument on stdin only; the others take none', () => {
  for (const { name, text } of skills) {
    const uses = text.split('$ARGUMENTS').length - 1;
    if (name === 'why' || name === 'find' || name === 'blame' || name === 'review') {
      assert.equal(uses, 1);
      assert.match(text, /--stdin 2>&1 <<'CONTRAIL_TARGET'\n\$ARGUMENTS\nCONTRAIL_TARGET\n/);
    } else {
      assert.equal(uses, 0, name);
      assert.doesNotMatch(text, /argument-hint/, name);
    }
  }
});

test('review shows the terminal view and saves the markdown in the plugin data directory, never printing it', () => {
  const review = skills.find(s => s.name === 'review')!.text;
  assert.match(review, /contrail" review --from-skill --plugin-data "\$\{CLAUDE_PLUGIN_DATA\}" -o "\$\{CLAUDE_PLUGIN_DATA\}\/review\.md" --stdin/);
  assert.doesNotMatch(review, /--markdown|--json/);
  assert.match(review, /Do not open, read, summarize, post or reinterpret that file/);
});
