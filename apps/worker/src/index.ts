// apps/worker/src/index.ts

import 'dotenv/config';
import { boss } from './lib/boss.js';
import { ingestHandler } from './jobs/ingest.js';
import { embedHandler } from './jobs/embed.js';
import { compileHandler } from './jobs/compile.js';
import { graphifyBuildHandler } from './jobs/graphify-build.js';
import { staleCheckHandler } from './jobs/stale-check.js';
import { aggregatePopularHandler } from './jobs/aggregate-popular.js';
import { cleanupHandler } from './jobs/cleanup.js';
import { ensureBucket } from './lib/minio-client.js';

async function main() {
  await boss.start();
  console.log('[worker] pg-boss started');

  await ensureBucket();

  await boss.work('ingest', { batchSize: 5 }, ingestHandler);
  await boss.work('embed', { batchSize: 3 }, embedHandler);
  await boss.work('compile', { batchSize: 3 }, compileHandler);
  await boss.work('graphify-build', { batchSize: 1 }, graphifyBuildHandler);

  await boss.schedule('check-freshness', '0 9 * * *', {});
  await boss.work('check-freshness', staleCheckHandler);

  await boss.schedule('aggregate-popular', '0 0 * * 0', {});
  await boss.work('aggregate-popular', aggregatePopularHandler);

  await boss.schedule('cleanup', '0 0 1 * *', {});
  await boss.work('cleanup', cleanupHandler);

  console.log('[worker] All job handlers registered. Worker is running.');

  process.on('SIGTERM', async () => {
    console.log('[worker] SIGTERM received, stopping...');
    await boss.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[worker] SIGINT received, stopping...');
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
