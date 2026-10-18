import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const frame = readFileSync(new URL('../components/ScreenFrame.tsx', import.meta.url), 'utf8');
test('workspace uses keyboard-aware, safe-area screen container', () => {
  assert.match(frame, /SafeAreaView/);
  assert.match(frame, /KeyboardAvoidingView/);
  assert.match(frame, /keyboardShouldPersistTaps="handled"/);
  assert.match(frame, /keyboardDismissMode="on-drag"/);
});
test('workspace header has accessible page title', () => {
  assert.match(frame, /accessibilityRole="header"/);
  assert.match(frame, /\{title\}/);
});

test('workspace adapts to compact phones and wide screens', () => {
  assert.match(frame, /width < 375/);
  assert.match(frame, /width >= 680/);
  assert.match(frame, /contentWide/);
  assert.match(frame, /compactTitle/);
});
