/**
 * Wise Platform client (sandbox-ready, mock-backed until creds exist).
 * Real endpoints (sandbox base https://api.sandbox.transferwise.tech):
 *  POST /v3/profiles/{profileId}/quotes
 *    { sourceCurrency, targetCurrency, sourceAmount } -> { id, rate, rateExpirationTime }
 *  POST /v1/accounts (recipient)
 *    { currency, type, profile, accountHolderName, details } -> { id }
 *  POST /v1/transfers (create)
 *    { sourceAccount?, targetAccount (recipientId), quoteUuid, customerTransactionId, reference }
 *  Webhook: POST /api/v1/webhooks/wise  event transfers#state-change
 *    states: incoming_payment_waiting -> processing -> funds_converted ->
 *            outgoing_payment_sent (SUCCESS) | bounced_back | funds_refunded | cancelled (FAILED)
 *
 * Auth: Authorization: Bearer $WISE_API_TOKEN. Never log the token.
 * Webhook verify: X-Signature-Sha256 over raw body with WISE_WEBHOOK_SECRET (HMAC-SHA256).
 */
export const WISE_STATES_SUCCESS = ['outgoing_payment_sent'];
export const WISE_STATES_FAILED = ['bounced_back', 'funds_refunded', 'cancelled', 'failed'];

export class WiseClient {
  constructor({ apiToken = process.env.WISE_API_TOKEN, profileId = process.env.WISE_PROFILE_ID,
    base = process.env.WISE_API_BASE || 'https://api.sandbox.transferwise.tech', mock = true } = {}) {
    this.apiToken = apiToken; this.profileId = profileId; this.base = base;
    // Mock until real sandbox creds are configured
    this.mock = mock || !apiToken || apiToken.startsWith('REPLACE');
  }
  get mode() { return this.mock ? 'mock' : 'live-sandbox'; }

  async createQuote({ sourceCurrency, targetCurrency, sourceAmountMinor }) {
    if (this.mock) {
      const { MockQuoteProvider } = await import('./mock-quotes.js');
      const q = new MockQuoteProvider().lockQuote({ source: sourceCurrency, dest: targetCurrency, sourceAmountMinor });
      return { id: q.quoteId, rate: q.rate, expiresAt: q.expiresAt };
    }
    const res = await fetch(`${this.base}/v3/profiles/${this.profileId}/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceCurrency, targetCurrency,
        sourceAmount: Number(sourceAmountMinor) / 100, preferredPayIn: 'BALANCE' })
    });
    if (!res.ok) throw new Error(`Wise quote failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    return { id: j.id, rate: String(j.rate), expiresAt: j.rateExpirationTime };
  }

  async ensureRecipient({ currency, accountHolderName, details }) {
    if (this.mock) return { id: `mock_rec_${currency}_${String(accountHolderName).slice(0, 8).replace(/\W/g, '')}` };
    const res = await fetch(`${this.base}/v1/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, type: details?.type || 'iban', profile: Number(this.profileId), accountHolderName, details })
    });
    if (!res.ok) throw new Error(`Wise recipient failed: ${res.status} ${await res.text()}`);
    return await res.json();
  }

  async createTransfer({ recipientId, quoteId, reference }) {
    if (this.mock) return { id: Math.floor(Math.random() * 1e9), reference, status: 'processing' };
    const res = await fetch(`${this.base}/v1/transfers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetAccount: recipientId, quoteUuid: quoteId,
        customerTransactionId: reference, details: { reference } })
    });
    if (!res.ok) throw new Error(`Wise transfer failed: ${res.status} ${await res.text()}`);
    return await res.json();
  }
}
