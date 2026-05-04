import PgBoss from 'pg-boss';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

export const boss = new PgBoss({
  connectionString: DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30,
});
