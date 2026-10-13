/* Framework-free helpers: no React, no npm build. */
export const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:2}).format(n/100);
export const day=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
export const sum=rows=>rows.reduce((n,m)=>n+m.quantity*m.unit_amount,0);
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const csv=rows=>'\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
export function project(snapshot,queue){
 const products=(snapshot?.products||[]).map(p=>({...p}));const movements=(snapshot?.movements||[]).map(m=>({...m}));
 const ids=new Set(movements.map(m=>m.id));
 for(const entry of queue){const op=entry.payload;if(entry.status==='conflict')continue;
  if(op.kind==='product'){if(!products.some(p=>p.id===op.request_id))products.push({id:op.request_id,name:op.name,category:op.category,price:op.price,reorder:op.reorder,stock:0,status:'pending'});continue;}
  if(ids.has(op.request_id))continue;
  const p=products.find(p=>p.id===op.product_id);if(!p)continue;
  p.stock+=op.kind==='purchase'?op.quantity:-op.quantity;
  movements.push({...op,id:op.request_id,name:p.name,status:'pending',recorded_by:snapshot.account.username});ids.add(op.request_id);
 }
 products.sort((a,b)=>a.name.localeCompare(b.name));movements.sort((a,b)=>new Date(b.created)-new Date(a.created));return {products,movements};
}
export function week(movements,now=new Date()){const noon=new Date(day(now)+'T12:00:00+01:00');return Array.from({length:7},(_,i)=>{const d=new Date(noon.getTime()-(6-i)*86400000),key=day(d);return {key,label:d.toLocaleDateString('en-NG',{weekday:'short',timeZone:'Africa/Lagos'}),amount:sum(movements.filter(m=>m.kind==='sale'&&day(m.created)===key))}})}
export function validateLocal(op,products){
 if(op.kind==='product'){if(!op.name.trim()||op.name.length>100)throw Error('Enter a product name.');if(!Number.isSafeInteger(op.price)||op.price<1||op.price>1e9)throw Error('Enter a valid selling price.');if(!Number.isSafeInteger(op.reorder)||op.reorder<0||op.reorder>1e6)throw Error('Enter a valid reorder level.');return;}
 const p=products.find(p=>p.id===op.product_id);if(!p)throw Error('Select a product.');
 if(!Number.isSafeInteger(op.quantity)||op.quantity<1||op.quantity>1e6)throw Error('Quantity must be a positive whole number.');
 if(!Number.isSafeInteger(op.unit_amount)||op.unit_amount<1||op.unit_amount>1e9)throw Error('Enter a valid positive unit price.');
 if(op.kind==='sale'&&op.quantity>p.stock)throw Error(`Only ${p.stock} units are available on this device. Reduce the quantity or record a purchase.`);
 if(op.kind==='purchase'&&!op.party.trim())throw Error('Enter the supplier name.');
}
