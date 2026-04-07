import { getRedis } from "@jarvis/db/redis";
import type { JarvisSession } from "./types.js";

const SESSION_TTL = 60 * 60 * 8;
const SESSION_PREFIX = "jarvis:session:";

export async function createSession(session: JarvisSession): Promise<void> {
  await getRedis().setex(
    `${SESSION_PREFIX}${session.id}`,
    SESSION_TTL,
    JSON.stringify(session)
  );
}

export async function getSession(
  sessionId: string
): Promise<JarvisSession | null> {
  if (!sessionId) return null;

  const raw = await getRedis().get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;

  const session = JSON.parse(raw) as JarvisSession;

  // Explicit expiry check — defence in depth beyond Redis TTL
  if (Date.now() > session.expiresAt) {
    await getRedis().del(`${SESSION_PREFIX}${sessionId}`);
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await getRedis().del(`${SESSION_PREFIX}${sessionId}`);
}

export async function refreshSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await getRedis().expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);
}
