import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const storage = read('../services/deviceStorage.ts');

test('web storage uses browser sessionStorage instead of the empty SecureStore web module', () => {
  assert.match(storage, /Platform\.OS === 'web'/);
  assert.match(storage, /window\.sessionStorage/);
  assert.match(storage, /browserStorage\(\)\.getItem\(key\)/);
  assert.match(storage, /browserStorage\(\)\.setItem\(key, value\)/);
  assert.match(storage, /browserStorage\(\)\.removeItem\(key\)/);
});

test('native storage operations continue to use Expo SecureStore', () => {
  assert.match(storage, /SecureStore\.getItemAsync\(key\)/);
  assert.match(storage, /SecureStore\.setItemAsync\(key, value\)/);
  assert.match(storage, /SecureStore\.deleteItemAsync\(key\)/);
});

test('sessions and pending transaction payloads share the platform adapter', () => {
  assert.match(read('../services/session.ts'), /deviceStorage\.setItemAsync/);
  for (const screen of ['sell', 'inventory', 'receipts', 'more']) {
    assert.match(read(`../app/(tabs)/${screen}.tsx`), /deviceStorage\.(getItemAsync|setItemAsync|deleteItemAsync)/);
  }
});
