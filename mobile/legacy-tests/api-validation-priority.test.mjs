import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8');

test('explicit Django errors and field validation are not overridden by status fallbacks', () => {
  assert.match(source, /const fallback = response\.status === 401/);
  assert.match(source, /const message = \(typeof candidate === 'string' && candidate\.trim\(\)\) \|\| validation \|\| fallback;/);
  assert.doesNotMatch(source, /validation \|\|\s*response\.status === 401 \?/);
});

test('the API client retains specific authorization and server fallbacks', () => {
  assert.match(source, /response\.status === 403 \?/);
  assert.match(source, /response\.status === 429 \?/);
  assert.match(source, /response\.status >= 500 \?/);
});
