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
 assert.match(screen,/palette\.background/);assert.match(read('../theme/tokens.ts'),/primaryDark/);
});
test('transaction identity and request reuse retained',()=>{
 for(const fragment of ['accountIdentity(account)','pendingCheckoutBody.current','pendingPurchaseBody.current','pendingRefundBody.current','request_id:uuid()'])assert.ok(screen.includes(fragment),fragment);
});
test('server-side auth and owner endpoints retained',()=>{
 for(const endpoint of ['/api/v1/owner/settings/','/api/v1/owner/staff/','/api/v1/auth/logout/'])assert.ok(screen.includes(endpoint));
});
