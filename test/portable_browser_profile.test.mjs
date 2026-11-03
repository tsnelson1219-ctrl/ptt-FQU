import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const launcher = fs.readFileSync(path.resolve('portable/server.mjs'), 'utf8');

test('portable launcher reuses the normal browser profile', () => {
  assert.doesNotMatch(launcher, /--user-data-dir=/);
  assert.match(launcher, /--app=\$\{url\}/);
});
