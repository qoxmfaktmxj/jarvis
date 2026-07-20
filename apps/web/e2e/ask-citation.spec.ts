import { expect, test } from "@playwright/test";
import { loginAsReader } from "./helpers/auth";

test("ask route renders safe SSE answer and source locator", async ({ page }) => {
  await loginAsReader(page);
  await page.goto("/ask");
  await page.getByLabel("질문").fill("평균임금이란?");
  await page.getByRole("button", { name: "질문하기" }).click();

  await expect(page.getByTestId("answer-text")).toContainText("평균임금");
  await expect(page.getByTestId("citation-locator")).toContainText("근로기준법 제2조");
  await expect(page.getByRole("link", { name: /평균임금/ })).toBeVisible();
  await expect(page.locator("[data-testid='answer-text'] script")).toHaveCount(0);
});
