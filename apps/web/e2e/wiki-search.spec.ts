import { expect, test } from "@playwright/test";
import { loginAsReader } from "./helpers/auth";

test("demo reader can browse projected wiki/search pages but cannot edit manual pages", async ({ page }) => {
  await loginAsReader(page);

  await page.goto("/wiki");
  await expect(page.getByRole("link", { name: /평균임금/ })).toBeVisible();
  await expect(page.getByText("_system")).toHaveCount(0);
  await expect(page.getByText("_archive")).toHaveCount(0);
  await expect(page.getByText(/^index\.md$/)).toHaveCount(0);
  await expect(page.getByText(/^log\.md$/)).toHaveCount(0);

  await page.goto("/search?q=평균임금");
  await expect(page.getByRole("link", { name: /평균임금/ })).toBeVisible();
  await expect(page.getByText("_system")).toHaveCount(0);

  await page.goto("/wiki/manual/edit/manual/guides/annual-leave");
  await expect(page).toHaveURL(/\/forbidden$/);
});
