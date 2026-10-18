import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const screen of ['inventory', 'sell', 'receipts', 'more']) {
  test(`${screen} shows a fresh loading state and clears stale errors when focused`, () => {
    const source = readFileSync(new URL(`../app/(tabs)/${screen}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /useFocusEffect\(React\.useCallback\(\(\) => \{\s*let active = true;[\s\S]*?setLoading\(true\);\s*setError\(''\);/);
    assert.match(source, /if \(active\) setLoading\(false\)/);
  });
}
