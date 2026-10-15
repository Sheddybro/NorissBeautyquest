/* IndexedDB writes resolve only after the transaction commits. */
const DB_NAME='noriss-retail-v1';
let database;
let opening;
// Concurrent startup calls must share one connection attempt. A failed open
// must not poison later retries after a user closes a blocking tab.
export function openDB(){
 if(database)return Promise.resolve(database);
 if(opening)return opening;
 opening=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>{
   const db=r.result;
   if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'key'});
   if(!db.objectStoreNames.contains('queue')){
    const q=db.createObjectStore('queue',{keyPath:'id'});
    q.createIndex('account','account');
   }
   if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
  };
  r.onsuccess=()=>{
   const db=r.result;
   db.onversionchange=()=>{db.close();if(database===db)database=null;};
   db.onclose=()=>{if(database===db)database=null;};
   database=db;
   resolve(db);
  };
  r.onblocked=()=>reject(Error('Another Noriss tab is blocking the local database upgrade. Close other tabs and reload.'));
  r.onerror=()=>reject(r.error||Error('Unable to open offline storage.'));
 }).finally(()=>{opening=null;});
 return opening;
}

async function run(store,mode,action){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);let request;try{request=action(tx.objectStore(store))}catch(error){tx.abort();reject(error);return}let result;request.onsuccess=()=>result=request.result;request.onerror=()=>reject(request.error);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local storage was interrupted.'))})}
export const getActive=async()=>((await run('meta','readonly',s=>s.get('active')))?.value||null);
export const setActive=key=>run('meta','readwrite',s=>s.put({key:'active',value:key}));
export const getSnapshot=key=>run('snapshots','readonly',s=>s.get(key));
export const putSnapshot=(data)=>run('snapshots','readwrite',s=>s.put({key:data.account.key,...data,csrf_token:undefined}));
export const getQueue=key=>run('queue','readonly',s=>s.index('account').getAll(key)).then(rows=>rows.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)));
export const putEntry=entry=>run('queue','readwrite',s=>s.put(entry));
export const removeEntry=id=>run('queue','readwrite',s=>s.delete(id));
export async function clearAccount(key){const queue=await getQueue(key);if(queue.length)throw Error('Sync or back up and explicitly discard pending records before signing out.');await run('snapshots','readwrite',s=>s.delete(key));await run('meta','readwrite',s=>s.delete('active'));}
export async function importEntries(account,entries){
 const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('queue','readwrite');const store=tx.objectStore('queue');for(const e of entries){const request=store.get(e.id);request.onsuccess=()=>{if(!request.result)store.put({...e,account,status:e.status==='conflict'?'conflict':'pending'})}}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
}

// A durable export is available independently of server connectivity. Never silently
// discard pending operations: the user must explicitly export or synchronize them.
export async function exportAccountData(key){
 if(!key)throw Error('An active account is required to export offline data.');
 const [snapshot,queue]=await Promise.all([getSnapshot(key),getQueue(key)]);
 if(!snapshot)throw Error('No offline snapshot exists for this account.');
 const {csrf_token,...safeSnapshot}=snapshot;
 return {format:'noriss-local-backup-v2',exported:new Date().toISOString(),account:safeSnapshot.account,snapshot:safeSnapshot,queue};
}
export async function getStorageStatus(key){
 const queue=key?await getQueue(key):[];
 return {pending:queue.filter(item=>item.status==='pending').length,conflicts:queue.filter(item=>item.status==='conflict').length,total:queue.length};
}
