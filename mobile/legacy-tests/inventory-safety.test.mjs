import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/(tabs)/inventory.tsx', import.meta.url), 'utf8');
test('stock purchase inputs do not default to realistic sale quantities and costs', () => {
  assert.match(source, /const \[quantity, setQuantity\] = useState\(''\)/);
  assert.match(source, /const \[unitAmount, setUnitAmount\] = useState\(''\)/);
});
test('restock quantity must be a positive safe integer', () => {
  assert.match(source, /Number\.isSafeInteger\(parsedQty\)/);
});
test('unit cost must be positive', () => {
  assert.match(source, /parsedUnit === null \|\| parsedUnit <= 0/);
});
test('selection is reconciled with current inventory', () => {
  assert.match(source, /nextProducts\.some\(\(product: Product\) => product\.id === current\)/);
  assert.match(source, /setSelectedProductId\(''\)/);
});
