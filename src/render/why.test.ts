import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authSession, WHO } from '../../test/fixtures/synthetic.ts';
import { explain } from '../engine/explain.ts';
import { buildGraph } from '../graph/build.ts';
import { FOOTER, HEADING, renderWhy } from './why.ts';

const render = () => {
  const g = buildGraph(authSession(), WHO);
  return renderWhy(explain('t4', g), g);
};

test('the report for the motivating example states what was observed', () => {
  const out = render();
  assert.match(out, /^Bash {2}npm install foo-auth-helper/);
  assert.match(out, /Requested\? {2}NOT NAMED \(the agent chose this\)\. Your 1 sentence this session does not name it\./);
  assert.match(out, /Turn {8}DIRECT {3}ran while answering p1: "Figure out why authentication is broken\."/);
  assert.match(out, /LIKELY {3}only observed in auth-service\/README\.md:83 {2}\[R3\]/);
  assert.match(out, /83│ use foo-auth-helper for token refresh/);
  assert.match(out, /how the agent came to call Read t2:/);
  assert.match(out, /LIKELY {3}only observed in CLAUDE\.md:4 {2}\[R3\]/);
  assert.match(out, /repo instructions \(repo content, not you\)/);
  assert.match(out, /DIRECT {3}package\.json {7}changed while this command ran {2}\[R1 bashEditDiff\]/);
  assert.match(out, /DIRECT {3}package-lock\.json/);
  assert.match(out, /Weakest link on this trail: LIKELY/);
});

test('every report carries the data-provenance heading and the not-observable footer', () => {
  const out = render();
  assert.ok(out.includes(HEADING));
  for (const line of FOOTER) assert.ok(out.includes(line));
});

test("the agent's words are shown only as context, labelled as not evidence", () => {
  assert.match(render(), /Agent said \(shown for context, never used as evidence\): "The README recommends/);
});

test('Contrail never uses causal or accusatory wording of its own', () => {
  const own = render()
    .split('\n')
    .filter(line => !/^\s*(\d+)?│/.test(line.trim()) && !line.startsWith('Agent said') && !line.includes('"'))
    .join('\n')
    .toLowerCase();
  for (const word of ['because', 'caused', 'led to', 'decided', 'tainted', 'malicious']) {
    assert.ok(!own.includes(word), `report uses "${word}"`);
  }
});

test('long tool call ids are shortened in reports, never in JSON', async () => {
  const { callId } = await import('./style.ts');
  assert.equal(callId('toolu_01XWNSRthmT3jfsUEY1ALhq1'), 'toolu…ALhq1');
  assert.equal(callId('t4'), 't4');
});
