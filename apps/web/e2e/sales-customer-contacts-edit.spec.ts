/**
 * e2e/sales-customer-contacts-edit.spec.ts  (Task 18 / PR-4)
 *
 * Verifies the [id]/edit double-click flow for sales/customer-contacts:
 *   1. Double-clicking a row navigates to /:id/edit
 *   2. The edit page shows contact form fields and the sidebar [고객사 N] tab
 *   3. Clicking sidebar [고객사 N] tab navigates to /sales/customers/:customerId/edit
 *   4. Editing a field, saving, and back-navigating returns to /sales/customer-contacts
 *
 * Auth: session injection via helpers/auth.ts (ADMIN role).
 * NOTE: e2e tests are CI-only — do not run locally without a seeded DB.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/customer-contacts — [id]/edit double-click flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customer-contacts");
    await page.waitForSelector("table tbody tr, [data-testid='empty-state']", {
      timeout: 15_000,
    });
  });

  test("double-click first row navigates to /:id/edit", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();

    // URL must be /sales/customer-contacts/<uuid>/edit
    await expect(page).toHaveURL(/\/sales\/customer-contacts\/[^/]+\/edit/, {
      timeout: 10_000,
    });
  });

  test("edit page sidebar shows 고객사 N count tab", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customer-contacts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Sidebar tab button: t("customer", { count }) → "고객사 (N)"
    await expect(
      page.getByRole("button", { name: /^고객사 \(\d+\)$/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar [고객사 N] tab navigates to /sales/customers/:customerId/edit", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customer-contacts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    const tabBtn = page.getByRole("button", { name: /^고객사 \(\d+\)$/ }).first();
    await expect(tabBtn).toBeVisible({ timeout: 10_000 });

    // Only enabled when a customerId is associated; skip if disabled
    const isDisabled = await tabBtn.isDisabled();
    if (isDisabled) test.skip();

    await tabBtn.click();

    await expect(page).toHaveURL(/\/sales\/customers\/[^/]+\/edit/, {
      timeout: 10_000,
    });
  });

  test("back button returns to /sales/customer-contacts", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customer-contacts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "뒤로가기" }).click();
    await expect(page).toHaveURL(/\/sales\/customer-contacts$/, {
      timeout: 10_000,
    });
  });

  test("edit custName and save navigates back to /sales/customer-contacts", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/customer-contacts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // First editable input is custName (고객명)
    const nameInput = page.locator("input[type='text']").first();
    const original = await nameInput.inputValue();
    await nameInput.fill(`${original}-e2e`);

    page.on("dialog", (d) => d.accept());

    await page.getByRole("button", { name: "저장" }).click();

    await expect(page).toHaveURL(/\/sales\/customer-contacts$/, {
      timeout: 10_000,
    });
  });
});
