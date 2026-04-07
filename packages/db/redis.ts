import { Redis } from "ioredis";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const globalForRedis = globalThis as typeof globalThis & {
  __jarvisRedis__?: Redis;
};

export function getRedis(): Redis {
  if (!globalForRedis.__jarvisRedis__) {
    globalForRedis.__jarvisRedis__ = new Redis(redisUrl);
  }
  return globalForRedis.__jarvisRedis__;
}
