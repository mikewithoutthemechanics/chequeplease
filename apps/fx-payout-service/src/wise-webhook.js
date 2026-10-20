import crypto from 'node:crypto';
import { WISE_STATES_SUCCESS, WISE_STATES_FAILED } from './wise-client.js';

/** Verify Wise webhook HMAC-SHA256 (X-Signature-Sha256) over raw body. Mock mode skips when no secret. */
export function verifyWiseWebhook(rawBody, signature, secret = process.env.WISE_WEBHOOK_SECRET) {
  if (!secret || secret.startsWith('REPLACE')) return { ok: true, mode: 'mock' };
  if (!signature) return { ok: false, reason: 'missing signature' };
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.replace(/^sha256=/, ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' };
  return { ok: true, mode: 'live' };
}

/** Map Wise transfer state to internal outcome. */
export function mapWiseState(state) {
  if (WISE_STATES_SUCCESS.includes(state)) return 'SUCCESS';
  if (WISE_STATES_FAILED.includes(state)) return 'FAILED';
  return 'PENDING';
}
