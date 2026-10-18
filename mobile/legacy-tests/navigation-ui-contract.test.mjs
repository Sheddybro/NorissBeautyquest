import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const nav = readFileSync(new URL('../components/BottomNavigation.tsx', import.meta.url), 'utf8');
const frame = readFileSync(new URL('../components/ScreenFrame.tsx', import.meta.url), 'utf8');
test('bottom navigation includes More and Sell symbols', () => { assert.match(nav, /Sell:/); assert.match(nav, /More:/); });
test('selected tab is announced and does not dispatch duplicate selection', () => { assert.match(nav, /accessibilityState=\{\{ selected \}\}/); assert.match(nav, /if \(!selected\) onSelect\(item\)/); });
test('workspace label does not imply live connection status', () => { assert.doesNotMatch(frame, /statusDot} \/>/); assert.match(frame, /RETAIL APP/); });
