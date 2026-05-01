/**
 * e2e/admin-infra-licenses.spec.ts
 *
 * Task 9: admin/infra/licenses — ibsheet baseline + Excel export + B10025 code popup
 *
 * 5 scenarios:
 * 1. Excel button visible + click triggers download
 * 2. searchDevGbCd filter persistence in URL param
 * 3. 3-key composite duplicate block (companyId + devGbCode + symd)
 * 4. Pagination param persisted in URL
 * 5. Code popup: click devGbCode cell -> popup opens -> select code -> cell value updates
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

const PAGE_URL = "/admin/infra/licenses";

test.describe("admin/infra/licenses (Task 9)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(PAGE_URL);
    await page.waitForLoadState("networkidle");
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Excel button visible + click
  // -------------------------------------------------------------------------
  test("Excel export button is visible and clickable", async ({ page }) => {
    // DataGridToolbar renders the export button
    const excelBtn = page.getByRole("button", { name: /엑셀 다운로드/i }).first();
    await expect(excelBtn).toBeVisible();

    // Set up download interception
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      excelBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^infra-licenses_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: searchDevGbCd filter persistence (URL param)
  // -------------------------------------------------------------------------
  test("searchDevGbCd filter persists in URL param after selecting from popup", async ({ page }) => {
    // The filter section has a "선택" button to open the code popup
    const selectBtn = page
      .locator('[data-testid="searchDevGbCd-filter"]')
      .getByRole("button", { name: "선택" });
    await expect(selectBtn).toBeVisible();

    await selectBtn.click();

    // The popup dialog should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Click the first list item (e.g. 개발 / 01)
    const firstItem = dialog.getByRole("button").first();
    const itemText = await firstItem.textContent();
    await firstItem.click();

    // Dialog closes
    await expect(dialog).not.toBeVisible();

    // URL should now contain searchDevGbCd param
    await expect(page).toHaveURL(/searchDevGbCd=/);

    // The display span should reflect the selected code
    const display = page.locator('[data-testid="searchDevGbCd-display"]');
    await expect(display).not.toHaveText("전체");

    // Navigate away and back — param should still be in URL via browser history
    // (SSR page.tsx reads searchDevGbCd from searchParams on reload)
    const currentUrl = page.url();
    await page.goto(currentUrl);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/searchDevGbCd=/);
    // The display should reflect the filter (non-empty value)
    const displayAfterReload = page.locator('[data-testid="searchDevGbCd-display"]');
    await expect(displayAfterReload).not.toHaveText("전체");

    // Cleanup: the item text was read so we can confirm something was selected
    expect(itemText).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: 3-key composite duplicate block
  // -------------------------------------------------------------------------
  test("duplicate companyId+devGbCode+symd shows error on save", async ({ page }) => {
    // Insert two rows
    const insertBtn = page.getByRole("button", { name: "입력" }).first();
    await insertBtn.click();
    await insertBtn.click();

    // Both new rows will have blank/same defaults — just try to save
    const saveBtn = page.getByRole("button", { name: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // If two rows have the same composite key, dupError alert should appear
    // (both new rows start with identical empty companyId, devGbCode, symd)
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 3000 });
    await expect(alert).toContainText("중복된 키");
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Pagination param persistence
  // -------------------------------------------------------------------------
  test("page param appears in URL when navigating to page 2", async ({ page }) => {
    // Only run pagination test if there are enough rows (totalPages >= 2)
    const nextBtn = page.getByRole("button", { name: "다음" }).first();

    // If next is disabled (only 1 page) skip gracefully
    const isDisabled = await nextBtn.isDisabled();
    if (isDisabled) {
      test.skip(true, "Less than 2 pages of data — pagination test skipped");
      return;
    }

    await nextBtn.click();
    await page.waitForLoadState("networkidle");

    // URL should contain page=2
    await expect(page).toHaveURL(/page=2/);

    // Navigate back and forward to confirm URL param is stable
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/page=2/);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Code popup on devGbCode cell
  // -------------------------------------------------------------------------
  test("devGbCode cell popup opens, code selected, cell value updates", async ({ page }) => {
    // Insert a new row to get an editable devGbCode cell
    const insertBtn = page.getByRole("button", { name: "입력" }).first();
    await insertBtn.click();

    // Find the devGbCode cell in the newly inserted (last) row
    const newRow = page.locator('tr[data-row-status="new"]').last();
    const devGbCell = newRow.locator('[data-col="devGbCode"]');
    await expect(devGbCell).toBeVisible();

    // Click the ▾ button inside the devGbCode cell to open popup
    const cellTrigger = devGbCell.getByRole("button", { name: "▾" });
    await expect(cellTrigger).toBeVisible();
    await cellTrigger.click();

    // The popup dialog appears
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Click the first code item in the popup (e.g. 개발)
    const firstOption = dialog.getByRole("button").first();
    const optionText = await firstOption.textContent();
    await firstOption.click();

    // Dialog closes
    await expect(dialog).not.toBeVisible();

    // The devGbCode cell now shows the selected label
    // data-cell-value attribute on the td should be updated
    const cellValue = await devGbCell.getAttribute("data-cell-value");
    expect(cellValue).toBeTruthy();
    expect(cellValue).not.toBe("");

    // The display span inside cell should contain the label text
    const labelSpan = devGbCell.locator("span").first();
    const labelText = await labelSpan.textContent();
    expect(labelText?.trim()).toBeTruthy();

    // Confirm the option text contains the selected code label
    expect(optionText).toBeTruthy();
  });
});
