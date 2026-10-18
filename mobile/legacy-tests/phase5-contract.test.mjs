import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const screen=read('../app/index.tsx');
test('Expo tab navigation registers the five implemented screens',()=>{
	const tabs=read('../app/(tabs)/_layout.tsx');
	for(const route of ['home','inventory','sell','receipts','more'])assert.match(tabs,new RegExp(`Tabs\.Screen name="${route}"`));
	assert.match(tabs,/headerShown: false/);
	assert.match(tabs,/href: permissionsLoading \|\| !canPerform\(account, 'checkout'\) \? null : undefined/);
});
test('navigation and inventory mutations follow server-provided grants',()=>{
	const permissions=read('../utils/permissions.ts');
	const sell=read('../app/(tabs)/sell.tsx');
	const inventory=read('../app/(tabs)/inventory.tsx');
	const receipts=read('../app/(tabs)/receipts.tsx');
	assert.match(permissions,/account\?\.allowed_operations\?\.includes\(operation\) === true/);
	assert.match(sell,/canPerform\(me\?\.account, 'checkout'\)/);
	assert.match(sell,/!loading && canCheckout/);
	assert.match(inventory,/canPerform\(account, 'product'\)/);
	assert.match(inventory,/canPerform\(account, 'product_update'\)/);
	assert.match(inventory,/canPerform\(account, 'purchase'\)/);
	assert.match(inventory,/\(selectedProduct \|\| pendingPurchase\) && canPurchase/);
	assert.match(receipts,/canPerform\(me\?\.account, 'refund'\)/);
	assert.match(receipts,/canRefund && \(remaining > 0 \|\| Boolean\(pending\)\)/);
});
test('dashboard is backed by the versioned API and uses live response fields',()=>{
	const home=read('../app/(tabs)/home.tsx');
	assert.match(home,/apiCall\('\/api\/v1\/dashboard\/'/);
	assert.match(home,/dashboard\?\.products/);
	assert.match(home,/dashboard\?\.receipts/);
	assert.match(home,/dashboard\?\.metrics\?\.net_sales_today/);
	assert.match(home,/dashboard\?\.metrics\?\.purchases_today/);
	assert.match(home,/dashboard\?\.metrics\?\.sales_trend/);
	assert.doesNotMatch(home,/receipts\.reduce\(/);
});
test('all money-moving screens persist unresolved operations per verified store and user',()=>{
  const keys=read('../utils/pendingKeys.ts');
  assert.match(keys,/account\?\.key/);
  assert.match(keys,/account\.store_id/);
  assert.match(keys,/account\.user_id/);
  for(const [file,kind] of [['../app/(tabs)/sell.tsx','checkout'],['../app/(tabs)/inventory.tsx','purchase'],['../app/(tabs)/receipts.tsx','refunds'],['../app/(tabs)/more.tsx','expense']]) {
    const source=read(file);
    assert.ok(source.includes(`pendingOperationKey('${kind}'`));
	assert.match(source,/deviceStorage\.setItemAsync/);
  }
});
test('sell and receipt flows expose real product search and refund operations',()=>{
	assert.match(read('../app/(tabs)/sell.tsx'),/searchTerm|updateCartItem|Quantity/);
	assert.match(read('../app/(tabs)/receipts.tsx'),/movement_id|handleRefund|remaining/);
});
test('owner staff access uses supported permissions and server-backed updates',()=>{
	const more=read('../app/(tabs)/more.tsx');
	assert.match(more,/action: 'update'/);
	assert.match(more,/await loadStaff\(token\)/);
	for(const permission of ['product','product_update','checkout','purchase','refund','expense','reconcile'])assert.ok(more.includes(`key: '${permission}'`),permission);
	assert.doesNotMatch(more,/['"]sale['"]\s*,\s*['"]checkout['"]/);
	assert.doesNotMatch(more,/id: Date\.now\(\)/);
});
test('expenses are permission gated, kobo-correct, and recoverable',()=>{
	const more=read('../app/(tabs)/more.tsx');
	assert.match(more,/account\?\.allowed_operations\?\.includes\('expense'\)/);
	assert.match(more,/apiCall\('\/api\/v1\/expenses\/'/);
	assert.match(more,/parseNairaToKobo\(expenseAmount\)/);
	assert.match(more,/deviceStorage\.setItemAsync\(expenseStorageKey, JSON\.stringify\(payload\)\)/);
	assert.match(more,/const payload: ExpensePayload = pendingExpense \?\?/);
	assert.match(more,/Retry expense confirmation/);
	assert.ok(more.indexOf('deviceStorage.setItemAsync(expenseStorageKey') < more.indexOf("await apiCall('/api/v1/expenses/', token, payload)"));
});
test('profit report is owner-only and uses server calculations with date bounds',()=>{
	const more=read('../app/(tabs)/more.tsx');
	assert.match(more,/account\?\.role === 'owner' \? \(/);
	assert.match(more,/apiCall\(`\/api\/v1\/reports\/\$\{suffix\}`/);
	for(const metric of ['gross_sales','refunds','net_sales','cost_of_goods_sold','known_cost_gross_profit','expenses','estimated_operating_profit','unknown_cost_sales']){
		assert.ok(more.includes(`metrics.${metric}`),metric);
	}
	assert.match(more,/reportFrom > reportTo/);
});
test('checkout recovery persists and reuses the original idempotent payload',()=>{
	const sell=read('../app/(tabs)/sell.tsx');
	assert.match(sell,/deviceStorage\.getItemAsync\(storageKey\)/);
	assert.match(sell,/deviceStorage\.setItemAsync\(pendingStorageKey, JSON\.stringify\(payload\)\)/);
	assert.match(sell,/const payload: CheckoutPayload = pendingSale \?\? \{/);
	assert.match(sell,/if \(!summary\.lines\.length && !pendingSale\)/);
	assert.match(sell,/Retry sale confirmation/);
	assert.match(sell,/if \(nextQty > stock\)/);
	assert.ok(sell.indexOf('deviceStorage.setItemAsync(pendingStorageKey') < sell.indexOf("apiCall('/api/v1/checkout/'"));
});
test('stock purchases convert Naira input and retry their saved request',()=>{
	const inventory=read('../app/(tabs)/inventory.tsx');
	assert.match(inventory,/deviceStorage\.getItemAsync\(storageKey\)/);
	assert.match(inventory,/const payload: PurchasePayload = pendingPurchase \?\?/);
	assert.match(inventory,/parseNairaToKobo\(unitAmount\)/);
	assert.match(inventory,/Retry purchase confirmation/);
	assert.ok(inventory.indexOf('deviceStorage.setItemAsync(purchaseStorageKey') < inventory.indexOf("apiCall('/api/v1/purchases/'"));
});
test('refunds support partial quantities and durable idempotent retries',()=>{
	const receipts=read('../app/(tabs)/receipts.tsx');
	assert.match(receipts,/deviceStorage\.getItemAsync\(key\)/);
	assert.match(receipts,/const payload: RefundPayload = existing \?\?/);
	assert.match(receipts,/quantity: refundQty/);
	assert.match(receipts,/restock,/);
	assert.match(receipts,/reason: reason\.trim\(\)/);
	assert.match(receipts,/setRefundQuantities/);
	assert.match(receipts,/Retry \$\{pending\.quantity\}/);
	assert.ok(receipts.indexOf('deviceStorage.setItemAsync(storageKey, JSON.stringify(next))') < receipts.indexOf("apiCall('/api/v1/refunds/'"));
});
