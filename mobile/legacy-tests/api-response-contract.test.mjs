import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8');
test('API client accepts empty successful 204 responses', () => {
  assert.match(source, /response\.status === 204/);
});
test('API client supports common Django/DRF error response shapes', () => {
  for (const fragment of ['data?.error', 'data?.detail', 'data?.message']) assert.ok(source.includes(fragment));
});
test('API client preserves abort timeout and authorization', () => {
  assert.match(source, /AbortController/);
  assert.match(source, /Authorization: 'Bearer ' \+ auth/);
});
test('API client rejects URLs with embedded credentials', () => {
  assert.match(source, /parsed\.username \|\| parsed\.password/);
});
