/**
 * apps/web/e2e/holidays-grid.spec.ts  (Task 15)
 *
 * Holidays admin grid smoke test:
 *  1. Admin can add a holiday via inline DatePicker
 *     - typing 8 digits ("20260505") auto-formats to "2026-05-05" via MaskedDateInput sanitize()
 *  2. Calendar popup shows weekend headers in correct colors (일=text-red-500, 토=text-notion-blue-text)
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Holidays admin grid", () => {
  test("admin can add a holiday via inline DatePicker (masked input auto-formats)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/holidays");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "공휴일 관리" })).toBeVisible();

    // Click the [입력] toolbar button to insert a blank row
    await page.locator("button", { hasText: "입력" }).first().click();

    // The new row gets data-row-status="new". Scope to it.
    const newRow = page.locator("tr[data-row-status='new']").first();
    await expect(newRow).toBeVisible();

    // The date cell renders a MaskedDateInput with placeholder="yyyy-mm-dd"
    const dateInput = newRow.locator('input[placeholder="yyyy-mm-dd"]').first();
    await dateInput.click();

    // Type 8 digits — sanitize() auto-inserts hyphens on each keystroke
    await dateInput.type("20260505");

    // After typing, the draft (input value) should show "2026-05-05"
    await expect(dateInput).toHaveValue("2026-05-05");

    // Commit the date by pressing Enter (triggers blur → onCommit)
    await dateInput.press("Enter");

    // Click the name cell button to enter edit mode (EditableTextCell: button → input)
    const nameCellButton = newRow
      .locator("td")
      .nth(2) // No + delete + date = 3rd td (0-indexed); name is 4th column overall
      .locator("button")
      .first();
    await nameCellButton.click();

    // Now an input should appear in the name cell
    const nameInput = newRow.locator("td").nth(2).locator("input").first();
    await nameInput.fill("어린이날");
    await nameInput.press("Enter");

    // Click 저장
    await page.locator("button", { hasText: /저장/ }).first().click();

    // After save, the grid should show the holiday name
    await expect(page.getByText("어린이날")).toBeVisible({ timeout: 10_000 });
  });

  test("calendar popup shows weekend headers in red/blue colors", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/holidays");
    await page.waitForLoadState("networkidle");

    // Open the calendar popup via the "달력 열기" button in the first DatePicker row.
    // If no rows exist yet, click [입력] first to get a date cell, then open calendar.
    const hasRows = await page.locator("tr[data-row-status]").count();
    if (hasRows === 0) {
      await page.locator("button", { hasText: "입력" }).first().click();
      await expect(page.locator("tr[data-row-status='new']").first()).toBeVisible();
    }

    const calendarToggle = page
      .getByRole("button", { name: "달력 열기" })
      .first();
    await calendarToggle.click();

    // The calendar popup renders a weekday header row and a role="grid" day grid
    const calendarGrid = page.getByRole("grid");
    await expect(calendarGrid).toBeVisible();

    // Weekday headers are div elements in a 7-column grid above the date grid.
    // 일 (Sunday, index 0) → text-red-500
    // 토 (Saturday, index 6) → text-notion-blue-text
    // CalendarPopup renders: <div className={cn("py-1", i === 0 && "text-red-500", i === 6 && "text-notion-blue-text")}>{w}</div>
    const sundayHeader = page
      .locator("div.text-red-500", { hasText: /^일$/ })
      .first();
    await expect(sundayHeader).toBeVisible();
    await expect(sundayHeader).toHaveClass(/text-red-500/);

    const saturdayHeader = page
      .locator("div.text-notion-blue-text", { hasText: /^토$/ })
      .first();
    await expect(saturdayHeader).toBeVisible();
    await expect(saturdayHeader).toHaveClass(/text-notion-blue-text/);
  });
});
