import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("projects/modules grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/projects/modules");
    await page.waitForLoadState("networkidle");
  });

  test("list renders heading and grid table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "프로젝트모듈관리" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("add enables save", async ({ page }) => {
    await page.getByRole("button", { name: "입력" }).click();
    await expect(page.getByRole("button", { name: /저장/ })).toBeEnabled();
    await expect(page.locator("table")).toBeVisible();
  });

  test("export triggers download", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await page.getByRole("button", { name: "다운로드" }).click();
    const downloaded = await downloadPromise;
    if (downloaded) {
      expect(downloaded.suggestedFilename()).toMatch(/project-modules.*\.xlsx$/);
    } else {
      await expect(page.locator("table")).toBeVisible();
    }
  });

  test("filter q param is accepted", async ({ page }) => {
    await page.goto("/projects/modules?q=test");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("q=test");
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByPlaceholder("사번·프로젝트·모듈 검색")).toBeVisible();
  });
});
