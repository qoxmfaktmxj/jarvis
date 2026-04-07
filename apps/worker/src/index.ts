import 'dotenv/config';
import PgBoss from 'pg-boss';
import { ingestHandler } from './jobs/ingest.js';
import { embedHandler } from './jobs/embed.js';
import { compileHandler } from './jobs/compile.js';
import { staleCheckHandler } from './jobs/stale-check.js';
import { aggregatePopularHandler } from './jobs/aggregate-popular.js';
import { cleanupHandler } from './jobs/cleanup.js';
import { ensureBucket } from './lib/minio-client.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const boss = new PgBoss({
  connectionString: DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30,
});

boss.on('error', (error) => {
  console.error('[pg-boss] error', error);
});

async function main() {
  await boss.start();
  console.log('[worker] pg-boss started');

  // Ensure MinIO bucket exists
  await ensureBucket();

  // Register job workers — on-demand
  await boss.work('ingest', { batchSize: 5 }, ingestHandler);
  await boss.work('embed', { batchSize: 3 }, embedHandler);
  await boss.work('compile', { batchSize: 3 }, compileHandler);

  // Scheduled: stale-check daily at 09:00
  await boss.schedule('check-freshness', '0 9 * * *', {});
  await boss.work('check-freshness', staleCheckHandler);

  // Scheduled: aggregate-popular weekly on Sunday midnight
  await boss.schedule('aggregate-popular', '0 0 * * 0', {});
  await boss.work('aggregate-popular', aggregatePopularHandler);

  // Scheduled: cleanup monthly on the 1st at midnight
  await boss.schedule('cleanup', '0 0 1 * *', {});
  await boss.work('cleanup', cleanupHandler);

  console.log('[worker] All job handlers registered. Worker is running.');

  // Graceful shutdown
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
