import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const quickBoards = fs.readFileSync(path.resolve('src/plugins/quick_boards/QuickBoards.js'), 'utf8');
const mouseController = fs.readFileSync(path.resolve('src/js/mouse_controller.js'), 'utf8');

test('the entire quick-board overlay is excluded from terminal mouse and key handling', () => {
  assert.match(quickBoards, /className: "PTTQuickBoards nomouse_command"/);
  assert.match(mouseController, /closest\('\.nomouse_command'\)/);
});
