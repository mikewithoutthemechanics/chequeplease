import { PaymentStatus } from '@youpi/common';
import { PayrunService } from './payrun.service.js';

/** Execute QUOTED run: payment_sessions (method=WISE) + transfers, up to maxParallel. */
PayrunService.prototype.execute = async function (payRunId) {
  const run = this.payRunRepo.findById(payRunId);
  if (!run) throw new Error('Pay run not found');
  if (run.status !== 'QUOTED') throw new Error('Must be QUOTED, is ' + run.status);
  const lines = this.payLineRepo.findByRun(payRunId).filter(l => l.status === 'QUOTED').slice(0, this.maxParallel);
  if (!lines.length) throw new Error('No QUOTED lines.');
  this.payRunRepo.updateStatus(payRunId, 'EXECUTING');
  const out = [];
  for (const line of lines) {
    const crew = this.crewRepo.findById(line.crewId);
    let recipientId = crew.wiseRecipientId;
    if (!recipientId) {
      const r = await this.wise.ensureRecipient({ currency: crew.homeCurrency, accountHolderName: crew.fullName, details: { iban: crew.ibanOrAccount } });
      recipientId = r.id;
      this.crewRepo.setWiseRecipient(crew.id, recipientId);
    }
    const ref = ('payrun:' + payRunId + ':crew:' + crew.id).slice(0, 60);
    const session = this.sessionRepo.create({ merchantId: run.orgId, customerId: null,
      receivingAccountId: null, orderId: ref, amountPaise: BigInt(line.destAmountMinor),
      currency: line.destCurrency, method: 'WISE', status: PaymentStatus.PROCESSING,
      metadata: { payRunId, yachtId: run.yachtId, fxRate: line.fxRate, sourceMinor: String(line.grossMinor), sourceCurrency: run.sourceCurrency } });
    try { this.db.execute('UPDATE payment_sessions SET source_amount_minor=?, source_currency=?, fx_quote_id=?, fx_rate=?, dest_bank_country=? WHERE id=?',
      [Number(line.grossMinor), run.sourceCurrency, run.wiseQuoteId, line.fxRate, crew.bankCountry, session.id]); } catch {}
    const t = await this.wise.createTransfer({ recipientId, quoteId: run.wiseQuoteId, reference: ref });
    try { this.db.execute('UPDATE payment_sessions SET wise_transfer_id=? WHERE id=?', [String(t.id), session.id]); } catch {}
    this.payLineRepo.update(line.id, { status: 'SENT', paymentSessionId: session.id });
    if (this.auditRepo) this.auditRepo.log({ merchantId: run.orgId, entityType: 'PAY_LINE', entityId: line.id, action: 'TRANSFER_CREATED', actorType: 'SYSTEM', details: { transferId: String(t.id), sessionId: session.id } });
    if (this.wise.mode !== 'live-sandbox') this.applyWiseOutcome(session.id, 'outgoing_payment_sent', String(t.id));
    out.push({ lineId: line.id, sessionId: session.id, transferId: String(t.id) });
  }
  return { run: this.payRunRepo.findById(payRunId), executed: out, mode: this.wise.mode };
};
