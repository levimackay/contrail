import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blameBlocks, blameLines, heredocWrites, isTrivial, lineKey, splitLines, writtenText, type BlameWrite } from './blame.ts';

const FILE = '/r/src/auth.ts';
const here = (p: string) => p === FILE;

/** A recorded write at a time, from a tool's input. */
function write(id: string, at: number, tool: string, input: Record<string, unknown>, observed = true): BlameWrite {
  const text = writtenText(tool, input, here, '/r');
  assert.ok(text, `${id} holds written text`);
  return { id, at, tiebreak: id, text, observed };
}

const credited = (file: string, writes: BlameWrite[]) => blameLines(splitLines(file), writes).map(l => l.call);

test('trivial lines are blank, punctuation only, or one structure word', () => {
  for (const t of ['', '}', '});', '])', '*/', '//', '#', '---', '} else {', 'end', 'fi', 'done', 'return;', 'else:', '"""']) assert.ok(isTrivial(lineKey(t)), JSON.stringify(t));
  for (const t of ['return null;', 'x = 1', 'end_time = 0', '} catch (e) {', 'import os', '// TODO: fix', 'elsewhere()']) assert.ok(!isTrivial(lineKey(t)), JSON.stringify(t));
});

test('the latest write that holds a line is credited with it', () => {
  const file = 'const a = 1;\nconst b = 2;\n';
  const first = write('w1', 1, 'Write', { file_path: FILE, content: 'const a = 1;\nconst b = 1;\n' });
  const second = write('w2', 2, 'Write', { file_path: FILE, content: 'const a = 1;\nconst b = 2;\n' });
  assert.deepEqual(credited(file, [first, second]), ['w2', 'w2']);
  const lines = blameLines(splitLines(file), [second, first]);
  assert.equal(lines[0]!.writers, 2, 'both wrote line 1; the count says so');
  assert.equal(lines[0]!.grade, 'LIKELY');
  assert.equal(lines[1]!.writers, 1);
});

test("an Edit is credited only with the lines it added, not the context it carried over", () => {
  const file = 'function check(token) {\n  return verify(token, KEY);\n}\n';
  const created = write('w1', 1, 'Write', { file_path: FILE, content: 'function check(token) {\n  return token.ok;\n}\n' });
  const edit = write('e1', 2, 'Edit', { file_path: FILE, old_string: 'function check(token) {\n  return token.ok;', new_string: 'function check(token) {\n  return verify(token, KEY);' });
  assert.deepEqual(credited(file, [created, edit]), ['w1', 'e1', null], 'the closing brace sits between lines of two calls');
});

test('MultiEdit is credited with the new text of each of its edits', () => {
  const file = 'import { a } from "./a";\nimport { b } from "./b";\nuse(a, b);\n';
  const multi = write('m1', 1, 'MultiEdit', {
    file_path: FILE,
    edits: [
      { old_string: 'import { a } from "./old";', new_string: 'import { a } from "./a";' },
      { old_string: 'use(a);', new_string: 'use(a, b);' },
    ],
  });
  assert.deepEqual(credited(file, [multi]), ['m1', null, 'm1']);
});

test('a line changed after the agent wrote it is not credited to anyone', () => {
  const agent = write('w1', 1, 'Write', { file_path: FILE, content: 'const timeout = 30;\nstart(timeout);\n' });
  assert.deepEqual(credited('const timeout = 45; // tuned by hand\nstart(timeout);\n', [agent]), [null, 'w1']);
});

test('indentation and line endings do not matter; the words do', () => {
  const agent = write('w1', 1, 'Write', { file_path: FILE, content: 'if (x) {\n    run(x);\n}\n' });
  assert.deepEqual(credited('if (x) {\r\n\trun(x);\r\n}\r\n', [agent]), ['w1', 'w1', 'w1']);
  assert.deepEqual(credited('if (x) {\n  run(y);\n}\n', [agent]), ['w1', null, null]);
});

test('a trivial line joins a block only when both neighbours agree and the call wrote such a line', () => {
  const a = write('a', 1, 'Write', { file_path: FILE, content: 'first();\n\nsecond();\n}\n' });
  assert.deepEqual(credited('first();\n\nsecond();\n}\n', [a]), ['a', 'a', 'a', 'a'], 'the edge of the file counts as agreeing');
  const b = write('b', 2, 'Edit', { file_path: FILE, old_string: 'second();', new_string: 'third();' });
  assert.deepEqual(credited('first();\n\nthird();\n}\n', [a, b]), ['a', null, 'b', null], 'neighbours from two calls: the blank and brace stay unattributed');
  const noBlank = write('c', 1, 'Write', { file_path: FILE, content: 'first();\nsecond();\n' });
  assert.deepEqual(credited('first();\n\nsecond();\n', [noBlank]), ['c', null, 'c'], 'the call wrote no blank line, so the one between is not its');
  assert.deepEqual(credited('}\n\n', [a]), [null, null], 'a file of trivial lines attributes nothing');
});

test('text that occurs more often in the file than the call wrote it is POSSIBLE, with the counts', () => {
  const agent = write('w1', 1, 'Edit', { file_path: FILE, old_string: 'x', new_string: 'return null;' });
  const lines = blameLines(splitLines('return null;\nkeep();\nreturn null;\n'), [agent]);
  assert.deepEqual(lines.map(l => [l.call, l.grade, l.unambiguous, l.inFile, l.byCall]), [
    ['w1', 'POSSIBLE', false, 2, 1],
    [null, null, false, 1, 0],
    ['w1', 'POSSIBLE', false, 2, 1],
  ]);
});

test('a shell write that was expected, not reported, is at most POSSIBLE', () => {
  const text = writtenText('Bash', { command: "cat > src/auth.ts <<'EOF'\nconst a = 1;\nEOF" }, here, '/r')!;
  const lines = blameLines(['const a = 1;'], [{ id: 'b1', at: 1, tiebreak: 'b1', text, observed: false }]);
  assert.equal(lines[0]!.grade, 'POSSIBLE');
  assert.equal(lines[0]!.unambiguous, false);
});

test('heredocs count only when the body is written as it stands, to a known path', () => {
  const body = (command: string, cwd = '/r') => heredocWrites(command, cwd).map(h => [h.path, h.body]);
  assert.deepEqual(body("cat > src/a.ts <<'EOF'\nconst x = `${y}`;\nEOF"), [['/r/src/a.ts', 'const x = `${y}`;']], 'quoted: literal');
  assert.deepEqual(body('cat <<EOF >> notes.md\nplain text\nEOF'), [['/r/notes.md', 'plain text']]);
  assert.deepEqual(body('cat > a.sh <<EOF\necho $HOME\nEOF'), [], 'unquoted with $: the shell expanded it');
  assert.deepEqual(body('tee -a log.txt <<-END\n\tindented\n\tEND'), [['/r/log.txt', 'indented']]);
  assert.deepEqual(body("cd sub && cat > a.ts <<'EOF'\nx\nEOF"), [], 'after cd the directory is not known');
  assert.deepEqual(body("cd sub && cat > /abs/a.ts <<'EOF'\nx\nEOF"), [['/abs/a.ts', 'x']]);
  assert.deepEqual(body("cat > a.ts <<'EOF'\nnever closed"), []);
  assert.deepEqual(body("grep x <<'EOF'\nx\nEOF"), [], 'fed to a command, not written');
  assert.equal(writtenText('Bash', { command: 'npm install jwt-decode' }, here, '/r'), null);
});

test('text cut at the storage cap loses its partial last line', () => {
  const agent = write('w1', 1, 'Write', { file_path: FILE, content: 'keep_this();\nand_this();\ncut_he\n…[contrail: truncated 99 bytes]' });
  assert.deepEqual(credited('keep_this();\nand_this();\ncut_here();\n', [agent]), ['w1', 'w1', null]);
});

test('NotebookEdit source is compared with the JSON-encoded cell lines on disk', () => {
  const nb = (p: string) => p === '/r/a.ipynb';
  const text = writtenText('NotebookEdit', { notebook_path: '/r/a.ipynb', new_source: 'import pandas as pd\ndf = pd.read_csv("x.csv")', edit_mode: 'replace' }, nb, '/r', true)!;
  const disk = ['   "source": [', '    "import pandas as pd\\n",', '    "df = pd.read_csv(\\"x.csv\\")"', '   ]'];
  assert.deepEqual(blameLines(disk, [{ id: 'n1', at: 1, tiebreak: 'n1', text, observed: true }], true).map(l => l.call), [null, 'n1', 'n1', null]);
  assert.equal(writtenText('NotebookEdit', { notebook_path: '/r/a.ipynb', edit_mode: 'delete' }, nb, '/r', true), null);
});

test('blocks group consecutive lines of one call at one grade', () => {
  const a = write('a', 1, 'Write', { file_path: FILE, content: 'one();\ntwo();\nfour();\n' });
  const lines = blameLines(splitLines('one();\ntwo();\nthree();\nfour();\n'), [a]);
  assert.deepEqual(blameBlocks(lines), [
    { start: 1, end: 2, call: 'a', grade: 'LIKELY' },
    { start: 3, end: 3, call: null, grade: null },
    { start: 4, end: 4, call: 'a', grade: 'LIKELY' },
  ]);
});
