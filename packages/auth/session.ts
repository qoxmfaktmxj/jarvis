import { db } from "@jarvis/db/client";
import { eq } from "@jarvis/db/operators";
import { userSession } from "@jarvis/db/schema/user-session";
import { jarvisSessionSchema, type JarvisSession } from "./types.js";

const SESSION_TTL_SEC = 60 * 60 * 8;

/**
 * Validate a JSONB session blob. Returns the typed session on success,
 * or null if the shape doesn't match (treat as corrupt/stale → caller
 * should delete the row and force re-login).
 */
function parseSession(data: unknown): JarvisSession | null {
  const parsed = jarvisSessionSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function createSession(session: JarvisSession): Promise<void> {
  await db.insert(userSession).values({
    id: session.id,
    // JarvisSession (typed object) → Record<string, unknown> (DB schema type).
    // Structurally compatible but TS needs the widening; the cast is safe.
    data: session as unknown as Record<string, unknown>,
    expiresAt: new Date(session.expiresAt),
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

  const session = parseSession(row.data);
  if (!session) {
    // Corrupt row — treat as invalid, evict, force re-login.
    await db.delete(userSession).where(eq(userSession.id, sessionId));
    return null;
  }
  return session;
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

  const existing = parseSession(row.data);
  if (!existing) {
    await db.delete(userSession).where(eq(userSession.id, sessionId));
    return;
  }

  const extended = new Date(Date.now() + SESSION_TTL_SEC * 1000);
  const session: JarvisSession = {
    ...existing,
    expiresAt: extended.getTime(),
  };

  await db
    .update(userSession)
    .set({
      data: session as unknown as Record<string, unknown>,
      expiresAt: extended,
    })
    .where(eq(userSession.id, sessionId));
}
