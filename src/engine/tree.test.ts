import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authSession, WHO } from '../../test/fixtures/synthetic.ts';
import { buildGraph } from '../graph/build.ts';
import { explain } from './explain.ts';
import { trailForest, type TreeNode } from './tree.ts';

test('every explained action appears exactly once, under an earlier call or a root', () => {
  const g = buildGraph(authSession(), WHO);
  const forest = trailForest(g, new Map(g.actions.map(a => [a.id, explain(a.id, g)])));
  const seen: string[] = [];
  const walk = (n: TreeNode, parentSeq: number) => {
    assert.ok(n.action.preSeq > parentSeq, `${n.action.id} sits under a later call`);
    seen.push(n.action.id);
    n.children.forEach(c => walk(c, n.action.preSeq));
  };
  for (const root of forest) root.children.forEach(n => walk(n, 0));
  assert.deepEqual(seen.sort(), g.actions.map(a => a.id).sort());
});

test('an action missing from the explanations is left out, not misplaced', () => {
  const g = buildGraph(authSession(), WHO);
  const forest = trailForest(g, new Map([['t4', explain('t4', g)]]));
  assert.deepEqual(forest.flatMap(r => r.children.map(n => n.action.id)), ['t4']);
});
