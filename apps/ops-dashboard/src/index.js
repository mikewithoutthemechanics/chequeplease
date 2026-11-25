import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpsServer } from './server.js';

export function startOps(port = null, opts = {}) {
  const finalPort = port || Number(process.env.OPS_DASHBOARD_PORT || 6106);
  const srv = new OpsServer(opts);
  const raw = srv.createServer();
  return new Promise(resolve => {
    const inst = raw.listen(finalPort, '127.0.0.1', () => {
      resolve({ port: finalPort, close: () => new Promise(cb => inst.close(cb)) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { startOps(); }
