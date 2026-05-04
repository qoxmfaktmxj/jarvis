/**
 * e2e/monthly-report.spec.ts
 *
 * Monthly Report page e2e tests.
 *
 * Task: Test left panel company list, right panel detail sections, and PDF export button visibility.
 * Prerequisite: Uses helpers/auth.ts loginAsAdmin for session injection.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Monthly Report", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/reports/monthly");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with title and two-panel layout", async ({ page }) => {
    // Page heading
    await expect(
      page.getByRole("heading", { name: /월간레포트|Monthly Report/ })
    ).toBeVisible();

    // Left panel (company list) and right panel (detail) both present
    // We can verify their structure is in place by checking for visible elements
    const panels = page.locator(".flex").filter({ has: page.locator(".w-72") });
    await expect(panels).toBeVisible();
  });

  test("placeholder shown when no company selected", async ({ page }) => {
    // Right panel should show placeholder text
    const placeholder = page.getByText(/좌측에서 회사를 선택|select.*company/i);
    await expect(placeholder).toBeVisible();
  });

  test("company selection reveals detail sections", async ({ page }) => {
    // Wait for company list to load (combobox or option list)
    const firstOption = page.locator('[role="option"]').first();
    await firstOption.waitFor({ state: "visible", timeout: 10_000 });

    // Click first company
    await firstOption.click();

    // Right panel should now show company header and sections
    // Wait for detail panel content to appear
    await page.waitForTimeout(500);

    // Check for section headings (발송 옵션, 월별 인원, 기타사항)
    const sections = page.locator("h2, h3").filter({
      hasText: /발송|인원|사항|Option|Month|Other/i,
    });
    await expect(sections).not.toHaveCount(0);
  });

  test("PDF export button accessible after company selection", async ({ page }) => {
    // Select first company
    const firstOption = page.locator('[role="option"]').first();
    await firstOption.waitFor({ state: "visible", timeout: 10_000 });
    await firstOption.click();

    // Wait for detail panel to render
    await page.waitForTimeout(500);

    // Find PDF export button (may be link or button)
    const pdfBtn = page.locator("a, button").filter({
      hasText: /PDF|출력|Download|Print/i,
    });
    await expect(pdfBtn).toBeVisible();
  });

  test.skip(
    "PDF export triggers download (skipped: Playwright PDF rendering requires heavy setup)",
    async ({ page }) => {
      // Select first company
      const firstOption = page.locator('[role="option"]').first();
      await firstOption.waitFor({ state: "visible", timeout: 10_000 });
      await firstOption.click();

      await page.waitForTimeout(500);

      // Capture download event
      const downloadPromise = page.waitForEvent("download");
      await page
        .locator("a, button")
        .filter({ hasText: /PDF|출력/ })
        .first()
        .click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    }
  );
});
