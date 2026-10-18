import {initEnhancements} from './enhancements.js';
import {money,day,sum,escapeHTML as esc,csv,project,week,validateLocal} from './core.js';
import * as storage from './storage.js';
const $=id=>document.getElementById(id);
const network=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(12000)});
const icons={dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',bag:'<path d="M5 8h14l2 13H3z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',box:'<path d="m12 3 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9M7 5.8l9 5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',arrow:'<path d="M6 18 18 6M7 6h11v11"/>',trend:'<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18M16 12h5v5h-5z"/>',alert:'<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',logout:'<path d="M9 4H3v16h6M8 12h13m-5-5 5 5-5 5"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.box}</svg>`;
document.querySelectorAll('[data-icon]').forEach(n=>n.innerHTML=icon(n.dataset.icon));
const state={snapshot:null,queue:[],products:[],movements:[],view:'Overview',search:'',page:1,connected:false,csrf:null,syncing:false,mode:'sale',saving:false,authRequired:false,storageOK:false,offlineReady:false};
const pageCopy={
 Overview:['YOUR BUSINESS, AT A GLANCE','A clear view of your shop, from today’s sales to the stock on your shelves.','dashboard'],
 Sales:['EVERY SALE, BEAUTIFULLY TRACKED','Review transactions, check out a customer, and keep every sale in view.','bag'],
 Purchases:['STOCK YOUR SHELVES WITH CONFIDENCE','Record supplier purchases, costs, and incoming stock in one place.','download'],
 Inventory:['YOUR COLLECTION, IN PERFECT ORDER','See what is available, what needs attention, and what is ready to sell.','box'],
 Sync:['YOUR WORKSPACE, IN STEP','Keep this device and your shop up to date, even when the connection drops.','refresh'],
 Staff:['MANAGE THE SHOP TEAM','Create staff accounts, choose their role, and grant extra permissions when needed.','shield'],
 Settings:['BUSINESS SETTINGS','Update the visible shop identity and manage owner-level settings in-app.','wallet'],
 Receipts:['EVERY PURCHASE, ACCOUNTED FOR','Find completed sales and open a receipt whenever you need it.','bag'],
 Reports:['A CLEARER PICTURE OF PERFORMANCE','Explore profit, expenses, and the details behind your shop’s results.','trend'],
 Batches:['CARE IN EVERY BATCH','Track stock lots and expiry dates to keep your shelves in good order.','alert'],
 Reconciliation:['CLOSE THE DAY WITH CONFIDENCE','Compare recorded payments with your cash, transfers, and card totals.','wallet'],
 Audit:['A TRUSTED RECORD OF EVERY CHANGE','Review the activity that keeps your shop’s records clear and accountable.','shield']
};
let deferredPrompt;const channel='BroadcastChannel' in window?new BroadcastChannel('noriss-shop'):null;
const notify=(message,error=false)=>{$('notice').textContent=message;$('notice').hidden=false;$('notice').className=error?'error':'success-banner';};
function download(name,data,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function lock(name,fn){return navigator.locks?navigator.locks.request(name,fn):fn()}
async function readLocal(){const key=await storage.getActive();if(!key)return;state.snapshot=await storage.getSnapshot(key);state.queue=await storage.getQueue(key);render();}
function view(name){state.view=name;state.search='';state.page=1;$('search').value='';render()}
function canWrite(kind){if(!state.snapshot||!state.storageOK)return false;const account=state.snapshot.account;return Array.isArray(account.allowed_operations)?account.allowed_operations.includes(kind):(account.role==='owner'||(['cashier','staff'].includes(account.role)&&['sale','checkout'].includes(kind)))}
function rows(){return state.movements.filter(m=>(state.view!=='Sales'||m.kind==='sale')&&(state.view!=='Purchases'||m.kind==='purchase')&&(`${m.name} ${m.party} ${m.id}`).toLowerCase().includes(state.search.toLowerCase()))}
function filteredProducts(){return state.products.filter(p=>(p.name+' '+p.category).toLowerCase().includes(state.search.toLowerCase()))}
function render(){
 const data=project(state.snapshot,state.queue);state.products=data.products;state.movements=data.movements;state.receipts=data.receipts;state.refunds=data.refunds;state.expenses=data.expenses;
 const account=state.snapshot?.account,loaded=!!account;
 $('account-name').textContent=account?.username||'Your workspace';$('account-role').textContent=account?account.role[0].toUpperCase()+account.role.slice(1)+' · '+account.store:'Sign in to prepare your shop';
 document.querySelectorAll('[data-view]').forEach(n=>{n.classList.toggle('active',n.dataset.view===state.view);if(n.dataset.view===state.view)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});
 $('breadcrumb').textContent=state.view;$('page-title').textContent=state.view==='Overview'?'Shop overview':state.view==='Sync'?'Sync centre':state.view;
 const [eyebrow,subtitle,pageIcon]=pageCopy[state.view]||pageCopy.Overview;$('page-eyebrow').textContent=eyebrow;$('page-subtitle').textContent=subtitle;$('page-hero-emblem').innerHTML=icon(pageIcon);
 $('overview').hidden=state.view!=='Overview';$('records').hidden=['Sync','Reports','Receipts','Batches','Reconciliation','Audit','Staff','Settings'].includes(state.view);$('sync-centre').hidden=state.view!=='Sync';
 const action=state.view==='Inventory'?'product':state.view==='Purchases'?'purchase':'sale';$('primary-action').hidden=['Sync','Reports','Receipts','Batches','Reconciliation','Audit','Staff','Settings'].includes(state.view)||(account&&account.role==='viewer');$('primary-label').textContent=action==='product'?'Add product':action==='purchase'?'Record purchase':'New sale';$('primary-action').disabled=!canWrite(action);$('hero-purchase').hidden=!canWrite('purchase');
 const owner=account?.role==='owner';
 document.querySelector('[data-view="Staff"]').hidden=!owner;
 document.querySelector('[data-view="Settings"]').hidden=!owner;
 document.querySelector('[data-view="Reports"]').hidden=!owner;
 document.querySelector('[data-view="Batches"]').hidden=!owner;
 document.querySelector('[data-view="Reconciliation"]').hidden=!owner;
 document.querySelector('[data-view="Audit"]').hidden=!owner;
 $('queue-count').textContent=state.queue.length;$('queue-count').hidden=!state.queue.length;
 $('sync-status').textContent=state.syncing?'Syncing…':state.connected?state.queue.length?`${state.queue.length} local · Online`:'Online · Up to date':loaded?`Offline · ${state.queue.length} pending`:'Connecting…';$('sync-btn').classList.toggle('offline',!state.connected);
 $('connection-banner').hidden=state.connected||!loaded;
 $('connection-banner').textContent='Offline mode · Using this device’s saved workspace. New records stay pending until the server confirms them.';
 $('auth-banner').hidden=!state.authRequired;
 if(state.authRequired)$('auth-banner').innerHTML='Your online session needs attention. Local records are retained. <a href="/accounts/login/">Sign in again</a> to sync.';
 const today=day(new Date()),daily=state.movements.filter(m=>day(m.created)===today),sales=daily.filter(m=>m.kind==='sale'),purchases=daily.filter(m=>m.kind==='purchase'),stock=state.products.reduce((n,p)=>n+p.stock,0),low=state.products.filter(p=>p.stock<=p.reorder);
 const dayRefunds=(state.refunds||[]).filter(r=>day(r.created)===today).reduce((n,r)=>n+r.amount,0);$('metric-sales').textContent=loaded?money(sum(sales)-dayRefunds):'—';$('metric-purchases').textContent=loaded?money(sum(purchases)):'—';$('metric-stock').textContent=loaded?stock+' units':'—';$('metric-low').textContent=loaded?low.length:'—';
 $('metric-sales-detail').textContent=`${sales.length} sales · ${sales.filter(m=>m.status==='pending').length} pending`;$('metric-purchases-detail').textContent=`${purchases.length} purchases recorded`;$('metric-stock-detail').textContent=`${state.products.length} products · local stock estimate`;
 $('hero-total').textContent=loaded?money(sum(sales)-dayRefunds):'—';$('hero-count').textContent=`${sales.length} transactions recorded`;$('hero-stock').textContent=loaded?stock+' units':'—';
 const days=week(state.movements),chartWidth=720,chartHeight=260,left=68,right=12,top=14,bottom=34,plotWidth=chartWidth-left-right,plotHeight=chartHeight-top-bottom,max=Math.max(0,...days.map(d=>d.amount));
 const points=days.map((d,i)=>({x:left+i*plotWidth/(days.length-1),y:top+plotHeight-(max?d.amount/max*plotHeight:0),day:d}));
 const line=points.map(p=>`${p.x},${p.y}`).join(' '),area=`${left},${top+plotHeight} ${line} ${left+plotWidth},${top+plotHeight}`;
 const grid=Array.from({length:4},(_,i)=>{const y=top+i*plotHeight/3,value=Math.round(max*(1-i/3));return `<g class="sales-grid"><line x1="${left}" y1="${y}" x2="${left+plotWidth}" y2="${y}"/><text x="${left-10}" y="${y+4}" text-anchor="end">${esc(money(value))}</text></g>`}).join('');
 const labels=points.map(p=>`<text class="sales-day" x="${p.x}" y="${chartHeight-7}" text-anchor="middle">${esc(p.day.label)}</text>`).join(''),dots=points.map(p=>`<circle class="sales-point" cx="${p.x}" cy="${p.y}" r="4"><title>${esc(p.day.label)}: ${esc(money(p.day.amount))}</title></circle>`).join('');
 $('sales-chart').innerHTML=`<svg class="sales-graph" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-labelledby="sales-graph-title sales-graph-description"><title id="sales-graph-title">Sales over the last seven days</title><desc id="sales-graph-description">Daily sales from ${esc(days[0].label)} to ${esc(days[6].label)}. Highest day: ${esc(money(max))}.</desc><defs><linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1"><stop class="sales-area-start" offset="0%"/><stop class="sales-area-end" offset="100%"/></linearGradient></defs>${grid}<polygon class="sales-area" points="${area}"/><polyline class="sales-line" points="${line}"/>${dots}${labels}</svg>`;
 $('stock-watch').innerHTML=low.length?low.slice(0,4).map(p=>`<div class="stock-row"><span class="product-icon">${icon('box')}</span><div><b>${esc(p.name)}</b><small>${esc(p.category)}</small></div><span class="warning">${p.stock} left</span></div>`).join(''):`<div class="empty small">${icon('box')}<h3>${loaded&&state.products.length?'Stock looks good':loaded?'Your shelves start here':'Connecting to your shop'}</h3><p>${loaded&&state.products.length?'All products are above their reorder levels.':'Add your products, then record opening stock as a purchase.'}</p>${canWrite('product')?'<button data-empty-action="product">Add a product</button>':''}</div>`;
 renderTable();renderQueue();window.norissExtra?.render();
 $('offline-ready').textContent=state.offlineReady&&loaded?'Offline ready · App shell and workspace saved on this device. Reconnect to sync.':'Offline setup: sign in online and wait for the shell and workspace to be saved.';
 const badge=$('offline-readiness-badge');if(badge){badge.textContent=state.offlineReady&&loaded?'Offline ready':!window.isSecureContext?'Offline requires HTTPS / localhost':loaded?'Preparing offline access':'Sign in to prepare offline';badge.dataset.ready=state.offlineReady&&loaded?'true':'false';}
}
function renderTable(){const inventory=state.view==='Inventory',items=inventory?filteredProducts():rows(),overview=state.view==='Overview';const count=Math.max(1,Math.ceil(items.length/25));state.page=Math.min(state.page,count);const start=overview?0:(state.page-1)*25;const visible=items.slice(start,overview?6:start+25);
 $('table-title').textContent=inventory?'Product catalogue':overview?'Recent activity':'Transaction history';$('table-subtitle').textContent=inventory?`${items.length} products`:`${items.length} records · Includes pending local transactions`;
 $('table-head').innerHTML='<tr>'+(inventory?['Product','Category','Selling price','In stock','Status']:['Product / reference','Type','Date & time','Quantity','Total','Payment','Sync']).map(t=>`<th scope="col">${t}</th>`).join('')+'</tr>';
 $('table-body').innerHTML=visible.map(p=>inventory?`<tr><td><div class="product-cell"><img class="product-thumb" src="${esc(p.photo||'/static/shop/images/beauty-hero.webp')}" alt="" loading="lazy"><b>${esc(p.name)}</b></div></td><td>${esc(p.category)}</td><td>${esc(money(p.price))}</td><td>${p.stock}<small>${p.sellable??p.stock} sellable</small></td><td><span class="badge ${p.stock<=p.reorder?'purchase':'sale'}">${p.active===false?'Archived':p.stock<=p.reorder?'Low stock':'In stock'}</span>${p.status==='pending'?' <span class="badge pending">Pending</span>':''}</td></tr>`:`<tr><td><b>${esc(p.name)}</b><small>${esc(p.party)} · ${p.id.slice(0,8)}</small></td><td><span class="badge ${p.kind}">${p.kind}</span></td><td>${esc(new Date(p.created).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'short',timeStyle:'short'}))}</td><td>${p.quantity}</td><td><b>${esc(money(p.quantity*p.unit_amount))}</b></td><td>${esc(p.payment)}</td><td><span class="badge ${p.status||'synced'}">${p.status==='pending'?'Pending':'Synced'}</span></td></tr>`).join('');
 $('empty-state').hidden=items.length>0;$('empty-state').innerHTML=`${icon('bag')}<h3>${!state.snapshot?'Your workspace is loading':state.search?'No matching records':inventory?'Your catalogue is ready to grow':'No transactions yet'}</h3><p>${state.search?'Try a different name or clear your search.':!state.snapshot?'Connect and sign in once to prepare offline access.':'Add a product and record a purchase to stock your shop. You can then start recording sales.'}</p>${state.search?'<button data-empty-action="clear">Clear search</button>':canWrite('product')?'<button data-empty-action="product">Add your first product</button>':''}`;
 $('pagination').hidden=overview||items.length<=25;$('page-info').textContent=`${start+1}–${Math.min(start+25,items.length)} of ${items.length}`;$('page-number').textContent=`${state.page} / ${count}`;$('previous-page').disabled=state.page===1;$('next-page').disabled=state.page===count;if(state.view==='Inventory')window.norissExtra?.render();
}
function renderQueue(){
 $('queue-list').innerHTML=state.queue.length?state.queue.map(entry=>{const p=entry.payload;const name=p.name||state.products.find(x=>x.id===p.product_id)?.name||'Product';return `<article class="queue-card"><div><h4>${esc(name)} <span class="badge ${entry.status}">${entry.status==='conflict'?'Needs review':'Pending'}</span></h4><p>${esc(p.kind)} ${['sale','purchase'].includes(p.kind)?`· ${p.quantity} units · ${esc(money(p.quantity*p.unit_amount))}`:p.kind==='checkout'?`· ${p.lines.length} cart lines`:''} · ${p.request_id.slice(0,8)}</p>${entry.error?`<p class="error">${esc(entry.error)}</p>`:''}</div><div class="queue-actions"><button data-queue-action="retry" data-id="${entry.id}">Retry</button>${entry.status==='conflict'?`<button class="danger" data-queue-action="discard" data-id="${entry.id}">Discard local record</button>`:''}</div></article>`}).join(''):'<div class="queue-list-empty">'+icon('shield')+'<p>All clear. No unsynced records on this device.</p></div>';
}
async function bootstrap(){const response=await network('/api/bootstrap/',{cache:'no-store',credentials:'same-origin'});let data;try{data=await response.json()}catch{throw Error('The server response was not valid. Your local records are retained.')}
 if(!response.ok){state.connected=true;if(response.status===401||response.status===403){state.authRequired=true;render();return false}throw Error(data.error||'Unable to refresh your shop.')}
 state.csrf=data.csrf_token;state.authRequired=false;state.connected=true;
 await storage.putSnapshot(data);await storage.setActive(data.account.key);state.snapshot=data;state.queue=await storage.getQueue(data.account.key);
 // Persist the authoritative snapshot before removing acknowledged local records.
 const confirmed=new Set(data.acknowledged_ids||[...data.products.map(p=>p.id),...data.movements.map(m=>m.id)]);
 for(const entry of state.queue)if(confirmed.has(entry.id))await storage.removeEntry(entry.id);
 state.queue=await storage.getQueue(data.account.key);channel?.postMessage({account:data.account.key});render();return true;
}
async function synchronise(){if(state.syncing||!state.storageOK)return;state.syncing=true;render();
 try{await lock('noriss-sync',async()=>{
  if(!await bootstrap())return;
  const key=state.snapshot.account.key;
  while(true){state.queue=await storage.getQueue(key);const entry=state.queue[0];if(!entry)break;if(entry.status==='conflict')break;
   const response=await network('/api/operations/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRFToken':state.csrf},body:JSON.stringify(entry.payload)});
   let data;try{data=await response.json()}catch{if(response.status===403){state.authRequired=true;break}throw Error('Could not confirm the save. It remains pending.')}
   if(response.status===401){state.authRequired=true;break}
    if(!response.ok){if(response.status>=500)throw Error(data.error||'Server unavailable.');entry.status='conflict';entry.error=data.error||'Review this record.';await storage.putEntry(entry);await bootstrap();notify('A local record needs review in the Sync centre.',true);break}
   if(!await bootstrap())break;
   if(!state.queue.some(e=>e.id===entry.id))continue;
   throw Error('Record was acknowledged but the updated snapshot is not available yet. Retry syncing.');
  }
 });}catch(e){state.connected=false;if(!state.snapshot)notify(e.message||'Connect and sign in to load your shop.',true)}finally{state.syncing=false;await readLocal();await refreshOfflineReadiness()}}
function setFieldVisibility(kind){const product=['product','product_update'].includes(kind);$('product-fields').hidden=!product;$('movement-fields').hidden=product;['product-name','category','selling-price','reorder-level'].forEach(id=>{$(id).disabled=!product;$(id).required=product});['product-select','quantity','unit-amount','party','payment'].forEach(id=>{$(id).disabled=product;$(id).required=!product&&id!=='party'});$('party').required=kind==='purchase';}
function openForm(kind){if(!canWrite(kind)){notify('Your account does not have permission for this action.',true);return}if(!['product','product_update'].includes(kind)&&!state.products.length){notify('Add a product first, then record a purchase.');if(canWrite('product'))kind='product';else return}
 state.mode=kind;$('entry-form').reset();setFieldVisibility(kind);$('dialog-title').textContent=kind==='product'?'Add a product':kind==='product_update'?'Edit product':kind==='sale'?'Record a sale':'Record a purchase';$('save-btn').textContent=kind==='product_update'?'Save changes':'Save '+kind;$('form-error').hidden=true;
 $('dialog-hint').textContent=['product','product_update'].includes(kind)?'Set up or update an item in your catalogue.':kind==='sale'?'Stock reduces when the transaction is recorded.':'Stock increases when the transaction is recorded.';
 $('product-select').innerHTML=state.products.filter(p=>p.active!==false).map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.stock} available</option>`).join('');$('party').placeholder=kind==='sale'?'Walk-in customer':'Supplier name';$('party-label').firstChild.textContent=kind==='sale'?'Customer (optional)':'Supplier';
 $('offline-form-note').textContent=state.connected?'Saved locally first, then confirmed by the server.':'Offline: this record will be pending until you reconnect and sync.';
 updatePrice();window.norissExtra?.onOpenForm(kind);$('entry-dialog').showModal();(kind==='product'?$('product-name'):$('product-select')).focus();
}
function updatePrice(){if(state.mode==='sale')$('unit-amount').value=(state.products.find(p=>p.id===$('product-select').value)?.price||0)/100;updateTotal()}
function updateTotal(){$('form-total').textContent=money(Math.round(Number($('unit-amount').value)*100)*Number($('quantity').value||0))}
async function submit(e){e.preventDefault();if(state.saving)return;state.saving=true;$('entry-fields').disabled=true;$('save-btn').textContent='Saving on this device…';$('form-error').hidden=true;
 try{const key=state.snapshot.account.key;await lock('noriss-write-'+key,async()=>{await readLocal();if(state.snapshot.account.key!==key)throw Error('Your account changed. Close this form and sign in again.');if(!canWrite(state.mode))throw Error('This action is not permitted.');
  const payload={request_id:crypto.randomUUID(),kind:state.mode};if(['product','product_update'].includes(state.mode))Object.assign(payload,{name:$('product-name').value.trim(),category:$('category').value,price:Math.round(Number($('selling-price').value)*100),reorder:Number($('reorder-level').value)});else Object.assign(payload,{product_id:$('product-select').value,quantity:Number($('quantity').value),unit_amount:Math.round(Number($('unit-amount').value)*100),party:$('party').value.trim(),payment:$('payment').value,created:new Date().toISOString()});
  if(window.norissExtra?.decoratePayload)await window.norissExtra.decoratePayload(payload);validateLocal(payload,state.products);const order=Math.max(Date.now(),...state.queue.map(x=>x.order+1));await storage.putEntry({id:payload.request_id,account:key,payload,status:'pending',order});
 });$('entry-dialog').close();await readLocal();notify('Record saved on this device. '+(state.connected?'Syncing with your shop…':'It will sync when you reconnect.'));channel?.postMessage({account:key});synchronise();
 }catch(e){$('form-error').textContent=e.message||'Storage is unavailable. Record was not saved.';$('form-error').hidden=false}finally{state.saving=false;$('entry-fields').disabled=false;$('save-btn').textContent=state.mode==='product_update'?'Save changes':'Save '+state.mode}}
async function queueAction(action,id){await lock('noriss-write-'+state.snapshot.account.key,async()=>{state.queue=await storage.getQueue(state.snapshot.account.key);const entry=state.queue.find(e=>e.id===id);if(!entry)return;
 if(action==='discard'){if(!confirm('Discard this unsynced local record? It will not change any already confirmed server transaction. Download a backup first if you need a copy.'))return;await storage.removeEntry(id)}else{entry.status='pending';entry.error='';await storage.putEntry(entry)}});await readLocal();if(action==='retry')synchronise();channel?.postMessage({account:state.snapshot.account.key})}
function exportRecords(){const inventory=state.view==='Inventory';const data=inventory?[['Product','Category','Selling price NGN','Stock','Reorder level','Sync'],...filteredProducts().map(p=>[p.name,p.category,p.price/100,p.stock,p.reorder,p.status||'synced'])]:[['Date','Type','Product','Quantity','Unit price NGN','Total NGN','Customer / Supplier','Payment','Sync','Reference'],...rows().map(m=>[m.created,m.kind,m.name,m.quantity,m.unit_amount/100,m.quantity*m.unit_amount/100,m.party,m.payment,m.status,m.id])];download(inventory?'noriss-inventory.csv':'noriss-transactions.csv',csv(data),'text/csv;charset=utf-8')}
async function backup(){try{const key=await storage.getActive();const data=await storage.exportAccountData(key);download('noriss-offline-backup.json',JSON.stringify(data,null,2),'application/json');notify('Backup downloaded. Keep it private; it contains shop records.')}catch(error){notify('Could not export offline records: '+error.message,true)}}
async function logout(){if(!state.connected){notify('Reconnect before signing out. This keeps the local workspace and server session consistent.',true);return}await readLocal();if(state.queue.length){view('Sync');notify('Sync or explicitly discard your local records before signing out. Download a backup first.',true);return}if(!confirm('Sign out and remove this account’s offline workspace from this device?'))return;
 try{if(!await bootstrap())return;await storage.clearAccount(state.snapshot.account.key);const form=$('logout-form');let input=form.querySelector('[name=csrfmiddlewaretoken]');if(!input){input=document.createElement('input');input.name='csrfmiddlewaretoken';input.type='hidden';form.append(input)}input.value=state.csrf;form.submit()}catch(e){notify(e.message,true)}}
document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>view(n.dataset.view)));
$('primary-action').onclick=()=>openForm(state.view==='Inventory'?'product':state.view==='Purchases'?'purchase':'sale');$('hero-purchase').onclick=()=>openForm('purchase');$('view-inventory').onclick=()=>view('Inventory');$('search').oninput=e=>{state.search=e.target.value.trim();state.page=1;renderTable()};$('export-btn').onclick=exportRecords;$('previous-page').onclick=()=>{state.page--;renderTable()};$('next-page').onclick=()=>{state.page++;renderTable()};$('sync-btn').onclick=synchronise;$('retry-all').onclick=synchronise;$('backup-btn').onclick=backup;$('logout-btn').onclick=logout;
$('entry-form').onsubmit=submit;$('close-dialog').onclick=()=>{if(!state.saving)$('entry-dialog').close()};$('entry-dialog').addEventListener('cancel',e=>{if(state.saving)e.preventDefault()});$('product-select').onchange=updatePrice;$('quantity').oninput=updateTotal;$('unit-amount').oninput=updateTotal;
document.addEventListener('click',e=>{const empty=e.target.closest('[data-empty-action]');if(empty){if(empty.dataset.emptyAction==='clear'){state.search='';$('search').value='';renderTable()}else openForm(empty.dataset.emptyAction)}const q=e.target.closest('[data-queue-action]');if(q)queueAction(q.dataset.queueAction,q.dataset.id).catch(e=>notify(e.message,true))});
const isPhone=/Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
if(isPhone){$('install-help').hidden=true;$('install-btn').hidden=true;}
$('install-help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
window.addEventListener('beforeinstallprompt',e=>{if(isPhone)return;e.preventDefault();deferredPrompt=e;$('install-btn').hidden=false});$('install-btn').onclick=async()=>{if(!deferredPrompt)return;await deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('install-btn').hidden=true};window.addEventListener('appinstalled',()=>{$('install-btn').hidden=true;notify('Noriss Beautyquest has been installed.')});
window.addEventListener('online',synchronise);window.addEventListener('offline',()=>{state.connected=false;render()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)synchronise()});
channel?.addEventListener('message',()=>readLocal().catch(e=>notify(e.message,true)));
async function checkOfflineShell(){
 if(!('caches' in window))return false;
 const cache=await caches.open('noriss-shell-v10');
 for(const url of ['/offline-shell/','/static/shop/app.js','/static/shop/core.js','/static/shop/storage.js','/static/shop/enhancements.js']){
  if(!await cache.match(url))return false;
 }
 return true;
}
async function refreshOfflineReadiness(){
 try{
  const workerReady='serviceWorker' in navigator&&!!(await navigator.serviceWorker.getRegistration('/'))?.active;
  state.offlineReady=!!(workerReady&&state.snapshot?.account&&await checkOfflineShell());
 }catch{state.offlineReady=false;}
 render();
}
async function start(){try{
 await storage.openDB();state.storageOK=true;await readLocal();
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
 if('serviceWorker' in navigator&&window.isSecureContext){
  try{
   const registration=await navigator.serviceWorker.register('/sw.js');
   registration.update().catch(()=>{});
   // Do not block normal sales/dashboard startup waiting for an SW install.
   const ready=await Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),20000))]);
   if(!ready)notify('Offline installation is still pending. Inspect /sw.js and its essential assets in DevTools.',true);
  }catch(e){notify('Offline installation failed: '+(e.message||String(e)),true);}
 }else if(!window.isSecureContext)notify('Offline installation requires HTTPS or localhost.',true);
 await synchronise();await refreshOfflineReadiness();
 if(!isPhone)navigator.serviceWorker?.addEventListener('controllerchange',()=>refreshOfflineReadiness());
 setInterval(()=>{if(!document.hidden)synchronise()},5000);
 }catch(e){notify('Offline storage is unavailable. '+e.message+'. No records will be accepted until storage is working.',true);state.storageOK=false;render()}}

window.norissExtra=initEnhancements({state,storage,render,notify,readLocal,synchronise,view,openForm,lock,canWrite,icon,download});
start();
