import { expect, test } from "@playwright/test";
import { loginAsReader } from "./helpers/auth";

test("Ask UI renders safe SSE answer and source locator", async ({ page }) => {
  await loginAsReader(page);
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "X-Conversation-Id": "11111111-1111-4111-8111-111111111111" },
      body: [
        'event: text\ndata: {"type":"text","text":"평균임금은 산정 기준 임금입니다. [[average-wage]]"}\n',
        'event: source\ndata: {"type":"source","source":{"kind":"wiki","label":"average-wage","title":"평균임금","wikiPath":"auto/concepts/average-wage.md"}}\n',
        'event: source\ndata: {"type":"source","source":{"kind":"source","label":"합성 원문","locator":"근로기준법 제2조"}}\n',
        'event: done\ndata: {"type":"done"}\n',
      ].join("\n"),
    });
  });
  await page.goto("/ask");
  const question = page.getByLabel("질문", { exact: true });
  await question.fill("평균임금이란?");
  await question.press("Enter");

  await expect(page.getByTestId("answer-text")).toContainText("평균임금");
  await expect(page.getByTestId("citation-locator")).toContainText("근로기준법 제2조");
  await expect(page.getByRole("link", { name: /평균임금/ })).toBeVisible();
  await expect(page.locator("[data-testid='answer-text'] script")).toHaveCount(0);
});

test("Ask composer keeps Shift+Enter as a newline", async ({ page }) => {
  await loginAsReader(page);
  let requestCount = 0;
  await page.route("**/api/ask", async (route) => {
    requestCount += 1;
    await route.abort();
  });

  await page.goto("/ask");
  const question = page.getByLabel("질문", { exact: true });
  await question.fill("첫 번째 줄");
  await question.press("Shift+Enter");
  await question.type("두 번째 줄");

  await expect(question).toHaveValue("첫 번째 줄\n두 번째 줄");
  expect(requestCount).toBe(0);
});

test("Ask timeline clears the composer and keeps the user turn before the answer", async ({ page }) => {
  await loginAsReader(page);
  await page.route("**/api/ask", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: [
        'event: abstain\ndata: {"type":"abstain","reason":"근거를 확인할 수 없어 답변을 보류합니다."}\n',
        'event: done\ndata: {"type":"done"}\n',
      ].join("\n"),
    });
  });

  await page.goto("/ask");
  const composer = page.getByLabel("질문", { exact: true });
  await composer.fill("HR 관련 질문 뭐할까?");
  await composer.press("Enter");

  await expect(composer).toHaveValue("");
  const roles = await page
    .getByTestId("ask-timeline")
    .locator("[data-message-role]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-message-role")));
  expect(roles).toEqual(["user", "assistant"]);
});
