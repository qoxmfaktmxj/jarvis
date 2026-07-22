import { expect, test } from "@playwright/test";
import { loginAsReader } from "./helpers/auth";

test("conversation ownership is isolated by workspaceId and userId", async ({ browser }) => {
  const owner = await browser.newContext();
  const intruder = await browser.newContext();
  const ownerPage = await owner.newPage();
  const intruderPage = await intruder.newPage();

  await loginAsReader(ownerPage);
  await ownerPage.goto("/ask");
  const question = ownerPage.getByLabel("질문", { exact: true });
  await question.fill("연차휴가 사용촉진은?");
  await question.press("Enter");
  await expect(ownerPage).toHaveURL(/\/ask\/[0-9a-f-]{36}$/);
  const conversationId = ownerPage.url().split("/").at(-1);

  await loginAsReader(intruderPage);
  await intruderPage.goto(`/ask/${conversationId}`);
  await expect(intruderPage.getByText("대화를 찾을 수 없습니다.")).toBeVisible();
  await expect(intruderPage.getByRole("button", { name: "대화 메뉴" })).toHaveCount(0);

  const response = await intruderPage.request.post("/api/ask", {
    data: { conversationId, question: "침해 시도" },
  });
  expect(response.status()).toBe(404);
});
