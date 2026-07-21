import { expect, test } from "@playwright/test";

test("global grid background alternates on reload", async ({ page }) => {
  await page.goto("/login");
  const canvas = page.getByTestId("grid-background");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", /^(blinking|kinetic)$/);
  const first = await canvas.getAttribute("data-mode");

  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", /^(blinking|kinetic)$/);
  const second = await canvas.getAttribute("data-mode");

  expect(first).toMatch(/^(blinking|kinetic)$/);
  expect(second).toMatch(/^(blinking|kinetic)$/);
  expect(second).not.toBe(first);
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  await expect(canvas).toHaveCSS("pointer-events", "none");
});
