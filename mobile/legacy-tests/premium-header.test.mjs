import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/ScreenFrame.tsx', import.meta.url), 'utf8');
test('all screens receive a shared branded title and safe-area shell', () => {
  assert.match(source, /accessibilityRole="header"/);
  assert.match(source, /NORISS/);
  assert.match(source, /SafeAreaView/);
  assert.match(source, /KeyboardAvoidingView/);
});
test('compact and tablet layouts retain responsive boundaries', () => {
  assert.match(source, /width < 375/);
  assert.match(source, /width >= 680/);
  assert.match(source, /contentWide/);
});
