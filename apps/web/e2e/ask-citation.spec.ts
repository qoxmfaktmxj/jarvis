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
  await page.getByLabel("질문").fill("평균임금이란?");
  await page.getByRole("button", { name: "질문하기" }).click();

  await expect(page.getByTestId("answer-text")).toContainText("평균임금");
  await expect(page.getByTestId("citation-locator")).toContainText("근로기준법 제2조");
  await expect(page.getByRole("link", { name: /평균임금/ })).toBeVisible();
  await expect(page.locator("[data-testid='answer-text'] script")).toHaveCount(0);
});
