import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const server = fs.readFileSync(path.resolve('portable/server.mjs'), 'utf8');
const launcher = fs.readFileSync(path.resolve('Launcher.cs'), 'utf8');
const build = fs.readFileSync(path.resolve('scripts/build-portable.mjs'), 'utf8');

test('portable startup preserves the existing PTT-FQU origin and storage', () => {
  assert.match(server, /const host = "::1";/);
  assert.match(server, /const port = 8081;/);
  assert.match(server, /http:\/\/\[\$\{host\}\]:\$\{port\}/);
  assert.match(launcher, /Port = 8081/);
  assert.match(launcher, /Host = "::1"/);
  assert.match(launcher, /http:\/\/\[::1\]:8081/);
  assert.match(build, /SITE_URL: "ws:\/\/\[::1\]:8081\/bbs"/);
});
