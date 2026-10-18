import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../app/index.tsx');
const api=read('../services/api.ts');
const sell=read('../app/(tabs)/sell.tsx');
const inventory=read('../app/(tabs)/inventory.tsx');
const receipts=read('../app/(tabs)/receipts.tsx');
test('mobile login keeps an accessible password visibility control in the field',()=>{
 assert.match(src,/secureTextEntry=\{!showPassword\}/);
 assert.match(src,/accessibilityLabel=\{showPassword\?'Hide password':'Show password'\}/);
 assert.match(src,/passwordToggleText\}\>\{showPassword\?'Hide':'Show'\}/);
});
test('purchase, checkout and refund persist their actual request bodies',()=>{
	assert.match(sell,/deviceStorage\.setItemAsync\(pendingStorageKey, JSON\.stringify\(payload\)\)/);
	assert.match(inventory,/deviceStorage\.setItemAsync\(purchaseStorageKey, JSON\.stringify\(payload\)\)/);
	assert.match(receipts,/deviceStorage\.setItemAsync\(storageKey, JSON\.stringify\(next\)\)/);
 assert.doesNotMatch(src,/recovery-checkout|restorePending\(/);
});
test('network requests time out and expose a recovery message',()=>{
 assert.match(api,/AbortController/);
 assert.match(api,/clearTimeout\(timeout\)/);
 assert.match(api,/Server did not respond within 12 seconds/);
});
test('owner and staff management remain present',()=>{
 const more=read('../app/(tabs)/more.tsx');
 for(const route of ['/api/v1/owner/settings/','/api/v1/owner/staff/'])assert.ok(more.includes(route));
});
test('connection diagnostics live separately from credential entry',()=>{
 const support=read('../app/support.tsx');
 assert.match(src,/router\.push\('\/support'\)/);
 assert.doesNotMatch(src,/checkConnection|API_HINT|Check connection|connectionPanel/);
 assert.match(support,/getApiConfigStatus/);
 assert.match(support,/health\//);
 assert.match(support,/Check connection/);
 assert.doesNotMatch(support,/auth\/login|saveSession/);
});
test('dashboard refresh uses one scroll container and sale shortcut respects server grants',()=>{
 const home=read('../app/(tabs)/home.tsx');
 const frame=read('../components/ScreenFrame.tsx');
 assert.match(home,/scrollable=\{false\}/);
 assert.match(home,/canPerform\(dashboard\?\.account, 'checkout'\)/);
 assert.match(home,/\{canCheckout \? \(/);
 assert.match(frame,/scrollable \? \(/);
 assert.match(home,/dashboard\?\.metrics\?\.refunds_today/);
});
test('login provides accessible keyboard progression and preserves saved-session validation',()=>{
 assert.match(src,/ref=\{usernameRef\}/);
 assert.match(src,/onSubmitEditing=\{\(\) => passwordRef\.current\?\.focus\(\)\}/);
 assert.match(src,/router\.replace\('\/\(tabs\)\/home'\)/);
 assert.match(src,/call\('\/api\/v1\/me\/', token\)/);
 assert.match(src,/err\?\.connectionFailure/);
 assert.match(api,/readonly status\?: number/);
 assert.match(api,/false, response\.status\)/);
});
test('mobile screens use the centralized API client',()=>{
 assert.match(src,/apiCall as call/);
 assert.match(api,/export async function apiCall/);
});
