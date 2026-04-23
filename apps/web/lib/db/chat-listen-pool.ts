import { Pool } from "pg";

let _pool: Pool | null = null;

export function getChatListenPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({
    connectionString: url,
    max: Number(process.env.CHAT_PG_MAX ?? 200),
    idleTimeoutMillis: 0,
    allowExitOnIdle: false
  });
  return _pool;
}

export async function closeChatListenPool(): Promise<void> {
  if (!_pool) return;
  await _pool.end();
  _pool = null;
}
