import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const screen of ['sell','inventory','receipts','more']) {
  test(`${screen} uses cryptographic request IDs`, () => {
    const code = readFileSync(new URL(`../app/(tabs)/${screen}.tsx`, import.meta.url), 'utf8');
    assert.match(code, /makeRequestId/);
    assert.doesNotMatch(code, /Math\.random\(/);
  });
}
