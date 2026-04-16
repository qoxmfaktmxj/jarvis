// apps/worker/src/lib/observability/logger.ts

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
