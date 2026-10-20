import { HttpServer } from '../../../payment-api/src/server.js';
import { Database, runMigrations, YachtRepository, CrewRepository, PayRunRepository, PayLineRepository, PaymentSessionRepository, AuditLogRepository } from '@youpi/db';
import { PayrunService } from './payrun.service.js';

export function createFxApp(customDb = null) {
  const db = customDb || new Database({});
  runMigrations(db);
  const yachtRepo = new YachtRepository(db);
  const crewRepo = new CrewRepository(db);
  const payRunRepo = new PayRunRepository(db);
  const payLineRepo = new PayLineRepository(db);
  const sessionRepo = new PaymentSessionRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const svc = new PayrunService({ db, payRunRepo, payLineRepo, crewRepo, sessionRepo, auditRepo });

  const server = new HttpServer();
  const health = (req, res) => HttpServer.json(res, 200, { status: 'UP', service: 'fx-payout-service', mode: 'mock-fx' });
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
      HttpServer.json(res, 200, { run: svc.lockQuotes(p.id), lines: payLineRepo.findByRun(p.id) });
    } catch (e) { HttpServer.json(res, 400, { error: e.message }); }
  });

  // GET /api/v1/payruns/:id
  server.get('/api/v1/payruns/:id', async (req, res, p) => {
    const run = payRunRepo.findById(p.id);
    if (!run) return HttpServer.json(res, 404, { error: 'Pay run not found.' });
    HttpServer.json(res, 200, { run, lines: payLineRepo.findByRun(p.id) });
  });

  return { server, ctx: { db, yachtRepo, crewRepo, payRunRepo, payLineRepo, svc }, rawServer: server.createServer() };
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
