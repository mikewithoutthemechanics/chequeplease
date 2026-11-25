import { HttpServer } from './http.js';
import { Database, runMigrations, MerchantRepository, YachtRepository, CrewRepository, PayRunRepository, PayLineRepository, PaymentSessionRepository, AuditLogRepository, InviteRepository } from '@youpi/db';
import { PayrunService } from './payrun.service.js';
import './payrun-quotes.js';
import './payrun-execute.js';
import './payrun-settle.js';
import { WiseClient } from './wise-client.js';
import { verifyWiseWebhook } from './wise-webhook.js';
export function createFxApp(customDb = null, opts = {}) {
  const db = customDb || new Database({});
  runMigrations(db);
  const merchantRepo = new MerchantRepository(db);
  const yachtRepo = new YachtRepository(db);
  const crewRepo = new CrewRepository(db);
  const payRunRepo = new PayRunRepository(db);
  const payLineRepo = new PayLineRepository(db);
  const sessionRepo = new PaymentSessionRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const inviteRepo = new InviteRepository(db);
  const wise = opts.wise || new WiseClient();
  const svc = new PayrunService({ db, payRunRepo, payLineRepo, crewRepo, yachtRepo, merchantRepo, sessionRepo, auditRepo, wise, docsDir: opts.docsDir });

  const server = new HttpServer();
  const health = (req, res) => HttpServer.json(res, 200, { status: 'UP', service: 'fx-payout-service', mode: wise.mode });
  server.get('/health', health);
  server.get('/api/v1/health', health);

  // POST /api/v1/yachts
  server.post('/api/v1/yachts', async (req, res) => {
    try {
      const b = await HttpServer.parseBody(req);
      if (!b.orgId || !b.name || !b.ownerCode) return HttpServer.json(res, 400, { error: 'orgId, name, ownerCode required.' });
      HttpServer.json(res, 201, yachtRepo.create({ orgId: b.orgId, name: b.name, flag: b.flag, homePort: b.homePort, ownerCode: b.ownerCode }));
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // POST /api/v1/crew
  server.post('/api/v1/crew', async (req, res) => {
    try {
      const b = await HttpServer.parseBody(req);
      if (!b.orgId) return HttpServer.json(res, 400, { error: 'orgId required.' });
      HttpServer.json(res, 201, crewRepo.create({
        orgId: b.orgId, yachtId: b.yachtId, fullName: b.fullName, rank: b.rank,
        nationality: b.nationality, homeCurrency: b.homeCurrency, bankCountry: b.bankCountry,
        ibanOrAccount: b.ibanOrAccount, dayRateMinor: b.dayRateMinor,
        dayRateCurrency: b.dayRateCurrency, phone: b.phone
      }));
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // POST /api/v1/payruns
  server.post('/api/v1/payruns', async (req, res) => {
    try {
      const b = await HttpServer.parseBody(req);
      if (!b.orgId || !b.periodStart || !b.periodEnd) return HttpServer.json(res, 400, { error: 'orgId, periodStart, periodEnd required.' });
      HttpServer.json(res, 201, payRunRepo.create({
        orgId: b.orgId, yachtId: b.yachtId, periodStart: b.periodStart,
        periodEnd: b.periodEnd, sourceCurrency: b.sourceCurrency || 'EUR'
      }));
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // POST /api/v1/payruns/:id/lines  { entries: [{crewId, daysWorked}] }
  server.post('/api/v1/payruns/:id/lines', async (req, res, p) => {
    try {
      const b = await HttpServer.parseBody(req);
      HttpServer.json(res, 201, { lines: svc.buildLines(p.id, b.entries || []) });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // POST /api/v1/payruns/:id/quotes (mock FX lock)
  server.post('/api/v1/payruns/:id/quotes', async (req, res, p) => {
    try {
      HttpServer.json(res, 200, { run: await svc.lockQuotes(p.id), lines: payLineRepo.findByRun(p.id) });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // POST /api/v1/payruns/:id/execute
  server.post('/api/v1/payruns/:id/execute', async (req, res, p) => {
    try {
      const r = await svc.execute(p.id);
      HttpServer.json(res, 200, { ...r, lines: payLineRepo.findByRun(p.id) });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // GET /api/v1/payruns/:id
  server.get('/api/v1/payruns/:id', async (req, res, p) => {
    const run = payRunRepo.findById(p.id);
    if (!run) return HttpServer.json(res, 404, { error: 'Pay run not found.' });
    HttpServer.json(res, 200, { run, lines: payLineRepo.findByRun(p.id) });
  });

  server.get('/api/v1/payruns/:id/recharge.csv', async (req, res, p) => {
    try {
      const csv = svc.rechargeCsv(p.id);
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="recharge_' + p.id + '.csv"' });
      res.end(csv);
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  server.post('/api/v1/webhooks/wise', async (req, res) => {
    const raw = await new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; }); req.on('end', () => resolve(b)); req.on('error', reject);
    });
    let evt = {};
    try { evt = JSON.parse(raw || '{}'); } catch { return HttpServer.json(res, 400, { error: 'Malformed JSON' }); }
    const sig = req.headers['x-signature-sha256'] || req.headers['x-signature'] || '';
    const v = verifyWiseWebhook(raw, sig);
    if (!v.ok) return HttpServer.json(res, 401, { error: 'Bad webhook signature' });
    try {
      const transferId = String((evt.data && evt.data.resource && evt.data.resource.id) || evt.transferId || '');
      const state = (evt.data && evt.data.current_state) || evt.state || '';
      if (!transferId || !state) return HttpServer.json(res, 400, { error: 'Missing transfer id/state' });
      const row = db.queryOne('SELECT id FROM payment_sessions WHERE wise_transfer_id=?', [transferId]);
      if (!row) return HttpServer.json(res, 404, { error: 'Unknown transfer' });
      HttpServer.json(res, 200, { received: true, verifyMode: v.mode, ...svc.applyWiseOutcome(row.id, state, transferId) });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  server.post('/api/v1/invites', async (req, res) => {
    try {
      const b = await HttpServer.parseBody(req);
      if (!b.orgId) return HttpServer.json(res, 400, { error: 'orgId required.' });
      const inv = inviteRepo.create({ orgId: b.orgId, yachtId: b.yachtId || null, contact: b.contact || null });
      if (auditRepo) auditRepo.log({ merchantId: b.orgId, entityType: 'INVITE', entityId: inv.id, action: 'INVITE_CREATED', actorType: 'ADMIN', details: {} });
      HttpServer.json(res, 201, inv);
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  server.get('/api/v1/invites/validate', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const inv = inviteRepo.findByToken(url.searchParams.get('token') || '');
    if (!inv || inv.status !== 'PENDING') return HttpServer.json(res, 404, { error: 'Invalid or used invite.' });
    if (new Date(inv.expiresAt).getTime() < Date.now()) return HttpServer.json(res, 410, { error: 'Invite expired.' });
    HttpServer.json(res, 200, { id: inv.id, orgId: inv.orgId, yachtId: inv.yachtId, expiresAt: inv.expiresAt });
  });

  server.post('/api/v1/invites/accept', async (req, res) => {
    try {
      const b = await HttpServer.parseBody(req);
      const inv = inviteRepo.findByToken(b.token || '');
      if (!inv || inv.status !== 'PENDING') return HttpServer.json(res, 404, { error: 'Invalid or used invite.' });
      if (new Date(inv.expiresAt).getTime() < Date.now()) return HttpServer.json(res, 410, { error: 'Invite expired.' });
      if (!b.fullName || !b.rank || !b.homeCurrency || !b.bankCountry || !b.ibanOrAccount || !b.dayRateMinor) {
        return HttpServer.json(res, 400, { error: 'fullName, rank, homeCurrency, bankCountry, ibanOrAccount, dayRateMinor required.' });
      }
      const crew = crewRepo.create({ orgId: inv.orgId, yachtId: inv.yachtId || b.yachtId || null,
        fullName: b.fullName, rank: b.rank, nationality: b.nationality || null,
        homeCurrency: b.homeCurrency, bankCountry: b.bankCountry, ibanOrAccount: b.ibanOrAccount,
        dayRateMinor: b.dayRateMinor, dayRateCurrency: b.dayRateCurrency || 'EUR', phone: b.phone || inv.contact || null });
      inviteRepo.accept(inv.id);
      if (auditRepo) auditRepo.log({ merchantId: inv.orgId, entityType: 'CREW', entityId: crew.id, action: 'CREW_ONBOARDED', actorType: 'SYSTEM', details: { inviteId: inv.id } });
      HttpServer.json(res, 201, { crew });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  server.get('/api/v1/orgs/:orgId/overview', async (req, res, p) => {
    const yachts = yachtRepo.findByOrg(p.orgId);
    const crew = crewRepo.findByOrg(p.orgId);
    const runs = payRunRepo.findByOrg(p.orgId, 10);
    const pendingInvites = inviteRepo.listPending(p.orgId).map(i => ({ id: i.id, yachtId: i.yachtId, contact: i.contact, expiresAt: i.expiresAt }));
    HttpServer.json(res, 200, { yachts, crewCount: crew.length, crew: crew.slice(0, 50), runs, pendingInvites, mode: wise.mode });
  });

  return { server, ctx: { db, merchantRepo, yachtRepo, crewRepo, payRunRepo, payLineRepo, inviteRepo, svc, wise }, rawServer: server.createServer() };
}

export function startServer(port = null, customDb = null) {
  const finalPort = port || Number(process.env.FX_PAYOUT_PORT || 6105);
  const app = createFxApp(customDb);
  return new Promise(resolve => {
    const inst = app.rawServer.listen(finalPort, '127.0.0.1', () => {
      console.log(`[FX Payout] listening on ${finalPort} (mock-fx)`);
      resolve({ app, port: finalPort, close: () => new Promise(cb => inst.close(cb)) });
    });
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) { startServer(); }
