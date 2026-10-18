import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/(tabs)/receipts.tsx', import.meta.url), 'utf8');
test('refund state is cleared on logout', () => {
  assert.match(source, /if \(!token\) \{[\s\S]*?setPendingRefunds\(\{\}\);[\s\S]*?setStorageKey\(''\)/);
});
test('refund form state is isolated when account changes', () => {
  assert.match(source, /accountKeyRef\.current !== key/);
  for (const name of ['setPendingRefunds', 'setRefundQuantities', 'setRestockByLine', 'setReasonByLine']) {
    assert.match(source, new RegExp(`${name}\\(\\{\\}\\)`));
  }
});
