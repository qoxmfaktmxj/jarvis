import { test, expect } from "@playwright/test";

test.describe("Contractors tabs & leaves", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/이메일/).fill("admin@jarvis.test");
    await page.getByLabel(/비밀번호/).fill("password");
    await page.getByRole("button", { name: /로그인|Sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("tab order: 일정 first, 휴가관리 second", async ({ page }) => {
    await page.goto("/contractors");
    const tabs = page.getByRole("link").filter({ hasText: /일정|휴가관리/ });
    const first = await tabs.nth(0).textContent();
    const second = await tabs.nth(1).textContent();
    expect(first).toContain("일정");
    expect(second).toContain("휴가관리");
  });

  test("/contractors renders schedule calendar", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByText(/월|달력/).first()).toBeVisible();
  });

  test("/contractors/schedule still works", async ({ page }) => {
    await page.goto("/contractors/schedule");
    await expect(page).toHaveURL(/\/contractors\/schedule/);
  });

  test("/contractors/leaves renders search bar + master table", async ({
    page
  }) => {
    await page.goto("/contractors/leaves");
    await expect(page.getByText("기준일자")).toBeVisible();
    await expect(page.getByRole("button", { name: "조회" })).toBeVisible();
  });
});
