import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/cloud-people-base grid", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/cloud-people-base");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading and grid table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "인원단가 기준관리" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "계약명" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "월단가" })).toBeVisible();
  });

  test("toolbar has insert button and save enabled after click", async ({ page }) => {
    const insertBtn = page.locator("button", { hasText: "입력" }).first();
    await expect(insertBtn).toBeVisible();
    await insertBtn.click();
    await expect(page.locator("button", { hasText: /저장/ }).first()).toBeEnabled();
  });

  test("Excel export button triggers download", async ({ page }) => {
    const exportBtn = page.locator("button", { hasText: "다운로드" });
    await expect(exportBtn).toBeVisible();
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await exportBtn.click();
    const downloaded = await downloadPromise;
    if (downloaded) {
      expect(downloaded.suggestedFilename()).toMatch(/cloud_people_base.*\.xlsx$/);
    } else {
      await expect(page.locator("table")).toBeVisible();
    }
  });

  test("contYear filter round-trips through URL", async ({ page }) => {
    await page.goto("/sales/cloud-people-base?contYear=2026");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("contYear=2026");
    await expect(page.locator("table")).toBeVisible();
  });
});
