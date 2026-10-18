import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';


const source = readFileSync(new URL('../utils/money.ts', import.meta.url), 'utf8');
// This utility has only parameter/return annotations; remove them for native Node tests.
const compiled = source.replace(/\(kobo: number\)/g, '(kobo)').replace(/\(value: string\): number \| null/g, '(value)');
const encoded = Buffer.from(compiled).toString('base64');
const { formatCompactNaira, formatNaira, parseNairaToKobo } = await import(`data:text/javascript;base64,${encoded}`);

test('formats stored kobo as the matching Naira amount', () => {
  assert.match(formatNaira(850000), /8,500\.00/);
  assert.doesNotMatch(formatNaira(850000), /850,000/);
  assert.match(formatCompactNaira(850000), /8\.5\s?K/i);
});

test('converts entered Naira amounts to integer kobo', () => {
  assert.equal(parseNairaToKobo('1500'), 150000);
  assert.equal(parseNairaToKobo('12.34'), 1234);
  assert.equal(parseNairaToKobo('0'), null);
  assert.equal(parseNairaToKobo('not a price'), null);
});

test('rejects ambiguous or unsafe monetary input', () => {
  for (const invalid of ['1.005', '1e3', '-12', '+12', '1,000', '.50', '2.', 'Infinity', '90071992547410']) {
    assert.equal(parseNairaToKobo(invalid), null, invalid);
  }
});

test('preserves exact decimal cents without float rounding', () => {
  assert.equal(parseNairaToKobo('0.01'), 1);
  assert.equal(parseNairaToKobo('1.10'), 110);
  assert.equal(parseNairaToKobo('19.99'), 1999);
  assert.equal(parseNairaToKobo(' 1500.5 '), 150050);
});
