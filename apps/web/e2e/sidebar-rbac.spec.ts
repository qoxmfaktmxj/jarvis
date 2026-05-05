import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user as userSchema } from '@jarvis/db/schema/user';
import { userSession } from '@jarvis/db/schema/user-session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * apps/web/e2e/sidebar-rbac.spec.ts (Task 7 + Task 8 IA reorg)
 *
 * Verifies the DB-driven RBAC sidebar with the new tree IA (sidebar-tree-ia
 * plan, 2026-05-05):
 * - admin@jarvis.dev (ADMIN role) sees the admin-gated group buttons
 *   (인력, 설정 — both have ADMIN_ALL leaves) and can reach admin-only
 *   leaves once the group is expanded.
 * - bob@jarvis.dev (VIEWER role) sees a subset of group buttons but DOES
 *   NOT see groups whose every leaf is gated by ADMIN_ALL — most notably
 *   `group.settings` (all 8 children require ADMIN_ALL or CONTRACTOR_ADMIN,
 *   which VIEWER lacks → buildMenuTree empty-group prune removes the header).
 *
 * Old "관리자" / "영업관리" flat headings are GONE — the IA collapsed admin
 * menus into domain groups (인력 / 설정 / 지식 / 프로젝트). NavGroup renders
 * each group as a `<button aria-expanded>`, so assertions use
 * `getByRole("button", { name })`.
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
  test('admin sees admin-gated group buttons and reaches admin-only leaves', async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.dev', 'ADMIN');
    await page.goto('/dashboard');

    // New IA: admin-only leaves are distributed across domain groups (인력,
    // 설정, 지식). NavGroup renders the header as a `<button aria-expanded>`,
    // so we assert on role=button. The flat "관리자" heading is gone.
    await expect(page.getByRole('button', { name: '설정', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '인력', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '지식', exact: true })).toBeVisible();

    // The old flat "관리자" / "영업관리" group labels must NEVER render.
    await expect(page.getByRole('button', { name: '관리자', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '영업관리', exact: true })).toHaveCount(0);

    // Reach admin-only leaves through their new groups. Navigate to
    // /admin/users to trigger useNavTreeOpen's active-route auto-expand for
    // group.people (server-rendered link doesn't require explicit clicks).
    await page.goto('/admin/users');
    await expect(page.getByRole('link', { name: '사용자', exact: true })).toBeVisible();

    // /admin/companies auto-expands group.settings → 회사 + 메뉴 visible.
    await page.goto('/admin/companies');
    await expect(page.getByRole('link', { name: '회사', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toBeVisible();
  });

  test('viewer sees permitted groups but admin-only groups are pruned', async ({ page }) => {
    await loginAsSeededUser(page, 'bob@jarvis.dev', 'VIEWER');
    await page.goto('/dashboard');

    // VIEWER has KNOWLEDGE_READ, GRAPH_READ, NOTICE_READ, etc., so the
    // standalone 공지사항 leaf renders. (공지사항 is sortOrder=80, no group.)
    await expect(page.getByRole('link', { name: '공지사항', exact: true })).toBeVisible();

    // Old flat "관리자" / "영업관리" headings — must NEVER appear in any role.
    await expect(page.getByRole('button', { name: '관리자', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '영업관리', exact: true })).toHaveCount(0);

    // group.settings: all 8 children require ADMIN_ALL or CONTRACTOR_ADMIN.
    // VIEWER has neither, so buildMenuTree's empty-group prune drops the
    // header entirely → button absent.
    await expect(page.getByRole('button', { name: '설정', exact: true })).toHaveCount(0);

    // group.sales: every sales.* leaf requires SALES_ALL. VIEWER lacks it,
    // so the entire group (and its sub-groups) prunes.
    await expect(page.getByRole('button', { name: '영업', exact: true })).toHaveCount(0);

    // Specific admin-only leaves — never reachable for VIEWER regardless of
    // group expand state, because the link itself was filtered by
    // permission JOIN.
    await expect(page.getByRole('link', { name: '회사', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '메뉴', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '사용자', exact: true })).toHaveCount(0);
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
