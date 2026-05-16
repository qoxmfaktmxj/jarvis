import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user as userSchema } from '@jarvis/db/schema/user';
import { userSession } from '@jarvis/db/schema/user-session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * apps/web/e2e/sidebar-rbac.spec.ts
 *
 * Verifies the DB-driven RBAC sidebar with the new 4-role structure
 * (2026-05-16 RBAC simplification: 47 perms → 23, 5 roles → 4):
 *
 * - admin@jarvis.local (ADMIN role) sees admin-gated group buttons
 *   (인력, 설정 — both have ADMIN_ALL leaves) and reaches admin-only
 *   leaves including the new /admin/roles page.
 * - admin@jarvis.local with synthetic MEMBER session sees a subset of
 *   group buttons but DOES NOT see groups whose every leaf is gated by
 *   ADMIN_ALL — most notably `group.settings`.
 * - admin@jarvis.local with synthetic MEMBER session hitting /admin/roles
 *   directly gets redirected to /dashboard?error=forbidden (page guard).
 *
 * The sidebar reads from `getVisibleMenuTree(session, "menu")`, which JOINs
 * through `menu_permission ⨯ role_permission ⨯ user_role` and filters by
 * `role.workspace_id = session.workspaceId`. The test creates a real
 * session referencing seeded users — TEST_USER_IDs from helpers/auth.ts won't
 * have user_role rows and would return zero menus regardless of role.
 *
 * Depends on `pnpm db:seed` having run (admin user in jarvis workspace,
 * role_permission populated from PERMISSIONS const).
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

test.describe('Sidebar RBAC (DB-driven, 4 roles)', () => {
  test('admin sees admin-gated group buttons and reaches admin-only leaves', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'ADMIN');
    await page.goto('/dashboard');

    // admin-only leaves are distributed across domain groups (인력, 설정, 지식).
    // NavGroup renders the header as a `<button aria-expanded>`.
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '인력', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '지식', exact: true })).toBeVisible();

    // Old flat "관리자" / "영업관리" group labels must NEVER render.
    await expect(page.getByRole('button', { name: '관리자', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '영업관리', exact: true })).toHaveCount(0);

    // Expand 인력 group → 사용자 leaf appears.
    const peopleBtn = page.getByRole('button', { name: '인력', exact: true });
    if ((await peopleBtn.getAttribute('aria-expanded')) !== 'true') {
      await peopleBtn.click();
    }
    await expect(page.getByRole('link', { name: '사용자', exact: true })).toBeVisible();

    // Expand 설정 group → 회사 + 메뉴 + 역할 leaves appear.
    // 역할 (sortOrder=305) is the new /admin/roles page added in RBAC simplification.
    const settingsBtn = page.getByRole('button', { name: '설정', exact: true });
    if ((await settingsBtn.getAttribute('aria-expanded')) !== 'true') {
      await settingsBtn.click();
    }
    await expect(page.getByRole('link', { name: '회사', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '역할', exact: true })).toBeVisible();
  });

  test('member sees permitted groups but admin-only groups are pruned', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'MEMBER');
    await page.goto('/dashboard');

    // MEMBER has knowledge:read, notice:read, graph:read, etc., so the
    // standalone 공지사항 leaf renders.
    await expect(page.getByRole('link', { name: '공지사항', exact: true })).toBeVisible();

    // Old flat "관리자" / "영업관리" headings — must NEVER appear in any role.
    await expect(page.getByRole('button', { name: '관리자', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '영업관리', exact: true })).toHaveCount(0);

    // group.settings: all children require ADMIN_ALL or user:admin. MEMBER
    // has neither, so buildMenuTree's empty-group prune drops the header.
    await expect(page.getByRole('button', { name: '설정', exact: true })).toHaveCount(0);

    // group.sales: every sales.* leaf requires sales:read or sales:admin.
    // MEMBER lacks both, so the entire group prunes.
    await expect(page.getByRole('button', { name: '영업', exact: true })).toHaveCount(0);

    // Specific admin-only leaves — never reachable for MEMBER regardless of
    // group expand state, because the link itself was filtered by
    // permission JOIN.
    await expect(page.getByRole('link', { name: '회사', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '역할', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '사용자', exact: true })).toHaveCount(0);
  });

  test('member hitting /admin/menus directly redirects to /dashboard?error=forbidden', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'MEMBER');
    await page.goto('/admin/menus');
    // page-level guard sends authenticated non-admin to dashboard,
    // not /login (would cause reauth loop).
    await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  });

  test('member hitting /admin/roles directly redirects to /dashboard?error=forbidden', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'MEMBER');
    await page.goto('/admin/roles');
    await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  });

  test('yearend has zero jarvis menus visible (external site only)', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'YEAREND');
    await page.goto('/dashboard');

    // YEAREND role has 0 jarvis permissions — sidebar groups all prune.
    await expect(page.getByRole('button', { name: '설정', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '인력', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '지식', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '영업', exact: true })).toHaveCount(0);

    // 공지사항 leaf requires notice:read — YEAREND lacks it.
    await expect(page.getByRole('link', { name: '공지사항', exact: true })).toHaveCount(0);
  });
});
