import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, runMigrations, ensureDatabaseInitialized } from '@youpi/db';
import { getAdminToken, safeEqual } from '@youpi/common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers?.['authorization'] || '');
  return m ? m[1].trim() : '';
}

/** Admin login: POST /ops/api/login { token } -> 200 when ADMIN_API_TOKEN matches. Stateless. */
function isAuthed(req) {
  const t = bearerToken(req);
  if (t && safeEqual(t, getAdminToken())) return true;
  const cookie = String(req.headers?.cookie || '');
  const m = /(?:^|;\s*)yc_admin=([^;]+)/.exec(cookie);
  return m ? safeEqual(decodeURIComponent(m[1]), getAdminToken()) : false;
}

export class OpsServer {
  constructor({ db = null } = {}) {
    this.db = db || getDatabase();
    ensureDatabaseInitialized(this.db);
    runMigrations(this.db);
    this.fxBase = process.env.FX_PAYOUT_BASE || `http://127.0.0.1:${process.env.FX_PAYOUT_PORT || 6105}`;
  }
  render(view) {
    return fs.readFileSync(path.join(__dirname, 'views', view), 'utf8');
  }
  proxy(pathname, req, res) {
    const target = this.fxBase + pathname;
    const u = new URL(target);
    const headers = { ...req.headers, host: u.host };
    delete headers.cookie;
    const pr = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: req.method, headers }, (pres) => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
    });
    pr.on('error', () => {
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Payout service unavailable' })); }
    });
    req.pipe(pr);
  }
  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
        res.end(); return;
      }
      if (p === '/ops/api/login' && req.method === 'POST') {
        let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
          try {
            const j = JSON.parse(b || '{}');
            if (j.token && safeEqual(String(j.token), getAdminToken())) {
              res.writeHead(200, { 'Content-Type': 'application/json',
                'Set-Cookie': `yc_admin=${encodeURIComponent(getAdminToken())}; Path=/; HttpOnly; SameSite=Lax` });
              res.end(JSON.stringify({ ok: true }));
            } else { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Bad token' })); }
          } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Bad JSON' })); }
        });
        return;
      }
      if (p === '/login' || p === '/ops/login') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(this.render('login.html')); return;
      }
      if (p === '/onboard' || p === '/join') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(this.render('onboard.html')); return;
      }
      if (p === '/' || p === '/ops' || p === '/dashboard') {
        if (!isAuthed(req)) {
          res.writeHead(302, { Location: '/login' }); res.end(); return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(this.render('dashboard.html')); return;
      }
      if (p.startsWith('/ops/api/')) {
        if (!isAuthed(req)) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Login required' })); return; }
        this.proxy(p.replace('/ops/api', '/api/v1') + url.search, req, res); return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
    });
  }
}
