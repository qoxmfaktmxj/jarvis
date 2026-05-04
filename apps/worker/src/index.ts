// apps/worker/src/index.ts

import { initSentry } from '@jarvis/shared/sentry';
initSentry();

import 'dotenv/config';
import type PgBoss from 'pg-boss';
import { boss } from './lib/boss.js';
import { ingestHandler } from './jobs/ingest.js';
// Phase-Harness (2026-04-23): embedHandler 제거. embed 파이프라인 폐지.
import { compileHandler } from './jobs/compile.js';
import { graphifyBuildHandler } from './jobs/graphify-build.js';
import { staleCheckHandler } from './jobs/stale-check.js';
import { aggregatePopularHandler } from './jobs/aggregate-popular.js';
import { cleanupHandler } from './jobs/cleanup.js';
import { cacheCleanupHandler } from './jobs/cache-cleanup.js';
import {
  wikiLintHandler,
  WIKI_LINT_QUEUE,
  WIKI_LINT_CRON,
} from './jobs/wiki-lint.js';
import {
  quizGenerateHandler,
  QUIZ_GENERATE_QUEUE,
  QUIZ_GENERATE_CRON,
} from './jobs/wiki-quiz-generate.js';
import {
  quizSeasonRotateHandler,
  QUIZ_SEASON_ROTATE_QUEUE,
  QUIZ_SEASON_ROTATE_CRON,
} from './jobs/quiz-season-rotate.js';
import {
  externalSignalFetchHandler,
  EXTERNAL_SIGNAL_FETCH_QUEUE,
  EXTERNAL_SIGNAL_FETCH_CRON,
} from './jobs/external-signal-fetch.js';
import { serviceDeskImport } from './jobs/service-desk-import.js';
import {
  wikiLinkInfraSystemHandler,
  WIKI_LINK_INFRA_QUEUE,
} from './jobs/wiki-link-infra-system.js';
import { featureWikiLintCron } from '@jarvis/db/feature-flags';
import { ensureBucket } from './lib/minio-client.js';
import { registerBossForHealthcheck, startHealthServer } from './health.js';
import { logger, getQueueMetrics } from './lib/observability/index.js';

const QUEUE_METRICS_INTERVAL_MS = 60_000;

interface ServiceDeskImportJobData {
  workspaceId: string;
  enterCd: string;
  ym: string;
  ssnGrpCd?: string;
  userId?: string;
}

async function main() {
  await boss.start();
  logger.info('[worker] pg-boss started');

  registerBossForHealthcheck(boss);
  startHealthServer(9090);

  await ensureBucket();

  // pg-boss v10: queues must be created before schedule/work.
  // Sequential to avoid DDL deadlocks on pgboss.queue.
  for (const q of ['ingest', 'compile', 'graphify-build', 'check-freshness', 'aggregate-popular', 'cleanup', 'cache-cleanup', 'service-desk-import', QUIZ_GENERATE_QUEUE, QUIZ_SEASON_ROTATE_QUEUE, EXTERNAL_SIGNAL_FETCH_QUEUE, WIKI_LINK_INFRA_QUEUE]) {
    await boss.createQueue(q);
  }

  await boss.work('ingest', { batchSize: 5 }, ingestHandler);
  // Phase-Harness (2026-04-23): embed queue/worker 제거.
  await boss.work('compile', { batchSize: 3 }, compileHandler);
  await boss.work('graphify-build', { batchSize: 1 }, graphifyBuildHandler);

  await boss.schedule('check-freshness', '0 9 * * *', {});
  await boss.work('check-freshness', staleCheckHandler);

  await boss.schedule('aggregate-popular', '0 0 * * 0', {});
  await boss.work('aggregate-popular', aggregatePopularHandler);

  await boss.schedule('cleanup', '0 0 1 * *', {});
  await boss.work('cleanup', cleanupHandler);

  // 6시간마다 만료 세션 청소 (Phase-Harness 이후 embed_cache 제거로 세션만)
  await boss.schedule('cache-cleanup', '0 */6 * * *', {});
  await boss.work('cache-cleanup', cacheCleanupHandler);

  // Phase-Dashboard (2026-04-30) — 위키 퀴즈 주간 batch + 시즌 rotate.
  await boss.schedule(QUIZ_GENERATE_QUEUE, QUIZ_GENERATE_CRON, {});
  await boss.work(QUIZ_GENERATE_QUEUE, quizGenerateHandler);
  await boss.schedule(QUIZ_SEASON_ROTATE_QUEUE, QUIZ_SEASON_ROTATE_CRON, {});
  await boss.work(QUIZ_SEASON_ROTATE_QUEUE, quizSeasonRotateHandler);

  // Phase-Dashboard (2026-04-30) — 외부 시그널(FX + 날씨) 캐시.
  // KST 07-19시 매시 + KST 21·00·03시 = 하루 16회 (단일 cron 표현식으로 등록).
  // pg-boss schedule()은 큐 이름을 PK로 사용하므로 두 번 호출하면 마지막 값만 남는다.
  await boss.schedule(EXTERNAL_SIGNAL_FETCH_QUEUE, EXTERNAL_SIGNAL_FETCH_CRON, {});
  await boss.work(EXTERNAL_SIGNAL_FETCH_QUEUE, externalSignalFetchHandler);

  // Phase-C (TSVD999) — service desk incident import.
  // Direct work handler — UI button or schedule fan-out sends jobs to this queue.
  await boss.work('service-desk-import', async (jobs: PgBoss.Job<ServiceDeskImportJobData>[]) => {
    for (const job of jobs) {
      const { workspaceId, enterCd, ym, ssnGrpCd, userId } = job.data;
      await serviceDeskImport({ workspaceId, enterCd, ym, ssnGrpCd, userId });
    }
  });

  // Monthly schedule (KST 1st 00:00) — fan-out via env-configured default workspace.
  // Multi-workspace fan-out is out of scope (single workspace assumption per design doc §12).
  await boss.schedule('service-desk-import-monthly', '0 0 1 * *', {}, { tz: 'Asia/Seoul' });

  await boss.work('service-desk-import-monthly', async () => {
    const defaultWsId = process.env.SERVICE_DESK_DEFAULT_WORKSPACE_ID;
    const defaultEnterCd = process.env.SERVICE_DESK_DEFAULT_ENTER_CD;
    if (!defaultWsId || !defaultEnterCd) {
      logger.warn('[service-desk-import-monthly] SERVICE_DESK_DEFAULT_WORKSPACE_ID / _ENTER_CD env not set; skipping');
      return;
    }
    const now = new Date();
    // Fetch previous month's data
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ym = `${lastMonth.getFullYear()}${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    await boss.send('service-desk-import', {
      workspaceId: defaultWsId,
      enterCd: defaultEnterCd,
      ym,
    });
  });

  // Plan 5 — H3: wiki ingest 후 infra_system.wikiPageId 자동 link.
  // 트리거는 외부에서 boss.send(WIKI_LINK_INFRA_QUEUE, { workspaceId }).
  // ingest write-and-commit 잡 완료 시 emit (별도 PR에서 hook 추가 예정).
  await boss.work(WIKI_LINK_INFRA_QUEUE, wikiLinkInfraSystemHandler);

  // Phase-W2 T3 — weekly wiki lint (Sunday 03:00 KST = Saturday 18:00 UTC).
  // Only register when the feature flag is ON so the cron does not fire
  // in environments that have not opted in.
  if (featureWikiLintCron()) {
    await boss.createQueue(WIKI_LINT_QUEUE);
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
    'compile',
    'graphify-build',
    'check-freshness',
    'aggregate-popular',
    'cleanup', 'cache-cleanup',
    'service-desk-import',
    WIKI_LINT_QUEUE,
    QUIZ_GENERATE_QUEUE,
    QUIZ_SEASON_ROTATE_QUEUE,
    EXTERNAL_SIGNAL_FETCH_QUEUE,
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
