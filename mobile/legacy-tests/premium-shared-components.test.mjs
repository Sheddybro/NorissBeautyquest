import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('all main screens use the common branded frame', () => {
  for (const name of ['home', 'inventory', 'sell', 'receipts', 'more']) {
    assert.match(read(`../app/(tabs)/${name}.tsx`), /<ScreenFrame\b/);
  }
});
test('KPI values scale to prevent clipping on narrow phones', () => {
  assert.match(read('../components/MetricCard.tsx'), /adjustsFontSizeToFit/);
  assert.match(read('../components/MetricCard.tsx'), /accessibilityLabel/);
});
test('shared action buttons block duplicate taps while busy', () => {
  const source = read('../components/ActionButton.tsx');
  assert.match(source, /disabled=\{inactive\}/);
  assert.match(source, /busy \? <ActivityIndicator/);
});
