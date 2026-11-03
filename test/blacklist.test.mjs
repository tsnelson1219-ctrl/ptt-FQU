import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/plugins/blacklist/Blacklist.js'), 'utf8');

test('a whitelisted article author must not short-circuit the entire reading page', () => {
  assert.doesNotMatch(source, /if\s*\(match\s*&&\s*this\.isAllowlisted\(match\[1\]\)\)\s*return\s+lines/);
  assert.match(source, /if\s*\(match\s*&&\s*!this\.isAllowlisted\(match\[1\]\)\s*&&\s*this\.matchesId\(match\[1\]\)\)/);
});

test('allowlisted authors are exempt from ID rules but still pass through keyword rules', () => {
  assert.match(source, /const authorAllowlisted = Boolean\(author\?\.id && this\.isAllowlisted\(author\.id\)\)/);
  assert.match(source, /const hasKeyword = rules\.some\(\(rule\) => rule\.type === "keyword"/);
  assert.match(source, /const blockedAuthor = Boolean\(author\?\.id && !authorAllowlisted && this\.matchesId\(author\.id\)\)/);
});

test('right-clicking anywhere on a push row resolves its author ID', () => {
  assert.match(source, /const pushAuthor = getPushAuthor\(text\);\s*\/\/ A right-click anywhere on a push row[\s\S]*?if \(pushAuthor\) \{\s*return pushAuthor\.id;/);
  assert.doesNotMatch(source, /if \(pushAuthor && col >= pushAuthor\.start && col < pushAuthor\.end\)/);
});
