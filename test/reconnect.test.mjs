import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/js/app.js'), 'utf8');

test('connection alerts are dismissed only after the socket opens', () => {
  const connectBlock = source.slice(source.indexOf('  _doConnect('), source.indexOf('  onConnect('));
  const openBlock = source.slice(source.indexOf('  onConnect('), source.indexOf('  onClose('));
  assert.doesNotMatch(connectBlock, /dismissAlert\(['"]connection['"]\)/);
  assert.match(openBlock, /dismissAlert\(['"]connection['"]\)/);
});

test('stale socket events cannot change the active connection state', () => {
  assert.match(source, /wsConn\.addEventListener\(['"]open['"], \(\) => this\.onConnect\(wsConn\)\)/);
  assert.match(source, /wsConn\.addEventListener\(['"]close['"], \(\) => this\.onClose\(wsConn\)\)/);
  assert.match(source, /if \(!wsConn \|\| this\.conn !== wsConn\) return;/);
});

test('a stalled connection attempt is closed after the timeout', () => {
  assert.match(source, /this\.connectionTimeout = setTimeout\(/);
  assert.match(source, /\}, 15000\)/);
  assert.match(source, /wsConn\.close\(\)/);
});
