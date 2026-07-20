import type { Page } from "@playwright/test";

async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
}

export async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "", process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "");
}

export async function loginAsEditor(page: Page) {
  await loginWithCredentials(page, process.env.PLAYWRIGHT_EDITOR_EMAIL ?? "", process.env.PLAYWRIGHT_EDITOR_PASSWORD ?? "");
}

export async function loginAsTarget(page: Page) {
  await loginWithCredentials(
    page,
    process.env.PLAYWRIGHT_TARGET_EMAIL ?? "",
    process.env.PLAYWRIGHT_TARGET_PASSWORD ?? "",
  );
}

export async function loginAsReader(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "데모로 시작" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
}
