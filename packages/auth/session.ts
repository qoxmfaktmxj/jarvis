import { db } from "@jarvis/db/client";
import { eq } from "@jarvis/db/operators";
import { userSession } from "@jarvis/db/schema/user-session";
import type { JarvisSession } from "./types.js";

const SESSION_TTL_SEC = 60 * 60 * 8;

function newExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_SEC * 1000);
}

export async function createSession(session: JarvisSession): Promise<void> {
  await db.insert(userSession).values({
    id: session.id,
    data: session as unknown as Record<string, unknown>,
    expiresAt: newExpiry(),
  });
}

export async function getSession(sessionId: string): Promise<JarvisSession | null> {
  if (!sessionId) return null;

  const rows = await db
    .select()
    .from(userSession)
    .where(eq(userSession.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(userSession).where(eq(userSession.id, sessionId));
    return null;
  }

  return row.data as unknown as JarvisSession;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await db.delete(userSession).where(eq(userSession.id, sessionId));
}

export async function refreshSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const rows = await db
    .select()
    .from(userSession)
    .where(eq(userSession.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return;

  const existing = row.data as unknown as JarvisSession;
  const session: JarvisSession = {
    ...existing,
    expiresAt: Date.now() + SESSION_TTL_SEC * 1000,
  };

  await db
    .update(userSession)
    .set({ data: session as unknown as Record<string, unknown>, expiresAt: newExpiry() })
    .where(eq(userSession.id, sessionId));
}
