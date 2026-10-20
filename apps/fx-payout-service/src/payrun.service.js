import crypto from 'node:crypto';
import { PaymentStatus } from '@youpi/common';
import { convertMinor, grossForDays } from './fx-math.js';
import { MockQuoteProvider } from './mock-quotes.js';
import { WiseClient } from './wise-client.js';
import { mapWiseState } from './wise-webhook.js';
import { buildPayslipHtml, buildRechargeCsv } from './docs-gen.js';
import fs from 'node:fs';
import path from 'node:path';

export class PayrunService {
  constructor(o) {
    this.db = o.db; this.payRunRepo = o.payRunRepo; this.payLineRepo = o.payLineRepo;
    this.crewRepo = o.crewRepo; this.yachtRepo = o.yachtRepo || null;
    this.merchantRepo = o.merchantRepo || null; this.sessionRepo = o.sessionRepo;
    this.auditRepo = o.auditRepo; this.quotes = o.quotes || new MockQuoteProvider();
    this.wise = o.wise || new WiseClient(); this.maxParallel = o.maxParallel || 10;
    this.docsDir = o.docsDir || null;
  }
  buildLines(payRunId, entries) {
    const run = this.payRunRepo.findById(payRunId);
    if (!run) throw new Error('Pay run not found: ' + payRunId);
    if (run.status !== 'DRAFT') throw new Error('Must be DRAFT.');
    const out = [];
    for (const e of entries) {
      const crew = this.crewRepo.findById(e.crewId);
      if (!crew) throw new Error('Crew not found: ' + e.crewId);
      const gross = grossForDays(crew.dayRateMinor, e.daysWorked);
      out.push(this.payLineRepo.create({ payRunId, crewId: crew.id,
        daysWorked: String(e.daysWorked), grossMinor: gross, fxRate: '1',
        destAmountMinor: 0, destCurrency: crew.homeCurrency, status: 'PENDING' }));
    }
    const total = out.reduce((a, l) => a + BigInt(l.grossMinor), 0n);
    this.payRunRepo.updateStatus(payRunId, 'DRAFT', { sourceTotalMinor: total.toString() });
    return out;
  }
}

