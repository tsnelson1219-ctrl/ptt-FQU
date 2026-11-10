import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBlacklistData } from '../src/plugins/blacklist/blacklist_data.js';

const source = fs.readFileSync(path.resolve('src/plugins/blacklist/Blacklist.js'), 'utf8');

test('a whitelisted article author must not short-circuit the entire reading page', () => {
  assert.doesNotMatch(source, /if\s*\(match\s*&&\s*this\.isAllowlisted\(match\[1\]\)\)\s*return\s+lines/);
  assert.match(source, /if\s*\(match\s*&&\s*!this\.isAllowlisted\(match\[1\]\)\s*&&\s*this\.matchesId\(match\[1\]\)\)/);
});

test('allowlisted authors are exempt from ID rules but still pass through keyword rules', () => {
  assert.match(source, /const authorAllowlisted = Boolean\(author\?\.id && this\.isAllowlisted\(author\.id\)\)/);
  assert.match(source, /const hasKeyword = isArticleContentRow && rules\.some\(\(rule\) =>/);
  assert.match(source, /rule\.type === "keyword" && searchableText\.includes/);
  assert.match(source, /const blockedAuthor = Boolean\(author\?\.id && !authorAllowlisted && this\.matchesId\(author\.id\)\)/);
});

test('right-clicking anywhere on a push row resolves its author ID', () => {
  assert.match(source, /const pushAuthor = getPushAuthor\(text\);\s*\/\/ A right-click anywhere on a push row[\s\S]*?if \(pushAuthor\) \{\s*return pushAuthor\.id;/);
  assert.doesNotMatch(source, /if \(pushAuthor && col >= pushAuthor\.start && col < pushAuthor\.end\)/);
});


test('legacy rules without history are migrated into visible, reversible events', () => {
  const data = normalizeBlacklistData({
    rules: [
      { type: 'id', value: 'emperor' },
      { type: 'keyword', value: '5566' },
    ],
    history: [],
    nextSeq: 1,
  }, '2026-11-03T00:00:00.000Z');

  assert.equal(data.migrated, true);
  assert.deepEqual(data.rules.map((rule) => rule.addedBySeq), [1, 2]);
  assert.deepEqual(data.history.map((event) => event.value), ['emperor', '5566']);
  assert.equal(data.history[0].note, '既有名單');
  assert.equal(data.nextSeq, 3);
});

test('right-click blacklist tools do not disappear when filtering is disabled', () => {
  const menu = source.slice(source.indexOf('  getContextMenuItems()'), source.indexOf('\n  renderOverlay(', source.indexOf('  getContextMenuItems()')));
  assert.doesNotMatch(menu, /this\.enabled/);
  assert.match(menu, /id: "blacklist-open-manager"[\s\S]*?visible: \(\) => true/);
  assert.match(source, /onInit\(\)[\s\S]*?this\.registerOverlay\(/);
});

test('a keyword match in an article hides the complete body, not only the matching row', () => {
  assert.match(source, /const keywordRules = rules\.filter\(\(rule\) => rule\.type === "keyword"\)/);
  assert.match(source, /const keywordMatch = keywordRules\.length > 0 && texts\.some/);
  assert.match(source, /for \(let row = authorRow \+ 1; row < readingContentEnd; row \+= 1\)/);
  assert.match(source, /PTT-FQU: hidden keyword/);
});

