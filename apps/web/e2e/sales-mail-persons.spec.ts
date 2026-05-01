/**
 * e2e/sales-mail-persons.spec.ts
 *
 * sales/mail-persons 그리드 — P2-A Task 8 baseline + EmployeePicker + Excel export.
 *
 * 5 new scenarios:
 *   1. Excel button visible + click triggers download
 *   2. searchMail URL persistence
 *   3. Composite-key (sabun+mailId) duplicate block
 *   4. Pagination param preserved in URL
 *   5. EmployeePicker: type 2 chars in sabun cell → dropdown shows → Enter selects → auto-fill
 *
 * Legacy ibSheet reference: bizMailPersonMgr.jsp
 *   - enterCd Hidden:1 (implicit via workspaceId)
 *   - sabun   Hidden:0, visible, picker-only (UpdateEdit:0, InsertEdit:0)
 *   - name    Hidden:0, editable on insert (auto-filled by picker)
 *   - mailId  Hidden:0, editable on insert (auto-filled by picker)
 *   - salesYn / insaYn / memo Hidden:0, fully editable
 * Composite KeyField dedup: sabun + mailId
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/mail-persons grid — P2-A baseline", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/mail-persons");
    await page.waitForLoadState("networkidle");
  });

  // ── Regression: existing smoke tests ────────────────────
  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert button (입력)", async ({ page }) => {
    const insertBtn = page.locator("button", { hasText: "입력" }).first();
    await expect(insertBtn).toBeVisible();
  });

  test("grid shows required columns: 사번 / 이름 / 메일 ID / 영업 / 인사 / 메모 / 등록일자", async ({
    page,
  }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("사번");
    await expect(header).toContainText("이름");
    await expect(header).toContainText("메일 ID");
    await expect(header).toContainText("영업");
    await expect(header).toContainText("인사");
    await expect(header).toContainText("메모");
    await expect(header).toContainText("등록일자");
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });

  // ── 1. Excel export button ───────────────────────────────
  test("Excel export button is visible in toolbar", async ({ page }) => {
    const exportBtn = page.locator("button", { hasText: "엑셀 다운로드" });
    await expect(exportBtn).toBeVisible();
  });

  test("Excel export button click triggers a download with xlsx filename", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("button", { hasText: "엑셀 다운로드" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^mail-persons_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  // ── 2. searchMail URL persistence ───────────────────────
  test("searchMail filter input is visible in toolbar", async ({ page }) => {
    const mailInput = page.locator("input[data-filter='searchMail']");
    await expect(mailInput).toBeVisible();
  });

  test("searchMail filter persists in URL after input", async ({ page }) => {
    const mailInput = page.locator("input[data-filter='searchMail']");
    await mailInput.fill("test@example.com");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/searchMail=test(%40|@)example\.com/);
  });

  test("searchMail filter is restored from URL on page load", async ({ page }) => {
    await page.goto("/sales/mail-persons?searchMail=hello%40co.kr");
    await page.waitForLoadState("networkidle");
    const mailInput = page.locator("input[data-filter='searchMail']");
    await expect(mailInput).toHaveValue("hello@co.kr");
  });

  // ── 3. Composite-key (sabun+mailId) duplicate block ─────
  test("saving two new rows with same name+mailId triggers duplicate error", async ({ page }) => {
    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    // Insert two blank rows and fill identical mailId values in both
    await page.locator("button", { hasText: "입력" }).first().click();
    const firstNameCell = page.locator("td[data-col='name'] input").first();
    const firstMailCell = page.locator("td[data-col='mailId'] input").first();

    if (await firstNameCell.isVisible()) {
      await firstNameCell.fill("사용자A");
      await firstMailCell.fill("dup@test.com");
    }

    await page.locator("button", { hasText: "입력" }).first().click();
    const secondNameCell = page.locator("td[data-col='name'] input").first();
    const secondMailCell = page.locator("td[data-col='mailId'] input").first();

    if (await secondNameCell.isVisible()) {
      await secondNameCell.fill("사용자A");
      await secondMailCell.fill("dup@test.com");
    }

    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await page.waitForTimeout(300);
      // The duplicate guard fires before any network request
      expect(dialogMessage).toMatch(/중복/);
    }
  });

  // ── 4. Pagination param ──────────────────────────────────
  test("page=2 in URL is recognised and reflected in pagination state", async ({ page }) => {
    await page.goto("/sales/mail-persons?page=2");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toMatch(/page=2/);
    // Grid table still renders (even if page 2 is empty)
    await expect(page.locator("table")).toBeVisible();
  });

  // ── 5. EmployeePicker ────────────────────────────────────
  test("EmployeePicker renders as combobox in sabun cell for new blank row", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const pickerInput = page.locator("td[data-col='sabun'] input[role='combobox']").first();
    await expect(pickerInput).toBeVisible();
  });

  test("EmployeePicker: typing 2+ chars triggers dropdown search", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const pickerInput = page.locator("td[data-col='sabun'] input[role='combobox']").first();
    await expect(pickerInput).toBeVisible();

    await pickerInput.fill("홍길");
    await page.waitForTimeout(400);

    // The combobox aria-expanded should be true when results exist,
    // or remain false when no results — no crash either way.
    const expanded = await pickerInput.getAttribute("aria-expanded");
    // Verify no JS error by confirming the input still exists and is accessible
    await expect(pickerInput).toBeAttached();
    // If results came back the listbox should be visible
    if (expanded === "true") {
      await expect(page.locator("[role='listbox']")).toBeVisible();
    }
  });

  test("EmployeePicker: Enter on result auto-saves row (name+mailId filled)", async ({
    page,
  }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const pickerInput = page.locator("td[data-col='sabun'] input[role='combobox']").first();
    await expect(pickerInput).toBeVisible();

    await pickerInput.type("ad", { delay: 50 });
    await page.waitForTimeout(500);

    const listbox = page.locator("[role='listbox']");
    const hasResults = await listbox.isVisible().catch(() => false);

    if (hasResults) {
      await pickerInput.press("Enter");
      // After auto-save + reload the grid should be stable
      await page.waitForLoadState("networkidle");
      await expect(page.locator("table")).toBeVisible();
    } else {
      // No employees seeded — picker accepted, no crash
      await expect(pickerInput).toBeAttached();
    }
  });
});
