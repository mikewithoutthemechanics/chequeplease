import { PaymentStatus } from '@youpi/common';
import { mapWiseState } from './wise-webhook.js';
import { buildPayslipHtml, buildRechargeCsv } from './docs-gen.js';
import { PayrunService } from './payrun.service.js';
import fs from 'node:fs';
import path from 'node:path';

PayrunService.prototype.applyWiseOutcome = function (sessionId, wiseState, transferId) {
  const outcome = mapWiseState(wiseState);
  const session = this.sessionRepo.findById(sessionId);
  if (!session) throw new Error('Session not found');
  const rows = this.db.query('SELECT * FROM pay_lines WHERE payment_session_id=?', [sessionId]);
  const line = rows.length ? this.payLineRepo.map(rows[0]) : null;
  if (outcome === 'SUCCESS') {
    this.sessionRepo.transitionToTerminal(sessionId, PaymentStatus.SUCCESS);
    if (line) { const p = this.renderPayslip(line.id, String(transferId)); this.payLineRepo.update(line.id, { status: 'PAID', payslipPdfPath: p }); }
    if (this.auditRepo) this.auditRepo.log({ entityType: 'PAYMENT_SESSION', entityId: sessionId, action: 'WISE_SUCCESS', actorType: 'OBSERVER', details: { wiseState, transferId } });
  } else if (outcome === 'FAILED') {
    this.sessionRepo.transitionToTerminal(sessionId, PaymentStatus.FAILED);
    try { this.db.execute('UPDATE payment_sessions SET failure_code=? WHERE id=?', [wiseState, sessionId]); } catch {}
    if (line) this.payLineRepo.update(line.id, { status: 'FAILED' });
    if (this.auditRepo) this.auditRepo.log({ entityType: 'PAYMENT_SESSION', entityId: sessionId, action: 'WISE_FAILED', actorType: 'OBSERVER', details: { wiseState, transferId } });
  }
  const prId = session.metadata ? session.metadata.payRunId : null;
  if (prId) {
    const lines = this.payLineRepo.findByRun(prId);
    if (lines.length && lines.every(l => l.status === 'PAID' || l.status === 'FAILED')) {
      const failed = lines.some(l => l.status === 'FAILED');
      this.payRunRepo.updateStatus(prId, failed ? 'COMPLETE_WITH_ERRORS' : 'COMPLETE');
    }
  }
  return { sessionId, outcome, wiseState };
};

PayrunService.prototype.renderPayslip = function (lineId, transferRef) {
  const line = this.payLineRepo.findById(lineId);
  const run = this.payRunRepo.findById(line.payRunId);
  const crew = this.crewRepo.findById(line.crewId);
  const yacht = (run.yachtId && this.yachtRepo) ? this.yachtRepo.findById(run.yachtId) : null;
  const org = this.merchantRepo ? this.merchantRepo.findById(run.orgId) : null;
  const html = buildPayslipHtml({ org, yacht, crew, run, line, transferRef });
  const dir = this.docsDir || path.resolve(process.cwd(), 'data', 'payslips', run.id);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const file = path.join(dir, line.id + '.html');
  try { fs.writeFileSync(file, html, 'utf8'); } catch {}
  return file;
};

PayrunService.prototype.rechargeCsv = function (payRunId) {
  const run = this.payRunRepo.findById(payRunId);
  const lines = this.payLineRepo.findByRun(payRunId);
  const yacht = (run.yachtId && this.yachtRepo) ? this.yachtRepo.findById(run.yachtId) : null;
  const crewById = {};
  for (const l of lines) crewById[l.crewId] = this.crewRepo.findById(l.crewId);
  return buildRechargeCsv({ org: null, yacht, run, lines, crewById });
};
