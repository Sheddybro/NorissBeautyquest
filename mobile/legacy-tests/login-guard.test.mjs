import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const login = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
test('login rejects repeated submits while session is loading', () => {
  assert.match(login, /if \(loading \|\| restoringSession\) return;/);
});
test('login clears sensitive password after a successful sign-in', () => {
  assert.match(login, /await saveSession[\s\S]*?setPassword\(''\)/);
});
test('editing credentials clears a stale login error', () => {
  assert.match(login, /setUsername\(value\); if \(error\) setError/);
  assert.match(login, /setPassword\(value\); if \(error\) setError/);
});
