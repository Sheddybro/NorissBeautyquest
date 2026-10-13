/* Framework-free helpers: no React, no npm build. */
export const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:2}).format(n/100);
export const day=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
export const sum=rows=>rows.reduce((n,m)=>n+m.quantity*m.unit_amount,0);
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const csv=rows=>'\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
export function project(snapshot,queue){
 const products=(snapshot?.products||[]).map(p=>({...p,active:p.active!==false,sellable:p.sellable??p.stock}));const movements=(snapshot?.movements||[]).map(m=>({...m}));const receipts=(snapshot?.receipts||[]).map(r=>({...r}));const refunds=(snapshot?.refunds||[]).map(r=>({...r}));const expenses=(snapshot?.expenses||[]).map(e=>({...e}));
 const allocations=(snapshot?.allocations||[]).map(a=>({...a}));const ids=new Set(movements.map(m=>m.id));const acknowledged=new Set(snapshot?.acknowledged_ids||[]);
 for(const entry of queue){const op=entry.payload;if(entry.status==='conflict'||acknowledged.has(op.request_id))continue;
  if(op.kind==='product'){if(!products.some(p=>p.id===op.request_id))products.push({id:op.request_id,name:op.name,category:op.category,price:op.price,reorder:op.reorder,stock:0,sellable:0,active:true,version:1,barcode:op.barcode||'',photo:op.photo||'',status:'pending'});continue;}
  if(op.kind==='product_update'){const p=products.find(p=>p.id===op.product_id);if(p)Object.assign(p,op,{id:p.id,version:op.version+1,status:'pending'});continue;}
  if(op.kind==='expense'){expenses.push({...op,id:op.request_id,status:'pending'});continue;}
  if(op.kind==='refund'){const m=movements.find(m=>m.id===op.movement_id);if(!m)continue;const p=products.find(p=>p.id===m.product_id);let remaining=op.quantity,validReturned=0;for(const a of allocations.filter(a=>a.movement_id===op.movement_id)){const take=Math.min(remaining,a.quantity-a.returned);a.returned+=take;remaining-=take;if(!a.batch__expires||a.batch__expires>=day(new Date()))validReturned+=take;if(!remaining)break}validReturned+=remaining;if(p&&op.restock){p.stock+=op.quantity;p.sellable+=validReturned}m.returned=(m.returned||0)+op.quantity;refunds.push({...op,id:op.request_id,product_id:m.product_id,amount:op.quantity*m.unit_amount,cost_total:0,status:'pending'});continue;}
  if(!['sale','purchase','checkout'].includes(op.kind)||ids.has(op.request_id))continue;
  const lines=op.kind==='checkout'?op.lines:[op];let total=0;
  for(let i=0;i<lines.length;i++){const line=lines[i],p=products.find(p=>p.id===line.product_id);if(!p)continue;p.stock+=op.kind==='purchase'?line.quantity:-line.quantity;
   const expired=op.kind==='purchase'&&op.expires&&op.expires<day(new Date());p.sellable+=op.kind==='purchase'?(expired?0:line.quantity):-line.quantity;
   const id=op.kind==='checkout'?op.request_id+':'+i:op.request_id;
   movements.push({...op,...line,id,name:p.name,kind:op.kind==='checkout'?'sale':op.kind,receipt_id:op.kind==='purchase'?null:op.request_id,status:'pending',recorded_by:snapshot.account.username,cost_known:false});ids.add(id);total+=line.quantity*line.unit_amount;
  }
  if(op.kind!=='purchase'&&!receipts.some(r=>r.id===op.request_id))receipts.push({id:op.request_id,reference:'PENDING-'+op.request_id.slice(0,8),party:op.party,payment:op.payment,created:op.created,total,status:'pending'});
 }
 products.sort((a,b)=>a.name.localeCompare(b.name));movements.sort((a,b)=>new Date(b.created)-new Date(a.created));receipts.sort((a,b)=>new Date(b.created)-new Date(a.created));return {products,movements,receipts,refunds,expenses};
}
export function week(movements,now=new Date()){const noon=new Date(day(now)+'T12:00:00+01:00');return Array.from({length:7},(_,i)=>{const d=new Date(noon.getTime()-(6-i)*86400000),key=day(d);return {key,label:d.toLocaleDateString('en-NG',{weekday:'short',timeZone:'Africa/Lagos'}),amount:sum(movements.filter(m=>m.kind==='sale'&&day(m.created)===key))}})}
export function validateLocal(op,products,context={}){
 if(['product','product_update'].includes(op.kind)){if(!op.name.trim()||op.name.length>100)throw Error('Enter a product name.');if(!Number.isSafeInteger(op.price)||op.price<1||op.price>1e9)throw Error('Enter a valid selling price.');if(!Number.isSafeInteger(op.reorder)||op.reorder<0||op.reorder>1e6)throw Error('Enter a valid reorder level.');return;}
 if(op.kind==='checkout'){if(!op.lines.length)throw Error('Add a product to the cart.');for(const line of op.lines)validateLocal({...line,kind:'sale',party:op.party},products);return;}
 if(op.kind==='refund'){const m=context.movements?.find(m=>m.id===op.movement_id&&m.kind==='sale'&&m.status!=='pending');if(!m)throw Error('Choose a confirmed sale.');if(!Number.isSafeInteger(op.quantity)||op.quantity<1||op.quantity>m.quantity-(m.returned||0))throw Error('Refund exceeds the remaining sale quantity.');if(!op.reason?.trim())throw Error('Enter a refund reason.');return;}
 if(op.kind==='expense'){if(!Number.isSafeInteger(op.amount)||op.amount<1||op.amount>1e9||!op.description?.trim())throw Error('Enter a description and positive expense amount.');return;}
 if(op.kind==='reconcile'){for(const k of ['opening_cash','actual_cash','actual_transfer','actual_pos'])if(!Number.isSafeInteger(op[k])||op[k]<0||op[k]>1e9)throw Error('Enter valid nonnegative reconciliation amounts.');return;}
 const p=products.find(p=>p.id===op.product_id);if(!p)throw Error('Select a product.');if(p.active===false)throw Error('This product is archived.');
 if(!Number.isSafeInteger(op.quantity)||op.quantity<1||op.quantity>1e6)throw Error('Quantity must be a positive whole number.');
 if(!Number.isSafeInteger(op.unit_amount)||op.unit_amount<1||op.unit_amount>1e9)throw Error('Enter a valid positive unit price.');
 if(op.kind==='sale'&&op.quantity>(p.sellable??p.stock))throw Error(`Only ${p.sellable??p.stock} units are available on this device. Reduce the quantity or record a purchase.`);
 if(op.kind==='purchase'&&!op.party.trim())throw Error('Enter the supplier name.');
}
export function validateStoredOperation(p){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const id=v=>{if(typeof v!=='string'||!uuid.test(v))throw Error('Backup contains an invalid identifier.')};
 const num=(v,min=1,max=1e9)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Backup contains an invalid amount or quantity.')};
 const str=(v,max,optional=false)=>{if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))throw Error('Backup contains invalid text fields.')};
 if(!p||typeof p!=='object')throw Error('Invalid backup operation.');id(p.request_id);
 if(['product','product_update'].includes(p.kind)){str(p.name,100);str(p.category,60);num(p.price);num(p.reorder,0,1e6);if(p.barcode!==undefined)str(p.barcode,80,true);if(p.photo!==undefined&&(typeof p.photo!=='string'||p.photo.length>300000||(p.photo&&!/^data:image\/(jpeg|png|webp);base64,/.test(p.photo))))throw Error('Invalid backup image.');if(p.kind==='product_update'){id(p.product_id);num(p.version);if(typeof p.active!=='boolean')throw Error('Invalid archived status.')}return;}
 if(p.kind==='reconcile'){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.day||''))throw Error('Invalid reconciliation date.');for(const k of ['opening_cash','actual_cash','actual_transfer','actual_pos'])num(p[k],0);str(p.note??'',200,true);return;}
 if(typeof p.created!=='string'||!Number.isFinite(Date.parse(p.created)))throw Error('Invalid backup transaction date.');if(!['Cash','Transfer','POS card'].includes(p.payment))throw Error('Invalid backup payment method.');
 if(['sale','purchase','checkout'].includes(p.kind)){str(p.party,100,p.kind!=='purchase');const lines=p.kind==='checkout'?p.lines:[p];if(!Array.isArray(lines)||!lines.length||lines.length>100)throw Error('Invalid backup cart.');const seen=new Set();for(const line of lines){id(line.product_id);num(line.quantity,1,1e6);num(line.unit_amount);if(seen.has(line.product_id))throw Error('Duplicate backup cart product.');seen.add(line.product_id)}if(p.kind==='purchase'){str(p.batch_code??'',60,true);if(p.expires&&!/^\d{4}-\d{2}-\d{2}$/.test(p.expires))throw Error('Invalid expiry date.')}return;}
 if(p.kind==='refund'){id(p.movement_id);num(p.quantity,1,1e6);str(p.reason,200);if(typeof p.restock!=='boolean')throw Error('Invalid refund stock choice.');return;}
 if(p.kind==='expense'){num(p.amount);str(p.description,150);return;}
 throw Error('Unknown backup operation.');
}
