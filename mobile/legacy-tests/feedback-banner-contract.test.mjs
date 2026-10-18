import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
test('feedback component is accessible and dismissible', () => {
 const code = read('components/FeedbackBanner.tsx');
 assert.match(code, /accessibilityRole="alert"/);
 assert.match(code, /accessibilityLabel="Dismiss message"/);
 assert.match(code, /onPress=\{onDismiss\}/);
});
for (const screen of ['inventory','sell','receipts','more']) {
 test(`${screen} uses the shared feedback component`, () => {
  const code = read(`app/(tabs)/${screen}.tsx`);
  assert.match(code, /<FeedbackBanner kind="error"/);
  assert.match(code, /<FeedbackBanner kind="info"/);
 });
}
