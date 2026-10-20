import crypto from 'node:crypto';
import { convertMinor } from './fx-math.js';
import { PayrunService } from './payrun.service.js';

/** Lock FX quotes for PENDING lines (mock or Wise sandbox). */
PayrunService.prototype.lockQuotes = async function (payRunId) {
  const run = this.payRunRepo.findById(payRunId);
  if (!run) throw new Error('Pay run not found');
  const lines = this.payLineRepo.findByRun(payRunId).filter(l => l.status === 'PENDING');
  if (!lines.length) throw new Error('No PENDING lines.');
  let quoteId = null;
  for (const line of lines) {
    const crew = this.crewRepo.findById(line.crewId);
    let rate, qid;
    if (this.wise.mode === 'live-sandbox') {
      const q = await this.wise.createQuote({ sourceCurrency: run.sourceCurrency, targetCurrency: crew.homeCurrency, sourceAmountMinor: line.grossMinor });
      rate = q.rate; qid = q.id; quoteId = quoteId || qid;
    } else {
      const q = this.quotes.lockQuote({ source: run.sourceCurrency, dest: crew.homeCurrency, sourceAmountMinor: line.grossMinor });
      rate = q.rate; qid = q.quoteId; quoteId = quoteId || ('mock_' + crypto.randomUUID());
    }
    const dest = convertMinor(BigInt(line.grossMinor), rate);
    this.payLineRepo.update(line.id, { fxRate: rate, destAmountMinor: dest.toString(), status: 'QUOTED' });
    if (this.auditRepo) this.auditRepo.log({ merchantId: run.orgId, entityType: 'PAY_LINE', entityId: line.id, action: 'FX_QUOTED', actorType: 'SYSTEM', details: { rate, quoteId: qid } });
  }
  this.payRunRepo.updateStatus(payRunId, 'QUOTED', { fxLockedAt: new Date().toISOString(), wiseQuoteId: quoteId });
  return this.payRunRepo.findById(payRunId);
};
