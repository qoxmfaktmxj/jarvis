import { type Page } from '@playwright/test';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

// Match actual Redis URL from env (port 6380)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

// Cookie name from apps/web/middleware.ts: request.cookies.get("sessionId")
const SESSION_COOKIE = 'sessionId';

// Redis key prefix from packages/auth/session.ts: "jarvis:session:"
const SESSION_PREFIX = 'jarvis:session:';

// Session TTL matching packages/auth/session.ts (8 hours)
const SESSION_TTL = 60 * 60 * 8;

export async function loginAsTestUser(page: Page): Promise<void> {
  const sessionId = randomUUID();
  const redis = new Redis(REDIS_URL);

  const now = Date.now();
  // Match JarvisSession from packages/auth/types.ts
  const sessionData = JSON.stringify({
    id: sessionId,
    userId: 'test-user-id-001',
    workspaceId: 'test-workspace-id-001',
    employeeId: 'EMP001',
    name: '테스트 사용자',
    email: 'test@jarvis.internal',
    roles: ['VIEWER'],
    permissions: [],
    orgId: undefined,
    ssoSubject: 'test-user-id-001',
    createdAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  });

  await redis.setex(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL, sessionData);
  await redis.quit();

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionId,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const sessionId = randomUUID();
  const redis = new Redis(REDIS_URL);

  const now = Date.now();
  const sessionData = JSON.stringify({
    id: sessionId,
    userId: 'test-admin-id-001',
    workspaceId: 'test-workspace-id-001',
    employeeId: 'ADM001',
    name: '관리자',
    email: 'admin@jarvis.internal',
    roles: ['ADMIN'],
    permissions: [],
    orgId: undefined,
    ssoSubject: 'test-admin-id-001',
    createdAt: now,
    expiresAt: now + SESSION_TTL * 1000,
  });

  await redis.setex(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL, sessionData);
  await redis.quit();

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionId,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
