import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const screen=read('../app/index.tsx');
test('navigation component preserves permission-filtered item list',()=>{assert.match(screen,/items=\{navItems\.filter\(/);assert.match(read('../components/BottomNavigation.tsx'),/accessibilityState=\{\{selected:item===active\}\}/);assert.match(screen,/onSelect=\{navigate\}/);assert.match(read('../components/WorkspaceTabs.tsx'),/accessibilityState=\{\{selected:item===active\}\}/);});
test('dashboard metrics extracted without changing data expressions',()=>{for(const expression of ['products.length','receipts.length','eligible.length','products.filter(p=>p.active&&p.sellable<=5).length'])assert.ok(screen.includes(expression),expression);assert.match(read('../components/MetricCard.tsx'),/accessibilityLabel/);});
test('critical transaction recovery remains in place',()=>{for(const part of ['pendingCheckoutBody.current','pendingPurchaseBody.current','pendingRefundBody.current','persistPending','clearPending'])assert.ok(screen.includes(part),part);});
