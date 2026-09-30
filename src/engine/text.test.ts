import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMention, isShaped, lineOf, normalize } from './text.ts';

test('normalize lowercases, folds compatibility forms and strips invisible characters', () => {
  assert.equal(normalize('Foo​-Auth'), 'foo-auth');
  assert.equal(normalize('ＦＯＯ'), 'foo');
  assert.equal(normalize('a‮b﻿c'), 'abc');
});

test('isShaped separates name-like tokens from plain words', () => {
  assert.equal(isShaped('foo-auth-helper'), true);
  assert.equal(isShaped('retryWithJitter'), true);
  assert.equal(isShaped('src/auth.ts'), true);
  assert.equal(isShaped('v2'), true);
  assert.equal(isShaped('express'), false);
  assert.equal(isShaped('Express'), false);
});

test('findMention matches whole tokens only', () => {
  assert.equal(findMention('use foo-auth-helper for token refresh', 'foo-auth-helper'), 4);
  assert.equal(findMention('use foo-auth-helper-v2', 'foo-auth-helper'), -1);
  assert.equal(findMention('my_foo-auth-helper', 'foo-auth-helper'), -1);
  assert.equal(findMention('Use FOO-Auth-Helper.', 'foo-auth-helper'), 4);
  assert.equal(findMention('see /r/src/auth.ts:41', 'src/auth.ts'), 7);
});

test('findMention sees through hidden characters and never matches empty tokens', () => {
  assert.equal(findMention('x foo​-auth-helper', 'foo-auth-helper'), 2);
  assert.equal(findMention('anything', ''), -1);
  assert.equal(findMention('', 'foo'), -1);
});

test('lineOf reads the line number the Read tool printed', () => {
  const text = '    82\tsetup\n    83\tuse foo-auth-helper for token refresh\n';
  assert.deepEqual(lineOf(text, findMention(text, 'foo-auth-helper')), { line: 83, text: 'use foo-auth-helper for token refresh' });
  const arrow = '    83→use foo-auth-helper';
  assert.deepEqual(lineOf(arrow, findMention(arrow, 'foo-auth-helper')), { line: 83, text: 'use foo-auth-helper' });
});

test('lineOf falls back to the position in the text, and single lines have no number', () => {
  const text = 'a\nb\nuse foo-auth-helper\n';
  assert.deepEqual(lineOf(text, findMention(text, 'foo-auth-helper')), { line: 3, text: 'use foo-auth-helper' });
  assert.deepEqual(lineOf('install foo-auth-helper', 8), { line: null, text: 'install foo-auth-helper' });
});

test('lineOf quotes a long line from just before the match, so the value shows', () => {
  const links = `Links: [${Array.from({ length: 8 }, (_, i) => `{"title":"Result ${i}","url":"https://r${i}.example/"}`).join(',')}]`;
  const text = `Web search results for query: "x"\n\n${links}\n`;
  const q = lineOf(text, findMention(text, 'r6.example'));
  assert.equal(q.line, 3);
  assert.ok(q.text.startsWith('…'));
  assert.ok(q.text.indexOf('r6.example') > 0 && q.text.indexOf('r6.example') < 40, q.text);
  assert.ok(links.endsWith(q.text.slice(1)));
  // A match near the start keeps the whole line.
  assert.equal(lineOf(text, findMention(text, 'r0.example')).text, links);
  const numbered = `    12\t${' '.repeat(4)}${'x'.repeat(100)} foo-auth-helper`;
  assert.deepEqual(lineOf(numbered, findMention(numbered, 'foo-auth-helper')), { line: 12, text: `…${'x'.repeat(29)} foo-auth-helper` });
});

test('lineOf finds the same line as splitting the text, at every index', () => {
  // The first version of lineOf, which split the whole text into lines for every quote.
  const bySplit = (text: string, index: number) => {
    const lineIndex = normalize(text).slice(0, Math.max(0, index)).split('\n').length - 1;
    const lines = text.split('\n');
    const raw = lines[lineIndex] ?? '';
    const prefixed = /^\s*(\d+)(?:→|\t)(.*)$/.exec(raw);
    if (prefixed) return { line: Number(prefixed[1]), text: prefixed[2]!.trim() };
    return { line: lines.length > 1 ? lineIndex + 1 : null, text: raw.trim() };
  };
  const texts = ['', 'one line', 'a\nb\n\nc', '\n', '\n\n', '    1\tx\n    2\ty\n', 'ﬁle​\nNext\n  3→z', 'x\r\ny\n'];
  for (const text of texts) {
    for (let index = -1; index <= normalize(text).length + 2; index++) {
      assert.deepEqual(lineOf(text, index), bySplit(text, index), `${JSON.stringify(text)} at ${index}`);
      assert.deepEqual(lineOf(text, index, normalize(text)), bySplit(text, index));
    }
  }
});
