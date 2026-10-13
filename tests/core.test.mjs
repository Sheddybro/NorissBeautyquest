import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../static/shop/core.js',import.meta.url),'utf8');
const {project,validateLocal,week,day,sum,csv,escapeHTML}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const snapshot={account:{username:'owner'},products:[{id:'p',name:'Serum',category:'Skincare',price:10000,reorder:5,stock:10}],movements:[]};
const queue=[{id:'buy',status:'pending',payload:{request_id:'buy',kind:'purchase',product_id:'p',quantity:5,unit_amount:5000,created:'2026-10-12T08:00:00Z'}},{id:'sell',status:'pending',payload:{request_id:'sell',kind:'sale',product_id:'p',quantity:3,unit_amount:10000,created:'2026-10-12T09:00:00Z'}}];
assert.equal(project(snapshot,queue).products[0].stock,12);
assert.equal(snapshot.products[0].stock,10); // no mutation of authoritative data
assert.equal(project(snapshot,queue).movements.length,2);
const updated={...snapshot,products:[{...snapshot.products[0],stock:12}],movements:project(snapshot,queue).movements.map(m=>({...m,status:'synced'}))};
assert.equal(project(updated,queue).products[0].stock,12); // lost acknowledgment must not double-count
assert.equal(project(updated,queue).movements.length,2);
assert.equal(project(snapshot,[{...queue[1],status:'conflict'}]).products[0].stock,10);
assert.equal(project(snapshot,[{...queue[1],status:'conflict'}]).movements.length,0);
const localProduct={id:'local',status:'pending',payload:{request_id:'local',kind:'product',name:'Lotion',category:'Skincare',price:50000,reorder:5}};
const localPurchase={id:'local-buy',status:'pending',payload:{request_id:'local-buy',kind:'purchase',product_id:'local',quantity:8,unit_amount:20000,created:'2026-10-12T09:00:00Z'}};
assert.equal(project(snapshot,[localProduct,localPurchase]).products.find(p=>p.id==='local').stock,8);
assert.throws(()=>validateLocal({kind:'sale',product_id:'p',quantity:11,unit_amount:10000,party:''},snapshot.products),/Only 10/);
assert.throws(()=>validateLocal({kind:'sale',product_id:'p',quantity:1.5,unit_amount:10000,party:''},snapshot.products),/whole/);
assert.throws(()=>validateLocal({kind:'purchase',product_id:'p',quantity:1,unit_amount:10000,party:''},snapshot.products),/supplier/);
assert.throws(()=>validateLocal({kind:'product',name:'',price:10000,reorder:5},[]),/name/);
assert.equal(day('2026-10-11T23:30:00Z'),'2026-10-12');
const w=week([{kind:'sale',quantity:2,unit_amount:10000,created:'2026-10-11T23:30:00Z'}],new Date('2026-10-12T00:05:00Z'));
assert.equal(w.length,7);assert.equal(w[0].key,'2026-10-06');assert.equal(w[6].amount,20000);assert.equal(sum(project(snapshot,queue).movements),55000);
assert.ok(csv([[' =SUM(A1)','"quoted",line\nbreak']]).includes("' =SUM"));assert.ok(csv([['"hi"']]).includes('""hi""'));assert.equal(escapeHTML('<script>&"'), '&lt;script&gt;&amp;&quot;');
console.log('PASS: offline projections, acknowledgement deduplication, conflicts, dependent product/purchase, validation, Lagos dates, totals, CSV safety and HTML escaping.');
