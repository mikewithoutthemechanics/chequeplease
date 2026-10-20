import crypto from 'node:crypto';
import { PaymentStatus } from '@youpi/common';
import { convertMinor, grossForDays } from './fx-math.js';
import { MockQuoteProvider } from './mock-quotes.js';

/**
 * Payrun orchestrator: DRAFT -> QUOTED -> EXECUTING -> COMPLETE.
 * Uses existing PaymentSessionRepository rows (method=WISE) + QueueEngine-compatible flow.
 * MVP: activates up to maxParallel lines, marks them PROCESSING, then
 * simulates webhook SUCCESS (Wise sandbox wiring comes next).
 */
export class PayrunService {
  constructor({ db, payRunRepo, payLineRepo, crewRepo, sessionRepo, auditRepo, quotes = new MockQuoteProvider(), maxParallel = 10 }) {
    this.db = db; this.payRunRepo = payRunRepo; this.payLineRepo = payLineRepo;
    this.crewRepo = crewRepo; this.sessionRepo = sessionRepo; this.auditRepo = auditRepo;
    this.quotes = quotes; this.maxParallel = maxParallel;
  }

  /** Build pay_lines from crew day entries. entries: [{crewId, daysWorked}]. */
  buildLines(payRunId, entries) {
    const run = this.payRunRepo.findById(payRunId);
    if (!run) throw new Error(`Pay run not found: ${payRunId}`);
    if (run.status !== 'DRAFT') throw new Error(`Pay run ${payRunId} is ${run.status}, must be DRAFT to build lines.`);
    const out = [];
    for (const e of entries) {
      const crew = this.crewRepo.findById(e.crewId);
      if (!crew) throw new Error(`Crew not found: ${e.crewId}`);
      const gross = grossForDays(crew.dayRateMinor, e.daysWorked);
      out.push(this.payLineRepo.create({
        payRunId, crewId: crew.id, daysWorked: String(e.daysWorked),
        grossMinor: gross, fxRate: '1',
        destAmountMinor: 0, destCurrency: crew.homeCurrency, status: 'PENDING'
      }));
    }
    const total = out.reduce((a, l) => a + BigInt(l.grossMinor), 0n);
    this.payRunRepo.updateStatus(payRunId, 'DRAFT', { sourceTotalMinor: total.toString() });
    return out;
  }

  /** Lock FX quotes for all PENDING lines (mock). */
  lockQuotes(payRunId) {
    const run = this.payRunRepo.findById(payRunId);
    if (!run) throw new Error(`Pay run not found: ${payRunId}`);
    const lines = this.payLineRepo.findByRun(payRunId).filter(l => l.status === 'PENDING');
    if (!lines.length) throw new Error('No PENDING lines to quote.');
    const quoteId = `mock_${crypto.randomUUID()}`;
    for (const line of lines) {
      const crew = this.crewRepo.findById(line.crewId);
      const q = this.quotes.lockQuote({ source: run.sourceCurrency, dest: crew.homeCurrency, sourceAmountMinor: line.grossMinor });
      const dest = convertMinor(BigInt(line.grossMinor), q.rate);
      this.payLineRepo.update(line.id, { fxRate: q.rate, destAmountMinor: dest.toString(), status: 'QUOTED' });
    }
    this.payRunRepo.updateStatus(payRunId, 'QUOTED', { fxLockedAt: new Date().toISOString(), wiseQuoteId: quoteId });
    return this.payRunRepo.findById(payRunId);
  }
}
