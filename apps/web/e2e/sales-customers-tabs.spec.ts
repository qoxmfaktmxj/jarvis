/**
 * e2e/sales-customers-tabs.spec.ts
 *
 * sales/customers tab count chips + MemoModal e2e tests (Task 9 / P2).
 *
 * Auth: session injection via helpers/auth.ts (no email/password UI).
 *   - loginAsAdmin   → ADMIN role, userId = TEST_ADMIN_ID (00...0012)
 *   - loginAsTestUser → VIEWER role, userId = TEST_USER_ID (00...0011)
 *
 * Chip labels rendered by CountChips in CustomersGridContainer.tsx:
 *   고객 {n}  기회 {n}  활동 {n}  의견 {n}   (the last is a <button>)
 *
 * MemoModal i18n keys (ko.json Sales.Customers.Memo):
 *   title          → "고객사 의견"
 *   createMaster   → "의견 등록"
 *   delete         → "삭제"
 *   memoPlaceholder → "의견을 입력하세요"
 *   close aria-label → "close"
 *
 * isOwn: determined server-side by comparing salesCustomerMemo.createdBy to
 *   ctx.userId (session.userId). Admin and VIEWER have different TEST_*_IDs,
 *   so the ownership boundary test is accurate.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsTestUser } from "./helpers/auth";

test.describe("sales/customers — tab counts + memo modal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customers");
    // wait for grid to render at least one row OR empty state
    await page.waitForSelector("table tbody tr, [data-testid='empty-state']", {
      timeout: 15_000,
    });
  });

  test("renders count chips on each row", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    const firstRow = page.locator("tbody tr").first();
    // plain <span> chips
    await expect(firstRow.locator("span", { hasText: /^고객 \d+$/ })).toBeVisible();
    await expect(firstRow.locator("span", { hasText: /^기회 \d+$/ })).toBeVisible();
    await expect(firstRow.locator("span", { hasText: /^활동 \d+$/ })).toBeVisible();
    // memo chip is a <button> so it stops row-click propagation
    await expect(
      firstRow.getByRole("button", { name: /^의견 \d+$/ }),
    ).toBeVisible();
  });

  test("clicking memo chip opens the MemoModal", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    const memoChip = page.getByRole("button", { name: /^의견 \d+$/ }).first();
    if ((await memoChip.count()) === 0) test.skip();

    await memoChip.click();
    // modal heading: "고객사 의견 — {customerName}"
    await expect(
      page.getByRole("heading", { name: /고객사 의견/ }),
    ).toBeVisible();

    // close via aria-label="close" button
    await page.getByRole("button", { name: "close" }).click();
    await expect(
      page.getByRole("heading", { name: /고객사 의견/ }),
    ).toBeHidden();
  });

  test("creates and deletes own master memo (round trip)", async ({ page }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    const memoChip = page.getByRole("button", { name: /^의견 \d+$/ }).first();
    if ((await memoChip.count()) === 0) test.skip();

    await memoChip.click();

    // open compose area for a new master memo
    await page.getByRole("button", { name: "의견 등록" }).first().click();

    const unique = `e2e-master-${Date.now()}`;
    await page.getByPlaceholder("의견을 입력하세요").first().fill(unique);

    // submit — the second "의견 등록" button is inside the compose form
    await page.getByRole("button", { name: "의견 등록" }).last().click();

    await expect(page.getByText(unique)).toBeVisible();

    // accept the native confirm dialog triggered by the delete action
    page.on("dialog", (d) => d.accept());

    const memoItem = page.locator("li", { hasText: unique });
    await memoItem.getByRole("button", { name: "삭제" }).click();

    await expect(page.getByText(unique)).toBeHidden();
  });

  test("non-owner sees memo content but no delete button", async ({
    page,
    browser,
  }) => {
    if ((await page.locator("tbody tr").count()) === 0) test.skip();

    const memoChip = page.getByRole("button", { name: /^의견 \d+$/ }).first();
    if ((await memoChip.count()) === 0) test.skip();

    // admin posts a memo
    await memoChip.click();
    await page.getByRole("button", { name: "의견 등록" }).first().click();
    const ownerOnly = `admin-only-${Date.now()}`;
    await page.getByPlaceholder("의견을 입력하세요").first().fill(ownerOnly);
    await page.getByRole("button", { name: "의견 등록" }).last().click();
    await expect(page.getByText(ownerOnly)).toBeVisible();
    // capture which row index was used (first row assumed consistent)
    await page.getByRole("button", { name: "close" }).click();

    // VIEWER opens the same customer's memo modal in a separate browser context
    // Uses loginAsTestUser (VIEWER role, different TEST_USER_ID → isOwn = false)
    const viewerCtx = await browser.newContext();
    try {
      const viewerPage = await viewerCtx.newPage();
      await loginAsTestUser(viewerPage);
      await viewerPage.goto("/sales/customers");
      await viewerPage.waitForSelector("table tbody tr", { timeout: 15_000 });

      await viewerPage.getByRole("button", { name: /^의견 \d+$/ }).first().click();

      const memoItemViewer = viewerPage.locator("li", { hasText: ownerOnly });
      await expect(memoItemViewer).toBeVisible();
      // viewer is not the owner — delete button must NOT appear
      await expect(
        memoItemViewer.getByRole("button", { name: "삭제" }),
      ).toHaveCount(0);
    } finally {
      await viewerCtx.close();
    }
  });
});
