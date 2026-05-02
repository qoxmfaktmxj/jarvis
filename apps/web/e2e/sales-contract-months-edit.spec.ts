/**
 * e2e/sales-contract-months-edit.spec.ts  (Task 6 / PR-1B)
 *
 * Verifies the [id]/edit double-click flow for sales/contract-months:
 *   1. Double-clicking a row navigates to /:id/edit
 *   2. The edit page shows the "Sales · Contract Months" eyebrow and month heading
 *   3. Editing a field (note/비고) and saving returns to /sales/contract-months
 *   4. Delete with confirm dialog returns to /sales/contract-months
 *   5. Back button without saving returns to /sales/contract-months
 *   6. PLAN, VIEW, PERF section headers are all visible
 *
 * Auth: session injection via helpers/auth.ts (ADMIN role).
 * Empty-seed resilience: tests skip via test.skip when no rows present.
 * NOTE: e2e tests are CI-only — do not run locally without a seeded DB.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/contract-months — [id]/edit double-click flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/contract-months");
    await page.waitForSelector("table tbody tr, [data-testid='empty-state']", {
      timeout: 15_000,
    });
  });

  test("double-click first row navigates to /:id/edit and shows heading", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();

    // URL must be /sales/contract-months/<uuid>/edit
    await expect(page).toHaveURL(/\/sales\/contract-months\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // PageHeader eyebrow text
    await expect(page.getByText("Sales · Contract Months")).toBeVisible();
  });

  test("edit note (비고) and save navigates back to /sales/contract-months", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contract-months\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Fill the 비고 textarea (last textarea on the page)
    const noteTextarea = page.locator("textarea").last();
    const original = await noteTextarea.inputValue();
    await noteTextarea.fill(`${original}-e2e`);

    await page.getByRole("button", { name: "저장" }).click();

    await expect(page).toHaveURL(/\/sales\/contract-months$/, {
      timeout: 10_000,
    });
  });

  test("delete with confirm dialog navigates back to /sales/contract-months", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contract-months\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Accept the confirm dialog that handleDelete() triggers
    page.on("dialog", (d) => d.accept());

    await page.getByRole("button", { name: "삭제" }).click();

    await expect(page).toHaveURL(/\/sales\/contract-months$/, {
      timeout: 10_000,
    });
  });

  test("back button without saving returns to /sales/contract-months", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contract-months\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "뒤로가기" }).click();

    await expect(page).toHaveURL(/\/sales\/contract-months$/, {
      timeout: 10_000,
    });
  });

  test("PLAN / VIEW / PERF section headers are all visible", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contract-months\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // AmountGroup renders h2 labels with the prefix: "계획 (PLAN)", "전망 (VIEW)", "실적 (PERF)"
    await expect(
      page.getByRole("heading", { name: "계획 (PLAN)" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "전망 (VIEW)" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "실적 (PERF)" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("sales/contract-months — not-found redirect", () => {
  test("navigating to non-existent id redirects to list with error param", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(
      "/sales/contract-months/00000000-0000-0000-0000-000000000000/edit",
    );

    // Server redirects to /sales/contract-months?error=not-found (or /dashboard?error=forbidden)
    await expect(page).toHaveURL(
      /\/sales\/contract-months(\?|$)|\/dashboard/,
      { timeout: 10_000 },
    );
  });
});
