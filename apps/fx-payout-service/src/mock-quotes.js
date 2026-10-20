import crypto from 'node:crypto';

/**
 * Mock FX quote provider for MVP (no real money).
 * Swap with Wise sandbox client later — same interface.
 * Rates are illustrative, NOT live.
 */
const MOCK_RATES = {
  'EUR-PHP': '58.42',
  'EUR-ZAR': '19.85',
  'EUR-GBP': '0.85',
  'EUR-USD': '1.08',
  'EUR-INR': '90.10',
  'USD-PHP': '54.10',
  'USD-ZAR': '18.38',
  'USD-EUR': '0.92'
};

export class MockQuoteProvider {
  getRate(source, dest) {
    if (source === dest) return '1';
    const k = `${source}-${dest}`;
    if (!MOCK_RATES[k]) throw new Error(`No mock rate for ${k}`);
    return MOCK_RATES[k];
  }
  /** Lock a quote for 30 minutes (mock). */
  lockQuote({ source, dest, sourceAmountMinor }) {
    const rate = this.getRate(source, dest);
    return {
      quoteId: `mock_${crypto.randomUUID()}`,
      source, dest, rate,
      sourceAmountMinor: String(sourceAmountMinor),
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };
  }
}
