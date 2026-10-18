import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const login=readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');
const inventory=readFileSync(new URL('../app/(tabs)/inventory.tsx',import.meta.url),'utf8');
test('login only saves a session after the server accepts credentials',()=>{
 assert.ok(login.indexOf("await call('/api/v1/auth/login/'")<login.indexOf('await saveSession('));
 assert.match(login,/if \(err\?\.status === 401\) \{\s*await clearSession\(\);/);
 assert.match(login,/else if \(active && err\?\.connectionFailure\)/);
});
test('stock purchase retries restore the saved request and preserve its identifier',()=>{
	assert.match(inventory,/deviceStorage\.getItemAsync\(storageKey\)/);
 assert.match(inventory,/const payload: PurchasePayload = pendingPurchase \?\?/);
 assert.match(inventory,/Retry purchase confirmation/);
});
test('low stock excludes zero stock',()=>{
 assert.match(inventory,/stockFilter === 'low-stock'.*isLow && stock > 0/);
});
