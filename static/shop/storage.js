/* IndexedDB writes resolve only after the transaction commits. */
const DB_NAME='noriss-retail-v1';
let database;
export async function openDB(){if(database)return database;database=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('snapshots',{keyPath:'key'});const q=db.createObjectStore('queue',{keyPath:'id'});q.createIndex('account','account');db.createObjectStore('meta',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return database;}
async function run(store,mode,action){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const request=action(tx.objectStore(store));let result;request.onsuccess=()=>result=request.result;request.onerror=()=>reject(request.error);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local storage was interrupted.'))})}
export const getActive=async()=>((await run('meta','readonly',s=>s.get('active')))?.value||null);
export const setActive=key=>run('meta','readwrite',s=>s.put({key:'active',value:key}));
export const getSnapshot=key=>run('snapshots','readonly',s=>s.get(key));
export const putSnapshot=(data)=>run('snapshots','readwrite',s=>s.put({key:data.account.key,...data,csrf_token:undefined}));
export const getQueue=key=>run('queue','readonly',s=>s.index('account').getAll(key)).then(rows=>rows.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)));
export const putEntry=entry=>run('queue','readwrite',s=>s.put(entry));
export const removeEntry=id=>run('queue','readwrite',s=>s.delete(id));
export async function clearAccount(key){const queue=await getQueue(key);if(queue.length)throw Error('Sync or back up and explicitly discard pending records before signing out.');await run('snapshots','readwrite',s=>s.delete(key));await run('meta','readwrite',s=>s.delete('active'));}
