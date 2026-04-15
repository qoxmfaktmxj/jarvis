// apps/worker/src/lib/observability/logger.ts
// T7에서 worker entry point에 wiring 예정
//
// 의존성 설치 필요 (아직 package.json에 없음):
//   pnpm add pino --filter @jarvis/worker
//
// pino 설치 전에는 타입 참조만 되어 있어 런타임 에러가 발생할 수 있으므로,
// T7 wiring 시점에 반드시 pino 설치 후 import 경로를 활성화해야 한다.

import pino, { type Logger, type LoggerOptions } from 'pino';

const options: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: { service: 'jarvis-worker' },
  // JSON 포맷 (pino 기본값) 명시 — pretty transport는 개발용으로 T7에서 옵션 추가
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const logger: Logger = pino(options);

export default logger;
