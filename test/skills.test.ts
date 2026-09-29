import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = join(import.meta.dirname, '..', 'plugin', 'skills');
const skills = readdirSync(dir).map(name => ({ name, text: readFileSync(join(dir, name, 'SKILL.md'), 'utf8') }));

test('every skill is manual-only and may run nothing but the Contrail launcher', () => {
  assert.deepEqual(skills.map(s => s.name).sort(), ['risks', 'trace', 'why']);
  for (const { name, text } of skills) {
    assert.match(text, new RegExp(`^---\\nname: ${name}\\n`), name);
    assert.match(text, /\ndisable-model-invocation: true\n/, name);
    assert.match(text, /\nallowed-tools: Bash\(sh \$\{CLAUDE_PLUGIN_ROOT\}\/bin\/contrail \*\)\n/, name);
    assert.match(text, /exactly as printed/, name);
  }
});

test('risks and trace take no arguments; why passes its argument on stdin only', () => {
  for (const { name, text } of skills) {
    const uses = text.split('$ARGUMENTS').length - 1;
    if (name === 'why') {
      assert.equal(uses, 1);
      assert.match(text, /--stdin 2>&1 <<'CONTRAIL_TARGET'\n\$ARGUMENTS\nCONTRAIL_TARGET\n/);
    } else {
      assert.equal(uses, 0, name);
      assert.doesNotMatch(text, /argument-hint/, name);
    }
  }
});
