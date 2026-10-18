import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/(tabs)/receipts.tsx', import.meta.url), 'utf8');
test('receipts expose additional line items beyond the first three', () => {
  assert.match(source, /Show all \$\{receipt\.lines\.length\} items/);
  assert.match(source, /expandedReceipts\[receipt\.id\] \? receipt\.lines : receipt\.lines\.slice\(0, 3\)/);
});
test('refunds use a synchronous duplicate submission guard', () => {
  assert.match(source, /if \(!line\?\.id \|\| refundLock\.current\) return/);
  assert.match(source, /refundLock\.current = true/);
  assert.match(source, /refundLock\.current = false/);
});
test('refund quantities and authorization are validated', () => {
  assert.match(source, /Number\.isSafeInteger\(refundQty\)/);
  assert.match(source, /if \(!canRefund\)/);
});
