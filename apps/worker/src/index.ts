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

  // Phase-W2 T3 — weekly wiki lint (Sunday 03:00 KST = Saturday 18:00 UTC).
  // Only register when the feature flag is ON so the cron does not fire
  // in environments that have not opted in.
  if (featureWikiLintCron()) {
    await boss.schedule(WIKI_LINT_QUEUE, WIKI_LINT_CRON, {});
    await boss.work(WIKI_LINT_QUEUE, wikiLintHandler);
    console.log(`[worker] wiki-lint cron registered (${WIKI_LINT_CRON})`);
  } else {
    console.log('[worker] FEATURE_WIKI_LINT_CRON=false — wiki-lint cron NOT registered');
  }

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
