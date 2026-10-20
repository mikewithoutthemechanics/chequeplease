import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Database, runMigrations, MerchantRepository, YachtRepository, CrewRepository, PayRunRepository, PayLineRepository, PaymentSessionRepository, AuditLogRepository } from '@youpi/db';
import { PayrunService } from '../payrun.service.js';
import '../payrun-quotes.js';
import '../payrun-execute.js';
import '../payrun-settle.js';
import { verifyWiseWebhook, mapWiseState } from '../wise-webhook.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('yachtcrew payrun scaffold', () => {
  let db, org, yacht, svc, repos;
  beforeEach(() => {
    db = new Database({ inMemory: true });
    db.exec(`CREATE TABLE IF NOT EXISTS merchants (id TEXT PRIMARY KEY, business_name TEXT, slug TEXT UNIQUE, contact_email TEXT, contact_phone TEXT, webhook_url TEXT, webhook_secret TEXT, branding TEXT, created_at TEXT, updated_at TEXT);`);
    const { defaultMerchant } = runMigrations(db);
    org = defaultMerchant;
    repos = {
      yachtRepo: new YachtRepository(db), crewRepo: new CrewRepository(db),
      payRunRepo: new PayRunRepository(db), payLineRepo: new PayLineRepository(db),
      sessionRepo: new PaymentSessionRepository(db), auditRepo: new AuditLogRepository(db),
      merchantRepo: new MerchantRepository(db)
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payslip-'));
    svc = new PayrunService({ db, ...repos, docsDir: tmp });
    yacht = repos.yachtRepo.create({ orgId: org.id, name: 'M/Y Aurora', flag: 'MT', ownerCode: 'OWNER-42' });
  });
  afterEach(() => db.close());

  test('migration creates yachts/crew/pay_runs/pay_lines + session FX columns', () => {
    const t = db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('yachts','crew','pay_runs','pay_lines')`);
    assert.equal(t.length, 4);
    const cols = db.query(`PRAGMA table_info(payment_sessions)`).map(c => c.name);
    for (const c of ['source_amount_minor', 'fx_quote_id', 'wise_transfer_id']) assert.ok(cols.includes(c), `missing ${c}`);
  });

  test('build lines + lock mock FX quotes (EUR->PHP, EUR->ZAR)', async () => {
    const a = repos.crewRepo.create({ orgId: org.id, yachtId: yacht.id, fullName: 'Juan Dela Cruz', rank: 'Deckhand', nationality: 'PH', homeCurrency: 'PHP', bankCountry: 'PH', ibanOrAccount: 'PH123', dayRateMinor: 12000, phone: '9000000001' });
    const b = repos.crewRepo.create({ orgId: org.id, yachtId: yacht.id, fullName: 'Thabo Mbeki', rank: 'Engineer', nationality: 'ZA', homeCurrency: 'ZAR', bankCountry: 'ZA', ibanOrAccount: 'ZA456', dayRateMinor: 20000, phone: '9000000002' });
    const run = repos.payRunRepo.create({ orgId: org.id, yachtId: yacht.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', sourceCurrency: 'EUR' });

    const lines = svc.buildLines(run.id, [{ crewId: a.id, daysWorked: '30' }, { crewId: b.id, daysWorked: '15.5' }]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].grossMinor, 360000); // 12000*30
    assert.equal(lines[1].grossMinor, 310000); // 20000*15.5

    const quoted = await svc.lockQuotes(run.id);
    assert.equal(quoted.status, 'QUOTED');
    const after = repos.payLineRepo.findByRun(run.id);
    const php = after.find(l => l.destCurrency === 'PHP');
    const zar = after.find(l => l.destCurrency === 'ZAR');
    assert.equal(php.fxRate, '58.42');
    assert.equal(zar.fxRate, '19.85');
    // 360000 * 58.42 = 21031200 ; 310000 * 19.85 = 6153500
    assert.equal(php.destAmountMinor, 21031200);
    assert.equal(zar.destAmountMinor, 6153500);
  });

  test('execute settles mock SUCCESS + payslip + recharge CSV', async () => {
    const a = repos.crewRepo.create({ orgId: org.id, yachtId: yacht.id, fullName: 'Juan Dela Cruz', rank: 'Deckhand', nationality: 'PH', homeCurrency: 'PHP', bankCountry: 'PH', ibanOrAccount: 'PH123', dayRateMinor: 12000, phone: '9000000003' });
    const run = repos.payRunRepo.create({ orgId: org.id, yachtId: yacht.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', sourceCurrency: 'EUR' });
    svc.buildLines(run.id, [{ crewId: a.id, daysWorked: '30' }]);
    await svc.lockQuotes(run.id);
    const ex = await svc.execute(run.id);
    assert.equal(ex.mode, 'mock');
    assert.equal(ex.executed.length, 1);
    const lines = repos.payLineRepo.findByRun(run.id);
    assert.equal(lines[0].status, 'PAID');
    assert.ok(lines[0].payslipPdfPath && fs.existsSync(lines[0].payslipPdfPath));
    const html = fs.readFileSync(lines[0].payslipPdfPath, 'utf8');
    assert.ok(html.includes('MLC Reg 2.2') && html.includes('Juan Dela Cruz'));
    const csv = svc.rechargeCsv(run.id);
    assert.ok(csv.includes('owner_code,yacht,pay_run_id') && csv.includes('OWNER-42'));
    const done = repos.payRunRepo.findById(run.id);
    assert.equal(done.status, 'COMPLETE');
  });

  test('wise webhook verify + state map', () => {
    assert.equal(mapWiseState('outgoing_payment_sent'), 'SUCCESS');
    assert.equal(mapWiseState('bounced_back'), 'FAILED');
    assert.equal(mapWiseState('processing'), 'PENDING');
    const v = verifyWiseWebhook('{}', '', undefined);
    assert.equal(v.ok, true);
  });
});
