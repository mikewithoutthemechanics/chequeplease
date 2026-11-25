import http from 'node:http';

/** Minimal HttpServer compatible with payment-api server (self-contained, no cross-app import). */
export class HttpServer {
  constructor() { this.routes = []; }
  register(method, pattern, handler) {
    const names = [];
    const rx = new RegExp('^' + pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    this.routes.push({ method: method.toUpperCase(), rx, names, handler });
  }
  get(p, h) { this.register('GET', p, h); }
  post(p, h) { this.register('POST', p, h); }
  static json(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  }
  static parseBody(req) {
    return new Promise((resolve, reject) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) reject(new Error('Too large')); });
      req.on('end', () => { if (!b.trim()) return resolve({}); try { resolve(JSON.parse(b)); } catch { reject(new Error('Malformed JSON')); } });
      req.on('error', reject);
    });
  }
  createServer() {
    const self = this;
    return http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); res.end(); return; }
      const u = new URL(req.url, 'http://localhost');
      for (const r of self.routes) {
        if (r.method !== req.method.toUpperCase()) continue;
        const m = u.pathname.match(r.rx);
        if (m) {
          const params = {};
          r.names.forEach((n, i) => { params[n] = m[i + 1]; });
          req.query = Object.fromEntries(u.searchParams.entries());
          try { await r.handler(req, res, params); } catch { HttpServer.json(res, 500, { error: 'Internal error' }); }
          return;
        }
      }
      HttpServer.json(res, 404, { error: 'Not found' });
    });
  }
}

