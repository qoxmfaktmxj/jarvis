// apps/worker/src/health.ts
// Worker HTTP healthcheck server — port 9090
// GET /health → 200 {"ok":true} if pg-boss is reachable, 500 otherwise

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type PgBoss from 'pg-boss';

let _boss: PgBoss | null = null;

export function registerBossForHealthcheck(boss: PgBoss): void {
  _boss = boss;
}

async function checkHealth(): Promise<boolean> {
  if (!_boss) return false;
  try {
    // pg-boss getQueueSize throws if DB connection is down
    await _boss.getQueueSize('ingest');
    return true;
  } catch {
    return false;
  }
}

export function startHealthServer(port = 9090): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' && req.method === 'GET') {
      const healthy = await checkHealth();
      res.writeHead(healthy ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: healthy }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    // EADDRINUSE / EACCES at startup — log and continue; worker still operates.
    // k8s liveness probe will fail on its own if the health port is unavailable.
    console.error(`[health] Server error (port ${port}):`, err.code ?? err.message);
  });

  server.listen(port, () => {
    console.log(`[health] Worker healthcheck server listening on port ${port}`);
  });
}
