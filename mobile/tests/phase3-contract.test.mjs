import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');
test('startup keeps saved token when connection is unavailable',()=>{
 assert.match(src,/Do not delete the saved token on transient network failures/);
 assert.match(src,/setRestoring\(false\)/);
});
test('restored pending operations are discoverable',()=>{
 assert.match(src,/else if\(pendingPurchaseBody\.current\)setTab\('Stock In'\)/);
 assert.match(src,/else if\(pendingCheckoutBody\.current\)setTab\('Checkout'\)/);
 assert.match(src,/Transaction awaiting confirmation/);
});
test('low stock excludes zero stock',()=>{
 assert.match(src,/stockFilter==='Low stock'&&p\.active&&p\.sellable>0&&p\.sellable<=5/);
});
