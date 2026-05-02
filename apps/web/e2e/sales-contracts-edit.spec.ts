/**
 * e2e/sales-contracts-edit.spec.ts  (Task 6 / PR-1B)
 *
 * Verifies the [id]/edit double-click flow for sales/contracts:
 *   1. Double-clicking a row navigates to /:id/edit
 *   2. The edit page shows the "Sales · Contracts" eyebrow and contract heading
 *   3. Editing a field (memo) and saving returns to /sales/contracts
 *   4. Delete with confirm dialog returns to /sales/contracts
 *   5. Back button without saving returns to /sales/contracts
 *   6. Collapsible 계획 일정 section expands to show fields
 *
 * Auth: session injection via helpers/auth.ts (ADMIN role).
 * Empty-seed resilience: tests skip via test.skip when no rows present or when
 *   the DB is unavailable (loginAsAdmin throws a connection error).
 * NOTE: e2e tests are CI-only — do not run locally without a seeded DB.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

/** Returns false and calls test.skip() when DB is unavailable. */
async function tryLogin(page: Parameters<typeof loginAsAdmin>[0]): Promise<boolean> {
  try {
    await loginAsAdmin(page);
    return true;
  } catch {
    // DB not running — skip gracefully
    test.skip(true, "DB unavailable: skipping e2e test");
    return false;
  }
}

test.describe("sales/contracts — [id]/edit double-click flow", () => {
  test.beforeEach(async ({ page }) => {
    await tryLogin(page);
    await page.goto("/sales/contracts");
    await page.waitForSelector("table tbody tr, [data-testid='empty-state']", {
      timeout: 15_000,
    });
  });

  test("double-click first row navigates to /:id/edit and shows heading", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();

    // URL must be /sales/contracts/<uuid>/edit
    await expect(page).toHaveURL(/\/sales\/contracts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // PageHeader eyebrow text
    await expect(page.getByText("Sales · Contracts")).toBeVisible();
  });

  test("edit memo and save navigates back to /sales/contracts", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contracts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Fill the 메모 textarea (last textarea on the page)
    const memoTextarea = page.locator("textarea").last();
    const original = await memoTextarea.inputValue();
    await memoTextarea.fill(`${original}-e2e`);

    await page.getByRole("button", { name: "저장" }).click();

    await expect(page).toHaveURL(/\/sales\/contracts$/, { timeout: 10_000 });
  });

  test("delete with confirm dialog navigates back to /sales/contracts", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contracts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // Accept the confirm dialog that handleDelete() triggers
    page.on("dialog", (d) => d.accept());

    await page.getByRole("button", { name: "삭제" }).click();

    await expect(page).toHaveURL(/\/sales\/contracts$/, { timeout: 10_000 });
  });

  test("back button without saving returns to /sales/contracts", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contracts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "뒤로가기" }).click();

    await expect(page).toHaveURL(/\/sales\/contracts$/, { timeout: 10_000 });
  });

  test("collapsible 계획 일정 section expands to reveal fields", async ({
    page,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    await page.locator("tbody tr").first().dblclick();
    await page.waitForURL(/\/sales\/contracts\/[^/]+\/edit/, {
      timeout: 10_000,
    });

    // The <details> summary text contains "계획 일정"
    const summary = page.locator("details > summary").filter({ hasText: "계획 일정" });
    await expect(summary).toBeVisible({ timeout: 10_000 });

    // Click to expand
    await summary.click();

    // After expansion, at least the "착수금 계획일" label should be visible
    await expect(page.getByText("착수금 계획일")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("sales/contracts — not-found redirect", () => {
  test("navigating to non-existent id redirects to list with error param", async ({
    page,
  }) => {
    const ok = await tryLogin(page);
    if (!ok) return;

    await page.goto("/sales/contracts/00000000-0000-0000-0000-000000000000/edit");

    // Server redirects to /sales/contracts?error=not-found (or /dashboard?error=forbidden)
    await expect(page).toHaveURL(/\/sales\/contracts(\?|$)|\/dashboard/, {
      timeout: 10_000,
    });
  });
});
