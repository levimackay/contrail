import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ansiToSvg, parseAnsi } from '../scripts/svg.ts';

test('SGR codes from the report style become runs with color and weight', () => {
  const [line] = parseAnsi('\x1b[1;36mLIKELY\x1b[0m   jwt-decode \x1b[2m[R3]\x1b[0m');
  assert.deepEqual(
    line!.map(r => [r.col, r.text, r.color, r.bold, r.dim]),
    [
      [0, 'LIKELY', '#56d4dd', true, false],
      [6, '   jwt-decode ', null, false, false],
      [20, '[R3]', null, false, true],
    ],
  );
});

test('long lines wrap at a space, and other escape sequences are dropped', () => {
  const lines = parseAnsi(`\x1b[2Kaaaa bbbb cccc`, 10);
  assert.deepEqual(lines.map(l => l.map(r => r.text).join('')), ['aaaa bbbb', 'cccc']);
});

test('recorded text is escaped, so it cannot inject markup into the SVG', () => {
  const svg = ansiToSvg('<script>alert(1)</script> & "x"', 'a <b>');
  assert.doesNotMatch(svg, /<script|<b>/);
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
});
