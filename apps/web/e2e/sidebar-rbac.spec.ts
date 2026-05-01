import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user as userSchema } from '@jarvis/db/schema/user';
import { userSession } from '@jarvis/db/schema/user-session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * apps/web/e2e/sidebar-rbac.spec.ts (Task 7)
 *
 * Verifies the DB-driven RBAC sidebar (Tasks 1-5):
 * - admin@jarvis.dev (ADMIN role) sees both NAV menus and the "관리자" admin
 *   group with admin-only entries.
 * - bob@jarvis.dev (VIEWER role) sees a subset of NAV menus and DOES NOT see
 *   the admin group at all.
 *
 * The sidebar reads from `getVisibleMenuTree(session, "menu")`, which JOINs
 * through `menu_permission ⨯ role_permission ⨯ user_role` and filters by
 * `role.workspace_id = session.workspaceId`. So the test creates a real
 * session referencing seeded users — TEST_USER_IDs from helpers/auth.ts won't
 * have user_role rows and would return zero menus regardless of role.
 *
 * The test depends on `pnpm db:seed` having run (admin/alice/bob in jarvis
 * workspace, role_permission populated from PERMISSIONS const).
 */

const SESSION_COOKIE = 'sessionId';
const SESSION_TTL_MS = 60 * 60 * 8 * 1000;

async function loginAsSeededUser(page: Page, email: string, role: string): Promise<void> {
  const [u] = await db
    .select({
      id: userSchema.id,
      workspaceId: userSchema.workspaceId,
      employeeId: userSchema.employeeId,
      name: userSchema.name,
      email: userSchema.email,
    })
    .from(userSchema)
    .where(eq(userSchema.email, email))
    .limit(1);

  if (!u) {
    throw new Error(
      `Seeded user not found: ${email}. Did you run pnpm db:seed against the dev DB?`,
    );
  }

  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS);

  await db.insert(userSession).values({
    id: sessionId,
    data: {
      id: sessionId,
      userId: u.id,
      workspaceId: u.workspaceId,
      employeeId: u.employeeId,
      name: u.name,
      email: u.email ?? email,
      roles: [role],
      permissions: [...(ROLE_PERMISSIONS[role] ?? [])],
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    } as unknown as Record<string, unknown>,
    expiresAt,
  });

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

test.describe('Sidebar RBAC (DB-driven)', () => {
  test('admin sees admin group with admin-only menu items', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.dev', 'ADMIN');
    await page.goto('/dashboard');

    // 사이드바에 "관리자" 헤딩이 보여야 함 (sortOrder >= 200 group).
    await expect(page.getByText('관리자', { exact: true })).toBeVisible();

    // ADMIN_ALL을 가진 admin은 admin/menus + admin/companies 등을 모두 봄.
    await expect(page.getByRole('link', { name: '회사', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '사용자', exact: true })).toBeVisible();
  });

  test('viewer sees a subset of NAV but no admin group', async ({ page }) => {
    await loginAsSeededUser(page, 'bob@jarvis.dev', 'VIEWER');
    await page.goto('/dashboard');

    // VIEWER는 KNOWLEDGE_READ + NOTICE_READ + GRAPH_READ 등을 가져 일부 NAV는 보임.
    await expect(page.getByRole('link', { name: '공지사항', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '위키', exact: true })).toBeVisible();

    // ADMIN_ALL이 없으므로 admin 그룹 헤딩과 admin 항목은 절대 보이지 않아야 함.
    await expect(page.getByText('관리자', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '회사', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toHaveCount(0);
  });

  test('viewer hitting /admin/menus directly redirects to /dashboard?error=forbidden', async ({ page }) => {
    await loginAsSeededUser(page, 'bob@jarvis.dev', 'VIEWER');
    await page.goto('/admin/menus');
    // page-level guard (Task 6 fix) sends authenticated non-admin to dashboard,
    // not /login. Used to be /login causing reauth loop.
    await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  });

  test('admin viewer renders permission badges per menu row', async ({ page }) => {
    // Architecture review (Task 6 finding #11): the menu viewer must surface
    // "which permissions gate this menu" — the most RBAC-relevant fact about
    // a row. nav.ask is seeded with KNOWLEDGE_READ + ADMIN_ALL, so both
    // badges should render in the same row as the "AI 질문" label.
    await loginAsSeededUser(page, 'admin@jarvis.dev', 'ADMIN');
    await page.goto('/admin/menus');

    const askRow = page
      .locator('div')
      .filter({ hasText: 'AI 질문' })
      .filter({ hasText: 'nav.ask' })
      .first();
    await expect(askRow.getByText('knowledge:read', { exact: true })).toBeVisible();
    await expect(askRow.getByText('admin:all', { exact: true })).toBeVisible();
  });
});
