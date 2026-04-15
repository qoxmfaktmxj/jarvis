import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Ask AI page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/ask");
  });

  test("loads the Ask AI page", async ({ page }) => {
    // The page <h1> renders the Ask.title translation ("AI 질문" in ko.json),
    // not the literal "Ask AI". Match the current heading instead.
    await expect(page.getByRole("heading", { name: "AI 질문" })).toBeVisible();
  });

  test("shows the input composer even without popular chips", async ({ page }) => {
    await expect(page.getByPlaceholder(/질문을 입력하세요/)).toBeVisible();
  });

  test("submits a question and shows a streaming response", async ({ page }) => {
    const input = page.getByPlaceholder(/질문을 입력하세요/);
    await input.fill("Jarvis 테스트 접속 방법은?");

    await page.locator('button[title="전송 (Ctrl+Enter)"]').click();

    await expect(input).toBeDisabled();
    await expect(page.locator(".prose")).toBeVisible({ timeout: 30_000 });

    const answerText = await page.locator(".prose").first().textContent();
    expect(answerText?.length).toBeGreaterThan(10);
    await expect(input).toBeEnabled({ timeout: 35_000 });
  });

  test("shows source references after streaming completes", async ({ page }) => {
    const sseBody = [
      'data: {"type":"text","content":"테스트 답변입니다."}\n\n',
      'data: {"type":"sources","sources":[{"kind":"text","pageId":"p1","title":"테스트 문서","url":"/wiki/test","confidence":0.9,"excerpt":"테스트"}]}\n\n',
      'data: {"type":"done","totalTokens":10}\n\n',
    ].join("");

    await page.route("/api/ask", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseBody,
      })
    );

    const input = page.getByPlaceholder(/질문을 입력하세요/);
    await input.fill("프로젝트 관리 방법을 알려주세요.");
    await input.press("Control+Enter");

    await expect(page.getByText("참고 문서")).toBeVisible({ timeout: 35_000 });
  });

  test("handles rate-limit errors gracefully", async ({ page }) => {
    await page.route("/api/ask", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Rate limit exceeded", retryAfter: 3600 }),
      })
    );

    await page.getByPlaceholder(/질문을 입력하세요/).fill("test");
    await page.locator('button[title="전송 (Ctrl+Enter)"]').click();

    await expect(page.getByText(/요청 한도를 초과/)).toBeVisible({ timeout: 5_000 });
  });

  test("reset button clears the current conversation", async ({ page }) => {
    const input = page.getByPlaceholder(/질문을 입력하세요/);
    await input.fill("테스트 질문");
    await page.locator('button[title="전송 (Ctrl+Enter)"]').click();

    await expect(page.locator(".prose")).toBeVisible({ timeout: 30_000 });
    await page.getByTitle("대화 초기화").click();
    await expect(page.locator(".prose")).not.toBeVisible();
  });
});
