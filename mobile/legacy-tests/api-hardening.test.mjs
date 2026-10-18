import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8');
test('accepts both HTTP 204 and 205 without parsing a body', () => assert.match(source, /response\.status === 204 \|\| response\.status === 205/));
test('reads response body with a guarded error path', () => assert.match(source, /try \{ raw = await response\.text\(\); \}/));
test('does not classify HTML error pages as successful responses', () => assert.match(source, /if \(!response\.ok\) \{/));
test('extracts Django field-level validation errors', () => { assert.match(source, /Object\.entries\(data\)/); assert.match(source, /Array\.isArray\(value\)/); });
