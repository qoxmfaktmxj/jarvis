import { expect, test } from "@playwright/test";

test("empty login form creates and removes a secure demo session", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByLabel("이메일")).toHaveValue("");
  await expect(page.getByLabel("비밀번호")).toHaveValue("");
  await page.getByRole("button", { name: "데모로 시작" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "HR 컴플라이언스 대시보드" })).toBeVisible();

  const cookie = (await context.cookies()).find(({ name }) => name === "jarvis_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.value).toMatch(/^[a-f0-9]{64}$/);

  await page.goto("/profile");
  await expect(page.getByText("데모 계정은 비밀번호를 사용하지 않습니다.")).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect
    .poll(async () => (await context.cookies()).some(({ name }) => name === "jarvis_session"))
    .toBe(false);
});
