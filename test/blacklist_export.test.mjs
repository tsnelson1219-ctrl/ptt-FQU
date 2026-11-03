import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/plugins/blacklist/BlacklistPanel.js'), 'utf8');

test('blacklist exports offer a native Save As location picker when supported', () => {
  assert.match(source, /async function downloadText\(text, filename\)/);
  assert.doesNotMatch(source, /async\s+async\s+function\s+downloadText/);
  assert.match(source, /window\.showSaveFilePicker\(/);
  assert.match(source, /suggestedName: filename/);
  assert.match(source, /await writable\.write\(contents\)/);
  assert.match(source, /await writable\.close\(\)/);
});

test('canceling the native Save As dialog does not silently download a file', () => {
  assert.match(source, /if \(error\?\.name === "AbortError"\) return "cancelled"/);
  assert.match(source, /if \(result === "cancelled"\) this\.notify\("已取消儲存"\)/);
});

test('unsupported browsers retain a download fallback with an honest location notice', () => {
  assert.match(source, /anchor\.download = filename/);
  assert.match(source, /已交由瀏覽器下載；儲存位置依瀏覽器設定/);
});
