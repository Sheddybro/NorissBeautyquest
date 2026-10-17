import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../app/index.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../services/api.ts',import.meta.url),'utf8');
test('mobile login keeps an accessible password visibility control in the field',()=>{
 assert.match(src,/secureTextEntry=\{!showPassword\}/);
 assert.match(src,/accessibilityLabel=\{showPassword\?'Hide password':'Show password'\}/);
 assert.match(src,/passwordToggleText\}\>\{showPassword\?'Hide':'Show'\}/);
});
test('purchase, checkout and refund retain persisted idempotency recovery',()=>{
 for(const kind of ['checkout','purchase','refund']){
  assert.match(src,new RegExp("persistPending\\('"+kind+"'"));
  assert.match(src,new RegExp("clearPending\\('"+kind+"'"));
 }
 assert.match(src,/restorePending\(/);
});
test('network requests time out and expose a recovery message',()=>{
 assert.match(api,/AbortController/);
 assert.match(api,/clearTimeout\(timeout\)/);
 assert.match(api,/Server did not respond within 12 seconds/);
});
test('owner and staff management remain present',()=>{
 for(const route of ['/api/v1/owner/settings/','/api/v1/owner/staff/'])assert.ok(src.includes(route));
});

test('connection diagnostics expose the configured server without submitting credentials',()=>{
 assert.match(src,/async function checkConnection/);
 assert.match(src,/fetch\(BASE\+'\/health\/'/);
 assert.match(src,/Check connection/);
 assert.match(src,/API_HINT/);
});

test('mobile screens use the centralized API client',()=>{assert.match(src,/apiCall as call/);assert.match(api,/export async function apiCall/);});
