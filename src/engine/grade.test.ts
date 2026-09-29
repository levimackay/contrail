import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkInput, mkToken } from './fixtures.ts';
import { gradeSources, maxGrade, minGrade } from './grade.ts';

const readme = mkInput({
  id: 'out:t2',
  ref: 'auth-service/README.md',
  availableAt: 6,
  text: '    82\tsetup\n    83\tuse foo-auth-helper for token refresh\n',
});

test('one source for a name-like token is LIKELY, with the line quoted', () => {
  const links = gradeSources(mkToken('foo-auth-helper'), [readme], 't4');
  assert.equal(links.length, 1);
  const [link] = links;
  assert.equal(link!.grade, 'LIKELY');
  assert.equal(link!.rule, 'R3');
  assert.equal(link!.to, 'out:t2');
  assert.equal(link!.from, 't4');
  assert.equal(link!.recorded, false);
  assert.deepEqual(link!.quote, { ref: 'auth-service/README.md', line: 83, text: 'use foo-auth-helper for token refresh' });
});

test('a plain word from one source is only POSSIBLE: the model may know it', () => {
  const docs = mkInput({ id: 'out:x', text: 'we use express here' });
  const [link] = gradeSources(mkToken('express', { shaped: false }), [docs], 't4');
  assert.equal(link!.grade, 'POSSIBLE');
  assert.match(link!.note!, /plain word/);
});

test('two or three sources are POSSIBLE each, and the earliest is marked', () => {
  const mcp = mkInput({ id: 'out:t3', ref: 'mcp:t3', availableAt: 11, text: 'try foo-auth-helper' });
  const links = gradeSources(mkToken('foo-auth-helper'), [mcp, readme], 't4');
  assert.deepEqual(links.map(l => [l.to, l.grade, l.firstSeen ?? false]), [
    ['out:t2', 'POSSIBLE', true],
    ['out:t3', 'POSSIBLE', false],
  ]);
});

test('the same file read three times is one source, credited at its first read', () => {
  const again = [9, 4, 12].map(at => mkInput({ ...readme, id: `read@${at}`, availableAt: at }));
  const links = gradeSources(mkToken('foo-auth-helper'), again, 't4');
  assert.deepEqual(links.map(l => [l.to, l.grade]), [['read@4', 'LIKELY']]);
});

test('your own words are credited first; other sources are only "also in"', () => {
  const prompt = mkInput({ id: 'prompt:p1', ref: 'prompt:p1', trust: 'principal', origin: 'prompt', availableAt: 3, text: 'install foo-auth-helper' });
  const links = gradeSources(mkToken('foo-auth-helper'), [readme, prompt], 't4');
  assert.deepEqual(links.map(l => [l.to, l.grade, l.note]), [
    ['prompt:p1', 'LIKELY', 'you supplied it'],
    ['out:t2', 'POSSIBLE', 'also in'],
  ]);
});

test('four or more sources is too common to attribute: one UNKNOWN', () => {
  const many = [1, 2, 3, 4].map(n => mkInput({ id: `i${n}`, ref: `file${n}`, availableAt: n, text: 'react' }));
  const links = gradeSources(mkToken('react', { shaped: false }), many, 't4');
  assert.equal(links.length, 1);
  assert.equal(links[0]!.grade, 'UNKNOWN');
  assert.equal(links[0]!.to, null);
  assert.match(links[0]!.note!, /in 4 observed inputs/);
});

test('no candidates is UNKNOWN under R4, never "no influence"', () => {
  const [link] = gradeSources(mkToken('retryWithJitter'), [], 't6');
  assert.equal(link!.grade, 'UNKNOWN');
  assert.equal(link!.rule, 'R4');
  assert.equal(link!.to, null);
});

test('minGrade is the weakest link; maxGrade the strongest', () => {
  assert.equal(minGrade(['DIRECT', 'LIKELY', 'POSSIBLE']), 'POSSIBLE');
  assert.equal(minGrade(['LIKELY']), 'LIKELY');
  assert.equal(minGrade([]), 'UNKNOWN');
  assert.equal(maxGrade(['POSSIBLE', 'LIKELY', 'UNKNOWN']), 'LIKELY');
  assert.equal(maxGrade([]), 'UNKNOWN');
});
