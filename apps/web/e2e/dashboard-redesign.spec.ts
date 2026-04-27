import { test, expect } from "@playwright/test";

test.describe("Dashboard redesign", () => {
  test("renders hero + 4 info cards + 3 right widgets", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/이메일/).fill("admin@jarvis.test");
    await page.getByLabel(/비밀번호/).fill("password");
    await page.getByRole("button", { name: /로그인|Sign in/i }).click();
    await page.waitForURL("**/dashboard");

    await expect(page.getByRole("heading", { name: /안녕하세요/ })).toBeVisible();
    await expect(page.locator('img[alt=""][src*="capybara"]')).toBeVisible();
    await expect(page.getByText(/오늘/)).toBeVisible();
    await expect(page.getByText(/현재 시각/)).toBeVisible();
    await expect(page.getByText(/서울/)).toBeVisible();
    await expect(page.getByText(/환율/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "전사 라운지" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "사내 공지" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "금주 휴가" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "최신 위키" })).toBeVisible();
  });
});
