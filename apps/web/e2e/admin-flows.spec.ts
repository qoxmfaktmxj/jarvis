import { expect, test } from "@playwright/test";
import { PUBLIC_ROUTE_ALLOWLIST } from "@jarvis/shared";
import { loginAsAdmin, loginAsEditor, loginAsTarget } from "./helpers/auth";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Playwright`);
  }
  return value.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe.configure({ mode: "serial" });

test("ADMIN can change another user's role and that user's next request is rejected after session revocation", async ({ page, browser }) => {
  const targetEmail = getRequiredEnv("PLAYWRIGHT_TARGET_EMAIL");

  const targetContext = await browser.newContext();
  const targetPage = await targetContext.newPage();
  await loginAsTarget(targetPage);
  await targetPage.goto("/dashboard");
  await expect(targetPage).toHaveURL(/\/dashboard$/);

  await loginAsAdmin(page);
  await page.goto("/admin/users");

  const targetRow = page.getByRole("table").getByRole("row", { name: new RegExp(escapeRegExp(targetEmail), "i") });
  await expect(targetRow).toBeVisible();

  const targetRoleSelect = targetRow.getByRole("combobox").nth(1);
  await targetRoleSelect.selectOption("EDITOR");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장되었습니다.")).toBeVisible();

  await targetPage.goto("/dashboard");
  await expect(targetPage).toHaveURL(/\/login/);
  await targetContext.close();
});

test("ADMIN cannot delete self from /admin/users", async ({ page }) => {
  const adminEmail = getRequiredEnv("PLAYWRIGHT_ADMIN_EMAIL");

  await loginAsAdmin(page);
  await page.goto("/admin/users");
  await expect(page.getByRole("button", { name: `${adminEmail} 삭제` })).toBeDisabled();
});

test("ADMIN menu route is restricted to PUBLIC_ROUTE_ALLOWLIST and does not accept arbitrary routePath input", async ({ page }) => {
  const allowedRoutes = new Set(PUBLIC_ROUTE_ALLOWLIST);

  await loginAsAdmin(page);
  await page.goto("/admin/menus");

  await expect(page.getByRole("button", { name: "저장" })).toBeVisible();

  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const selects = row.locator("select");
    await expect(selects).toHaveCount(2);

    const routeSelect = selects.nth(1);
    const options = await routeSelect.locator("option").evaluateAll((elements) =>
      elements.map((element) => (element as HTMLOptionElement).value),
    );
    expect(options.length).toBeGreaterThan(0);
    for (const value of options) {
      expect(allowedRoutes.has(value)).toBe(true);
    }
  }

  await expect(page.getByRole("columnheader", { name: /부모/ })).toHaveCount(0);
});

test("ADMIN cannot create a parent cycle through the UI", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/menus");

  const headers = await page.getByRole("columnheader").allTextContents();
  expect(headers).toEqual(expect.arrayContaining(["코드", "메뉴명", "유형", "경로", "정렬"]));
  expect(headers).not.toContain("부모");
  expect(headers).not.toContain("상위");
  expect(headers).not.toContain("parent");
});

test("EDITOR can queue source ingest and resolve a wiki review", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/admin/sources");

  await page.getByPlaceholder("provider").fill("synthetic-hr");
  await page.getByPlaceholder("externalId").fill("synthetic-annual-leave-guide-001");
  await page.getByRole("button", { name: "수집 예약" }).click();

  await expect(page.getByText(/수집 작업이 예약되었습니다:/)).toBeVisible();

  await page.goto("/admin/wiki-reviews");
  const reviewRow = page.getByRole("row", { name: "E2E synthetic review" });
  await expect(reviewRow).toBeVisible();
  await reviewRow.getByRole("button", { name: "해결" }).click();
  await expect(reviewRow.getByRole("cell").nth(1)).toHaveText("resolved");
  await page.reload();

  const updatedReviewRow = page.getByRole("row", { name: "E2E synthetic review" });
  await expect(updatedReviewRow.getByRole("cell").nth(1)).toHaveText("resolved");
});

test("EDITOR cannot open /admin/users", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
});
