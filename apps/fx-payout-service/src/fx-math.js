/**
 * FX math with zero floats. Rates are decimal strings (e.g. "58.42").
 * All money is integer minor units (cents). Uses BigInt internally.
 * grossMinor (source) * rate => destMinor, rounded half-up.
 */

/** Parse "58.42" into { num: 5842n, scale: 2 }. */
export function parseRate(rateStr) {
  const s = String(rateStr).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Invalid FX rate: "${rateStr}"`);
  const [w, f = ''] = s.split('.');
  return { num: BigInt(w + f.padEnd(0, '0') || '0') === 0n && f ? BigInt(f) : BigInt(w + (f || '')), scale: f.length, whole: BigInt(w), frac: f };
}

/** Convert source minor units at decimal-string rate to dest minor units (half-up). */
export function convertMinor(sourceMinor, rateStr) {
  const src = BigInt(sourceMinor);
  if (src <= 0n) throw new Error('sourceMinor must be > 0');
  const s = String(rateStr).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Invalid FX rate: "${rateStr}"`);
  const [w, f = ''] = s.split('.');
  const scale = BigInt(f.length);
  const num = BigInt(w + f);
  const den = 10n ** scale;
  // half-up: (src * num + den/2) / den
  return (src * num + den / 2n) / den;
}

/** Parse days like "30", "15.5" into tenths to keep integer math. Returns tenths (BigInt). */
export function daysToTenths(days) {
  const s = String(days).trim();
  if (!/^\d+(\.\d)?$/.test(s)) throw new Error(`Invalid days_worked: "${days}" (max 1 decimal)`);
  const [w, f = '0'] = s.split('.');
  return BigInt(w) * 10n + BigInt(f);
}

/** gross = dayRateMinor * days (tenths) / 10, exact (dayRate is per day). */
export function grossForDays(dayRateMinor, days) {
  const tenths = daysToTenths(days);
  return (BigInt(dayRateMinor) * tenths) / 10n;
}
