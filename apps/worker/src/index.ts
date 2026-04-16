// apps/worker/src/index.ts

import { initSentry } from '@jarvis/shared/sentry';
initSentry();

import 'dotenv/config';
import { boss } from './lib/boss.js';
import { ingestHandler } from './jobs/ingest.js';
import { embedHandler } from './jobs/embed.js';
import { compileHandler } from './jobs/compile.js';
import { graphifyBuildHandler } from './jobs/graphify-build.js';
import { staleCheckHandler } from './jobs/stale-check.js';
import { aggregatePopularHandler } from './jobs/aggregate-popular.js';
import { cleanupHandler } from './jobs/cleanup.js';
import {
  wikiLintHandler,
  WIKI_LINT_QUEUE,
  WIKI_LINT_CRON,
} from './jobs/wiki-lint.js';
import { featureWikiLintCron } from '@jarvis/db/feature-flags';
import { ensureBucket } from './lib/minio-client.js';
import { registerBossForHealthcheck, startHealthServer } from './health.js';
import { logger, getQueueMetrics } from './lib/observability/index.js';

const QUEUE_METRICS_INTERVAL_MS = 60_000;

async function main() {
  await boss.start();
  logger.info('[worker] pg-boss started');

  registerBossForHealthcheck(boss);
  startHealthServer(9090);

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

  // Phase-W2 T3 — weekly wiki lint (Sunday 03:00 KST = Saturday 18:00 UTC).
  // Only register when the feature flag is ON so the cron does not fire
  // in environments that have not opted in.
  if (featureWikiLintCron()) {
    await boss.schedule(WIKI_LINT_QUEUE, WIKI_LINT_CRON, {});
    await boss.work(WIKI_LINT_QUEUE, wikiLintHandler);
    logger.info({ cron: WIKI_LINT_CRON }, '[worker] wiki-lint cron registered');
  } else {
    logger.info('[worker] FEATURE_WIKI_LINT_CRON=false — wiki-lint cron NOT registered');
  }

  // (pg-boss error listener is registered in ./lib/boss.ts.)

  // Periodic queue gauge (size/lag) for observability.
  const QUEUE_NAMES = [
    'ingest',
    'embed',
    'compile',
    'graphify-build',
    'check-freshness',
    'aggregate-popular',
    'cleanup',
    WIKI_LINT_QUEUE,
  ];
  const queueMetricsTimer = setInterval(async () => {
    try {
      const metrics = await getQueueMetrics(boss, QUEUE_NAMES);
      for (const m of metrics) {
        logger.info(
          { queue: m.queue, size: m.size, lag: m.lag },
          '[metrics] queue gauge',
        );
      }
    } catch (err) {
      logger.warn({ err }, '[metrics] queue gauge failed');
    }
  }, QUEUE_METRICS_INTERVAL_MS);
  // Don't keep the event loop alive just for the metrics timer.
  queueMetricsTimer.unref?.();

  logger.info('[worker] All job handlers registered. Worker is running.');

  process.on('SIGTERM', async () => {
    logger.info('[worker] SIGTERM received, stopping...');
    clearInterval(queueMetricsTimer);
    await boss.stop();
    logger.info('[worker] pg-boss stopped. Exiting.');
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('[worker] SIGINT received, stopping...');
    clearInterval(queueMetricsTimer);
    await boss.stop();
    logger.info('[worker] pg-boss stopped. Exiting.');
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, '[worker] Fatal error');
  process.exit(1);
});
