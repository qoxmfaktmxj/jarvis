import { type Page } from '@playwright/test';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const SESSION_COOKIE = 'sessionId';
const SESSION_PREFIX = 'jarvis:session:';
const SESSION_TTL = 60 * 60 * 8;

// Canonical UUIDs for e2e fixtures. Database columns (workspace.id, user.id) are
// `uuid`, so non-UUID strings trigger Postgres 22P02 on the dashboard query path.
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000011';
const TEST_ADMIN_ID = '00000000-0000-0000-0000-000000000012';
const TEST_DEV_ID = '00000000-0000-0000-0000-000000000013';

interface LoginOptions {
  role: string;
  userId?: string;
  employeeId?: string;
  name?: string;
  email?: string;
}

async function loginWithRole(page: Page, opts: LoginOptions): Promise<void> {
  const sessionId = randomUUID();
  const redis = new Redis(REDIS_URL);

  const now = Date.now();
  const permissions = ROLE_PERMISSIONS[opts.role] ?? [];

  const sessionData = JSON.stringify({
    id: sessionId,
    userId: opts.userId ?? TEST_USER_ID,
    workspaceId: TEST_WORKSPACE_ID,
    employeeId: opts.employeeId ?? 'EMP001',
    name: opts.name ?? '테스트 사용자',
    email: opts.email ?? 'test@jarvis.internal',
    roles: [opts.role],
    permissions: [...permissions],
    orgId: undefined,
    ssoSubject: opts.userId ?? TEST_USER_ID,
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

export async function loginAsTestUser(page: Page): Promise<void> {
  await loginWithRole(page, { role: 'VIEWER' });
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginWithRole(page, {
    role: 'ADMIN',
    userId: TEST_ADMIN_ID,
    employeeId: 'ADM001',
    name: '관리자',
    email: 'admin@jarvis.internal',
  });
}

export async function loginAsDeveloper(page: Page): Promise<void> {
  await loginWithRole(page, {
    role: 'DEVELOPER',
    userId: TEST_DEV_ID,
    employeeId: 'DEV001',
    name: '개발자',
    email: 'dev@jarvis.internal',
  });
}
