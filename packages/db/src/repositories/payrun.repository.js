import crypto from 'node:crypto';

export class PayRunRepository {
  constructor(db) { this.db = db; }
  create(d) {
    const id = d.id || crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.execute(
      `INSERT INTO pay_runs (id, org_id, yacht_id, period_start, period_end,
        source_currency, source_total_minor, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
      [id, d.orgId, d.yachtId || null, d.periodStart, d.periodEnd,
       d.sourceCurrency || 'EUR', Number(d.sourceTotalMinor || 0), now, now]
    );
    return this.findById(id);
  }
  findById(id) {
    const r = this.db.queryOne('SELECT * FROM pay_runs WHERE id = ?', [id]);
    return r ? this.map(r) : null;
  }
  findByOrg(orgId, limit = 50) {
    return this.db.query('SELECT * FROM pay_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?',
      [orgId, limit]).map(r => this.map(r));
  }
  updateStatus(id, status, extra = {}) {
    const sets = ['status = ?', 'updated_at = ?'];
    const params = [status, new Date().toISOString()];
    if (extra.fxLockedAt !== undefined) { sets.push('fx_locked_at = ?'); params.push(extra.fxLockedAt); }
    if (extra.wiseQuoteId !== undefined) { sets.push('wise_quote_id = ?'); params.push(extra.wiseQuoteId); }
    if (extra.sourceTotalMinor !== undefined) { sets.push('source_total_minor = ?'); params.push(Number(extra.sourceTotalMinor)); }
    params.push(id);
    this.db.execute(`UPDATE pay_runs SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }
  map(r) {
    return { id: r.id, orgId: r.org_id, yachtId: r.yacht_id, periodStart: r.period_start,
      periodEnd: r.period_end, sourceCurrency: r.source_currency,
      sourceTotalMinor: Number(r.source_total_minor), fxLockedAt: r.fx_locked_at,
      wiseQuoteId: r.wise_quote_id, status: r.status,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }
}

export class PayLineRepository {
  constructor(db) { this.db = db; }
  create(d) {
    const id = d.id || crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.execute(
      `INSERT INTO pay_lines (id, pay_run_id, crew_id, days_worked, gross_minor,
        fx_rate, dest_amount_minor, dest_currency, payment_session_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.payRunId, d.crewId, String(d.daysWorked ?? '0'), Number(d.grossMinor || 0),
       String(d.fxRate ?? '1'), Number(d.destAmountMinor || 0), d.destCurrency,
       d.paymentSessionId || null, d.status || 'PENDING', now, now]
    );
    return this.findById(id);
  }
  findById(id) {
    const r = this.db.queryOne('SELECT * FROM pay_lines WHERE id = ?', [id]);
    return r ? this.map(r) : null;
  }
  findByRun(payRunId) {
    return this.db.query('SELECT * FROM pay_lines WHERE pay_run_id = ? ORDER BY created_at ASC', [payRunId])
      .map(r => this.map(r));
  }
  update(id, u) {
    const sets = []; const params = [];
    if (u.status !== undefined) { sets.push('status = ?'); params.push(u.status); }
    if (u.grossMinor !== undefined) { sets.push('gross_minor = ?'); params.push(Number(u.grossMinor)); }
    if (u.fxRate !== undefined) { sets.push('fx_rate = ?'); params.push(String(u.fxRate)); }
    if (u.destAmountMinor !== undefined) { sets.push('dest_amount_minor = ?'); params.push(Number(u.destAmountMinor)); }
    if (u.paymentSessionId !== undefined) { sets.push('payment_session_id = ?'); params.push(u.paymentSessionId); }
    if (u.payslipPdfPath !== undefined) { sets.push('payslip_pdf_path = ?'); params.push(u.payslipPdfPath); }
    if (!sets.length) return this.findById(id);
    sets.push('updated_at = ?'); params.push(new Date().toISOString()); params.push(id);
    this.db.execute(`UPDATE pay_lines SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }
  map(r) {
    return { id: r.id, payRunId: r.pay_run_id, crewId: r.crew_id, daysWorked: r.days_worked,
      grossMinor: Number(r.gross_minor), fxRate: r.fx_rate,
      destAmountMinor: Number(r.dest_amount_minor), destCurrency: r.dest_currency,
      paymentSessionId: r.payment_session_id, payslipPdfPath: r.payslip_pdf_path,
      status: r.status, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }
}
