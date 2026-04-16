// apps/worker/src/lib/boss.ts

import PgBoss from 'pg-boss';
import { logger } from './observability/index.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

export const boss = new PgBoss({
  connectionString: DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30,
});

boss.on('error', (error) => {
  logger.error({ err: error }, '[pg-boss] error');
});
