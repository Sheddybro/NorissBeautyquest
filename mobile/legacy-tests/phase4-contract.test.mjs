import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const screen=read('../app/index.tsx');
test('shared accessible button wired into screen',()=>{
 assert.match(screen,/import \{ActionButton\}/);assert.match(screen,/<ActionButton label=\{label\}/);
 const button=read('../components/ActionButton.tsx');
 assert.match(button,/accessibilityState/);assert.match(button,/disabled=\{inactive\}/);
});
test('theme tokens used by main screen',()=>{
 assert.match(read('../components/ScreenFrame.tsx'),/palette\.background/);assert.match(read('../theme/tokens.ts'),/primaryDark/);
});
test('transaction screens retain durable request identities',()=>{
 for(const [file,fragment] of [
  ['../app/(tabs)/sell.tsx','pendingSale ??'],
  ['../app/(tabs)/inventory.tsx','pendingPurchase ??'],
  ['../app/(tabs)/receipts.tsx','existing ??'],
 ])assert.ok(read(file).includes(fragment),fragment);
});
test('server-side auth and owner endpoints retained',()=>{
 const more=read('../app/(tabs)/more.tsx');
 for(const endpoint of ['/api/v1/owner/settings/','/api/v1/owner/staff/','/api/v1/auth/logout/'])assert.ok(more.includes(endpoint));
});
