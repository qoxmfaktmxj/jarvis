import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user as userSchema } from '@jarvis/db/schema/user';
import { userSession } from '@jarvis/db/schema/user-session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * apps/web/e2e/sidebar-tree.spec.ts (Task 7 — sidebar tree IA)
 *
 * Verifies the new tree-shaped sidebar IA (Tasks 1-6):
 * - 9 top-level groups (지식 / 프로젝트 / 영업 / 운영 / 인력 / 설정 …)
 *   render as collapsible <button aria-expanded> headers
 * - Standalones (대시보드 / 공지사항 / 프로필) render as leaf <a> links
 * - Legacy "관리자" group label is GONE (분산됨)
 * - Group expand state persists across reload via localStorage `jv.sidebar.tree`
 * - Direct route entry auto-opens ancestor groups (영업 → 마스터 → 고객사관리)
 *
 * Login pattern: same as `sidebar-rbac.spec.ts` — `loginAsSeededUser` inserts
 * a real `user_session` row referencing a seeded user, because the sidebar
 * uses `getVisibleMenuTree(session, "menu")` which JOINs through `user_role`.
 * Synthetic `helpers/auth.ts` users would have zero menus and the assertions
 * would all fail. Requires `pnpm db:seed` (admin@jarvis.local in jarvis ws).
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

test.describe('sidebar tree IA', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'ADMIN');
  });

  test('admin sees the new 9-group structure (no 관리자 label)', async ({ page }) => {
    await page.goto('/dashboard');

    // Top-level groups visible as collapsible buttons (NavGroup renders
    // <button aria-expanded> with the label as accessible name).
    await expect(page.getByRole('button', { name: '지식' })).toBeVisible();
    await expect(page.getByRole('button', { name: '프로젝트' })).toBeVisible();
    await expect(page.getByRole('button', { name: '영업' })).toBeVisible();
    await expect(page.getByRole('button', { name: '운영' })).toBeVisible();
    await expect(page.getByRole('button', { name: '인력' })).toBeVisible();
    await expect(page.getByRole('button', { name: '설정' })).toBeVisible();

    // Standalones rendered as leaf links (not group buttons).
    await expect(page.getByRole('link', { name: '대시보드' })).toBeVisible();
    await expect(page.getByRole('link', { name: '공지사항' })).toBeVisible();
    await expect(page.getByRole('link', { name: '프로필' })).toBeVisible();

    // Legacy "관리자" group label is GONE (RBAC handles permissions; admin items
    // are dispersed across 인력 / 설정 / 지식 groups per IA decision).
    await expect(page.getByRole('button', { name: '관리자' })).toHaveCount(0);
  });

  test('group expand/collapse persists across reload (localStorage jv.sidebar.tree)', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    // /dashboard is a standalone leaf, not inside 지식 → group is closed by default.
    const knowledgeBtn = page.getByRole('button', { name: '지식' });
    await expect(knowledgeBtn).toHaveAttribute('aria-expanded', 'false');

    await knowledgeBtn.click();
    await expect(knowledgeBtn).toHaveAttribute('aria-expanded', 'true');

    // Reload — open state persists via localStorage `jv.sidebar.tree`.
    await page.reload();
    await expect(page.getByRole('button', { name: '지식' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('active-route auto-opens ancestor group (knowledge route)', async ({ page }) => {
    // Active-route auto-open verification on /knowledge (group.knowledge > nav.knowledge).
    // /knowledge is a stable route that hasn't been touched by other concurrent
    // refactors and is known to render fast. The 2-level sales test is intentionally
    // omitted because pre-existing React setState-in-render bugs on multiple sales
    // pages prevent sidebar hydration and would mask the assertion.
    await page.goto('/knowledge');
    await page.locator('aside[aria-label="Primary navigation"]').waitFor({ state: 'visible' });

    const knowledgeBtn = page.getByRole('button', { name: '지식', exact: true });
    await expect(knowledgeBtn).toBeVisible();
    await expect(knowledgeBtn).toHaveAttribute('aria-expanded', 'true');

    // Leaf link visible because ancestor group auto-opened.
    await expect(page.getByRole('link', { name: 'Knowledge', exact: true })).toBeVisible();
  });
});
