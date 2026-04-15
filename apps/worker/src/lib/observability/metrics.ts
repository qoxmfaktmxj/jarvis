// apps/worker/src/lib/observability/metrics.ts
// T7에서 worker entry point에 wiring 예정
//
// pg-boss v10 API 기반 queue 메트릭 수집.
// - boss.getQueueSize(name): 현재 대기(pending) job 수
// - boss.getQueue(name): queue 메타 (createdOn 등) — lag 계산용
// - boss.getJobById / getArchive 는 개별 job 조회이므로 여기서는 사용하지 않음
//
// lag(초): "가장 오래된 대기 중 job이 큐에 들어온 시점"과 현재 시각의 차이.
// pg-boss v10은 직접적인 oldest-pending API를 제공하지 않으므로,
// lag은 일단 0으로 리턴하고 T7에서 pg 직접 쿼리(pgboss.job 테이블)로 보강한다.

import type PgBoss from 'pg-boss';

export interface QueueMetrics {
  queue: string;
  size: number;
  lag: number;
}

/**
 * 주어진 큐 목록에 대해 size/lag 메트릭을 수집한다.
 * T7에서 scrape 인터벌(예: 30초)로 호출되어 Prometheus exporter 또는
 * logger를 통해 export될 예정.
 *
 * @param boss  이미 start() 된 PgBoss 인스턴스
 * @param queues  모니터링할 큐 이름 배열. 비어 있으면 빈 배열 반환.
 */
export async function getQueueMetrics(
  boss: PgBoss,
  queues: readonly string[] = [],
): Promise<QueueMetrics[]> {
  if (queues.length === 0) return [];

  const results = await Promise.all(
    queues.map(async (queue): Promise<QueueMetrics> => {
      try {
        const size = await boss.getQueueSize(queue);
        // lag은 T7에서 pgboss.job 테이블 SELECT min(createdOn) WHERE state='created'
        // 형태로 보강. 현 시점에서는 placeholder 0.
        const lag = 0;
        return { queue, size, lag };
      } catch {
        // 큐가 존재하지 않거나 getQueueSize 실패 시 0으로 표기 (exporter가 죽지 않도록).
        return { queue, size: 0, lag: 0 };
      }
    }),
  );

  return results;
}
