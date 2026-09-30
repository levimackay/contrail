import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGraph } from '../src/graph/build.ts';
import { explain } from '../src/engine/explain.ts';
import { findingsFor, rankFindings } from '../src/engine/risks.ts';
import { renderWhy } from '../src/render/why.ts';
import type { Graph } from '../src/engine/types.ts';
import { mcpShapesSession, mcpTextSession, webSearchSession } from './fixtures/recorded.ts';
import { WHO } from './fixtures/synthetic.ts';

/** The strongest credited source for a value in one action's arguments. */
function sourceOf(g: Graph, actionId: string, value: string) {
  const trace = explain(actionId, g).traces.find(t => t.token.text === value);
  assert.ok(trace, `no trace for ${value}`);
  const link = trace.links[0]!;
  return { link, input: g.inputs.find(i => i.id === link.to) };
}

test('recorded MCP text result: a bare list of content blocks, external, labeled by server and tool', () => {
  const g = buildGraph(mcpTextSession(), WHO);
  const call = g.actions.find(a => a.id === 'm1')!;
  assert.deepEqual(call.mcpServer, { name: 'demodocs', source: 'dynamic' });
  const out = g.inputs.find(i => i.id === 'out:m1')!;
  assert.deepEqual([out.origin, out.trust, out.fidelity, out.label], ['mcp', 'external', 'as-seen', 'MCP demodocs/get_setup_instructions result']);
  assert.deepEqual(g.effects.filter(e => e.actionId === 'm1').map(e => e.target), ['MCP server demodocs']);

  const url = sourceOf(g, 'b1', 'get.mcpdemo.example/i.sh');
  assert.deepEqual([url.link.grade, url.input?.id, url.link.quote?.line], ['LIKELY', 'out:m1', 3]);
  const pkg = sourceOf(g, 'w1', 'zephyr-mcpdemo-helper');
  assert.deepEqual([pkg.link.grade, pkg.input?.id, pkg.link.quote?.line], ['LIKELY', 'out:m1', 2]);
});

test('recorded MCP text result: the installer it gave ranks as a sensitive action with an external source', () => {
  const g = buildGraph(mcpTextSession(), WHO);
  const [top] = rankFindings(findingsFor(g));
  assert.equal(top?.action.id, 'b1');
  assert.equal(top?.externalUpstream, true);
  assert.equal(top?.requested, 'NOT_NAMED');
  assert.equal(top?.sources[0]?.input.label, 'MCP demodocs/get_setup_instructions result');

  const why = renderWhy(explain('b1', g), g);
  assert.match(why, /LIKELY {3}only observed in MCP demodocs\/get_setup_instructions result:3/);
  assert.match(why, /MCP server result \(external\)/);
});

test('recorded MCP shapes: structured result as text, an isError result, embedded resources', () => {
  const g = buildGraph(mcpShapesSession(), WHO);
  const expect: Array<[action: string, value: string, from: string]> = [
    ['e0', 'mirror.structdemo.example/npm', 'out:s1'],
    ['e1', 'lic.errdemo.example/fallback', 'out:s2'],
    ['e2', 'resourcedemo-pkg-7', 'out:s3'],
    ['e3', 'links.linkdemo.example/guide', 'out:s3'],
  ];
  for (const [action, value, from] of expect) {
    const { link, input } = sourceOf(g, action, value);
    assert.deepEqual([link.grade, input?.id, input?.origin, input?.trust], ['LIKELY', from, 'mcp', 'external'], value);
  }
  // An isError result is a failed call, and its text is still what the model saw.
  const failed = g.actions.find(a => a.id === 's2')!;
  assert.equal(failed.status, 'failed');
  assert.equal(g.inputs.find(i => i.id === 'out:s2')?.label, 'MCP demodocs/get_license_key result');
  assert.equal(g.effects.some(e => e.actionId === 's2'), false);
});

test('recorded WebSearch: external search results, quoted where the value sits on the one-line list of links', () => {
  const g = buildGraph(webSearchSession(), WHO);
  const out = g.inputs.find(i => i.id === 'out:q1')!;
  assert.deepEqual([out.origin, out.trust, out.fidelity, out.label], ['web_search', 'external', 'as-seen', 'WebSearch "fastgrep official installation page"']);

  // The agent wrote the URL in its own case; the result list has it lowercased. Matching folds case.
  const repo = sourceOf(g, 'b1', 'code.example/Fastgrep-Org/fastgrep');
  assert.deepEqual([repo.link.grade, repo.input?.id, repo.link.quote?.line], ['LIKELY', 'out:q1', 3]);
  assert.match(repo.link.quote!.text, /^…[^…]{0,40}code\.example\/fastgrep-org\/fastgrep/);

  const installer = sourceOf(g, 'b2', 'dl.fastgrep.example/download');
  assert.deepEqual([installer.link.grade, installer.input?.id, installer.link.quote?.line], ['LIKELY', 'out:q1', 3]);
  const why = renderWhy(explain('b2', g), g);
  assert.match(why, /3│ ….*dl\.fastgrep\.example\/download/);
  assert.match(why, /web search results \(external\)/);

  const [top] = rankFindings(findingsFor(g));
  assert.deepEqual([top?.action.id, top?.externalUpstream], ['b2', true]);
});

test('recorded WebSearch without the batch event: the reported response still holds every result URL', () => {
  const g = buildGraph(webSearchSession({ batch: false }), WHO);
  const out = g.inputs.find(i => i.id === 'out:q1')!;
  assert.deepEqual([out.fidelity, out.trust], ['reported', 'external']);
  const installer = sourceOf(g, 'b2', 'dl.fastgrep.example/download');
  assert.deepEqual([installer.link.grade, installer.input?.id], ['LIKELY', 'out:q1']);
});
