const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactNairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNaira(kobo: number) {
  return nairaFormatter.format((Number.isFinite(kobo) ? kobo : 0) / 100);
}

export function formatCompactNaira(kobo: number) {
  return compactNairaFormatter.format((Number.isFinite(kobo) ? kobo : 0) / 100);
}

/** Convert an entered NGN amount into integer kobo without floating-point rounding. */
export function parseNairaToKobo(value: string): number | null {
  const normalized = value.trim();
  // Only ordinary decimal currency input is accepted. No signs, exponent notation,
  // grouping separators, or more than two decimal places.
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const wholeKobo = Number(whole) * 100;
  const kobo = wholeKobo + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(kobo) || kobo <= 0) return null;
  return kobo;
}
