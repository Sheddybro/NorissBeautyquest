import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const events={},cached=new Map(),removed=[];let online=false,networkCalls=0;
const cache={async addAll(urls){for(const url of urls)cached.set(url,new Response(url==='/offline-shell/'?'PUBLIC_OFFLINE_SHELL':'STATIC_ASSET'))},async match(key){return cached.get(typeof key==='string'?key:new URL(key.url).pathname)?.clone()},async put(key,response){cached.set(typeof key==='string'?key:new URL(key.url).pathname,response)}};
const context={self:{location:{origin:'https://shop.test'},clients:{claim:async()=>{}},addEventListener(type,fn){events[type]=fn}},caches:{open:async()=>cache,keys:async()=>['noriss-shell-old','noriss-shell-v3','noriss-shell-v4','noriss-shell-v5','noriss-shell-v6','noriss-shell-v7','noriss-shell-v9','other-app'],delete:async name=>removed.push(name)},URL,Response,AbortSignal,fetch:async(url)=>{if(typeof url==='string'&&url.startsWith('/'))return new Response(url==='/offline-shell/'?'PUBLIC_OFFLINE_SHELL':'STATIC_ASSET');networkCalls++;if(!online)throw Error('Offline');return new Response('PRIVATE_ONLINE_RESPONSE')}};
vm.runInNewContext(readFileSync(new URL('../static/shop/sw.js',import.meta.url),'utf8'),context);
let waiting;events.install({waitUntil(p){waiting=p}});await waiting;
assert.ok(cached.has('/offline-shell/'));assert.ok(cached.has('/static/shop/images/beauty-hero.webp'));assert.ok(cached.has('/static/shop/app.js'));
events.activate({waitUntil(p){waiting=p}});await waiting;assert.deepEqual(removed,['noriss-shell-old','noriss-shell-v3','noriss-shell-v4','noriss-shell-v5','noriss-shell-v6','noriss-shell-v7','noriss-shell-v9']);
async function dispatch(path,mode='cors',method='GET'){let response;events.fetch({request:{url:'https://shop.test'+path,mode,method},respondWith(p){response=p}});return response?await response:null}
assert.equal(await dispatch('/api/bootstrap/'),null);assert.equal(await dispatch('/accounts/login/','navigate'),null);assert.equal(await dispatch('/admin/','navigate'),null);assert.equal(await dispatch('/api/operations/','cors','POST'),null);
const fallback=await dispatch('/','navigate');assert.equal(await fallback.text(),'PUBLIC_OFFLINE_SHELL');
const asset=await dispatch('/static/shop/app.css');assert.equal(await asset.text(),'STATIC_ASSET');
online=true;const live=await dispatch('/','navigate');assert.equal(await live.text(),'PRIVATE_ONLINE_RESPONSE');assert.ok(!cached.has('/'));assert.equal(networkCalls,2);
console.log('PASS: essential assets precached, offline navigation fallback, static cache, API/auth/admin exclusions, private HTML never cached, version cleanup.');
