/**
 * e2e/sales-customers-edit.spec.ts  (Task 18 / PR-4)
 *
 * Verifies the [id]/edit double-click flow for sales/customers:
 *   1. Double-clicking a row navigates to /:id/edit
 *   2. The edit page shows "기본정보" fieldset and the sidebar tab "고객 N"
 *   3. Clicking sidebar [고객 N] tab navigates to /sales/customer-contacts?customerId=
 *   4. Editing a field, saving, and back-navigating returns to /sales/customers
 *
 * Auth: session injection via helpers/auth.ts (ADMIN role).
 * NOTE: e2e tests are CI-only — do not run locally without a seeded DB.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/customers — [id]/edit double-click flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customers");
    await page.waitForSelector("table tbody tr, [data-testid='empty-state']", {
      timeout: 15_000,
    });
  });

  test("double-click first row navigates to /:id/edit and shows fieldset", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();

    // URL must be /sales/customers/<uuid>/edit
    await expect(page).toHaveURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Edit page description text is hardcoded in page.tsx
    await expect(page.getByText("고객사 정보를 수정합니다.")).toBeVisible();
  });

  test("edit page sidebar shows 고객 N count tab", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Sidebar tab button: t("customers", { count }) → "고객 (N)"
    await expect(
      page.getByRole("button", { name: /^고객 \(\d+\)$/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar [고객 N] tab navigates to /sales/customer-contacts?customerId=", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    const tabBtn = page.getByRole("button", { name: /^고객 \(\d+\)$/ }).first();
    await expect(tabBtn).toBeVisible({ timeout: 10_000 });
    await tabBtn.click();

    await expect(page).toHaveURL(/\/sales\/customer-contacts\?customerId=/, {
      timeout: 10_000,
    });
  });

  test("back button returns to /sales/customers", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // 뒤로가기 button
    await page.getByRole("button", { name: "뒤로가기" }).click();
    await expect(page).toHaveURL(/\/sales\/customers$/, { timeout: 10_000 });
  });

  test("edit ceoNm and save navigates back to /sales/customers", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Find the 대표자명 input and change its value
    const ceoInput = page.locator("input").nth(2); // custCd(readonly), custNm, ceoNm order
    const original = await ceoInput.inputValue();
    await ceoInput.fill(`${original}-e2e`);

    // accept any confirm dialog (delete) — save does not prompt
    page.on("dialog", (d) => d.accept());

    await page.getByRole("button", { name: "저장" }).click();

    await expect(page).toHaveURL(/\/sales\/customers$/, { timeout: 10_000 });
  });
});
