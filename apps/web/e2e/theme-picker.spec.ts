import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { user as userSchema } from '@jarvis/db/schema/user';
import { userSession } from '@jarvis/db/schema/user-session';
import { ROLE_PERMISSIONS } from '@jarvis/shared/constants/permissions';

/**
 * theme-picker.spec.ts — Task 7
 *
 * Verifies the 5-color theme picker (Notion Blue / Indigo / Teal / Forest /
 * Graphite) works end-to-end:
 * - Default theme = blue, data-theme-color attribute set on <html>
 * - UserMenu → 테마 색상 click → 5 swatch radio group rendered
 * - Click a swatch → localStorage 'jv.themeColor' + <html> dataset 동기화
 * - Page reload → selected theme persists
 * - Sidebar active item background follows brand-primary (CSS var cascade)
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

test.describe('Theme color picker', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSeededUser(page, 'admin@jarvis.local', 'ADMIN');
    await page.goto('/dashboard');
  });

  test('default theme = blue, data-theme-color attribute set on <html>', async ({ page }) => {
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme-color', 'blue');
  });

  test('UserMenu → 테마 색상 click → 5 swatch rendered', async ({ page }) => {
    // UserMenu trigger button (사용자 이름 노출)
    await page.getByRole('button', { name: /Admin User|ADMIN/i }).first().click();
    // 테마 색상 submenu trigger (i18n: Common.themeColor = "테마 색상")
    await page.getByRole('menuitem', { name: /테마 색상/ }).click();
    // 5 swatch radio group
    const radioGroup = page.getByRole('radiogroup', { name: /테마 색상 선택/ });
    await expect(radioGroup).toBeVisible();
    await expect(radioGroup.getByRole('radio')).toHaveCount(5);
  });

  test('Forest 선택 → data-theme-color + localStorage 업데이트', async ({ page }) => {
    await page.getByRole('button', { name: /Admin User|ADMIN/i }).first().click();
    await page.getByRole('menuitem', { name: /테마 색상/ }).click();
    await page.getByRole('radio', { name: 'Forest' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme-color', 'forest');
    const stored = await page.evaluate(() => window.localStorage.getItem('jv.themeColor'));
    expect(stored).toBe('forest');
  });

  test('페이지 reload 후에도 선택 테마 유지 (localStorage 영속)', async ({ page }) => {
    await page.getByRole('button', { name: /Admin User|ADMIN/i }).first().click();
    await page.getByRole('menuitem', { name: /테마 색상/ }).click();
    await page.getByRole('radio', { name: 'Indigo' }).click();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme-color', 'indigo');
  });

  test('사이드바 active 항목 background가 transparent 아님 (brand-primary-bg cascade)', async ({
    page,
  }) => {
    // 대시보드 active 상태에서 활성 메뉴 항목 computed style 확인
    // (active 시각 변경 = warm-soft pill → brand-primary 틴트 + 좌측 indicator)
    const activeNav = page.locator('a[aria-current="page"]').first();
    await expect(activeNav).toBeVisible();
    const bgColor = await activeNav.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor,
    );
    // brand-primary-bg = color-mix(in oklab, blue 8%, white 92%) ≈ 매우 연한 파랑
    // 정확 hex 검증보다 transparent 아닌지만 검증
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('transparent');
    expect(bgColor).not.toBe('');
  });
});
