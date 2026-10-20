/** Minimal dependency-free MLC wage-account text payslip (PDF-ready HTML stored as .html; print-to-PDF). */
export function money(minor, currency) {
  const n = Number(minor) / 100;
  return `${currency} ${n.toFixed(2)}`;
}

export function buildPayslipHtml({ org, yacht, crew, run, line, transferRef }) {
  const rows = [
    ['Vessel', `${yacht?.name || '-'}${yacht?.flag ? ` (${yacht.flag})` : ''}`],
    ['Seafarer', `${crew.fullName} — ${crew.rank}`],
    ['Nationality', crew.nationality || '-'],
    ['Pay period', `${run.periodStart} to ${run.periodEnd}`],
    ['Days worked', String(line.daysWorked)],
    ['Day rate', money(crew.dayRateMinor, crew.dayRateCurrency)],
    ['Gross (source)', money(line.grossMinor, run.sourceCurrency)],
    ['Exchange rate', `${run.sourceCurrency}→${line.destCurrency} ${line.fxRate}`],
    ['Net paid (dest)', money(line.destAmountMinor, line.destCurrency)],
    ['Destination account', `${crew.bankCountry} ${crew.ibanOrAccount}`],
    ['Transfer reference', transferRef || line.paymentSessionId || '-'],
    ['Employer', org?.businessName || org?.business_name || 'Management company']
  ];
  const tr = rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${crew.fullName} ${run.periodStart}</title>`
    + `<style>body{font-family:Arial,sans-serif;margin:32px}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:8px}h1{font-size:20px}</style></head>`
    + `<body><h1>Seafarer Wage Account (MLC Reg 2.2)</h1><table>${tr}</table>`
    + `<p>Paid in full, no unlawful deductions. Rate and fees disclosed per SEA. Keep with your Seafarer Employment Agreement.</p></body></html>`;
}

/** Owner back-charge CSV: one row per line. Amounts in source currency cents + dest for audit. */
export function buildRechargeCsv({ org, yacht, run, lines, crewById }) {
  const head = 'owner_code,yacht,pay_run_id,period_start,period_end,crew_name,rank,days_worked,gross_source_minor,source_currency,fx_rate,dest_amount_minor,dest_currency,transfer_ref';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = lines.map(l => {
    const c = crewById[l.crewId] || {};
    return [yacht?.ownerCode || '', yacht?.name || '', run.id, run.periodStart, run.periodEnd,
      c.fullName || '', c.rank || '', l.daysWorked, l.grossMinor, run.sourceCurrency,
      l.fxRate, l.destAmountMinor, l.destCurrency, l.paymentSessionId || ''
    ].map(esc).join(',');
  });
  return [head, ...rows].join('\n');
}
