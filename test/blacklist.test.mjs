import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Blacklist, normalizeBlacklistData } from '../src/plugins/blacklist/Blacklist.js';
import { EventEmitter } from '../src/js/event.js';

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

test('blacklist right-click actions and manager remain available when filtering is off', () => {
  class MockApp extends EventEmitter {
    constructor() {
      super();
      this.prefValues = { enableBlacklist: false };
      this.contextMenuItems = [];
      this.overlays = [];
    }
    registerContextMenuItem(item) { this.contextMenuItems.push(item); }
    unregisterContextMenuItem(id) {
      this.contextMenuItems = this.contextMenuItems.filter((item) => item.id !== id);
    }
    registerOverlay(overlay) { this.overlays.push(overlay); }
    unregisterOverlay(id) {
      this.overlays = this.overlays.filter((item) => item.id !== id);
    }
  }

  const app = new MockApp();
  const plugin = new Blacklist(app);
  plugin.init();
  assert.equal(plugin.enabled, false);

  const manager = app.contextMenuItems.find((item) => item.id === 'blacklist-open-manager');
  const addId = app.contextMenuItems.find((item) => item.id === 'blacklist-add-selected-id');
  assert.equal(manager.visible(app, {}), true);
  assert.equal(addId.visible(app, { selectedText: 'emperor' }), true);
  assert.equal(app.overlays.some((overlay) => overlay.id === 'blacklist'), true);

  manager.onClick(app, {});
  assert.equal(plugin.showsPanel, true);
  addId.onClick(app, { state: { selectedText: 'emperor' } });
  assert.equal(plugin.data.rules[0].value, 'emperor');
});
