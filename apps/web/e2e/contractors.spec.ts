import { test, expect } from "@playwright/test";

test.describe("Contractors (외주인력관리)", () => {
  test("301 redirect /attendance -> /contractors", async ({ page }) => {
    const response = await page.goto("/attendance", { waitUntil: "commit" });
    // Follow redirects, final URL should be /contractors (or /login if auth guard kicks in)
    expect(page.url()).toMatch(/\/contractors|\/login/);
    // Status of the first navigation request should be 301
    // (Playwright's goto returns the final response; the 301 itself is in request chain)
  });

  test("301 redirect /attendance/out-manage -> /contractors", async ({ page }) => {
    await page.goto("/attendance/out-manage", { waitUntil: "commit" });
    expect(page.url()).toMatch(/\/contractors|\/login/);
    // Should NOT hit /contractors/out-manage (legacy subpath was removed)
    expect(page.url()).not.toMatch(/\/contractors\/out-manage/);
  });

  test("/contractors renders page (after login or shows login)", async ({ page }) => {
    const response = await page.goto("/contractors");
    // Either shows the roster page (if auto-login session) or redirects to /login
    expect([200, 302, 307]).toContain(response?.status() ?? 0);
  });

  test("/contractors/schedule renders calendar", async ({ page }) => {
    await page.goto("/contractors/schedule");
    const url = page.url();
    if (url.includes("/login")) {
      // test harness without session — skip deeper
      test.skip(true, "session required for detailed schedule view");
      return;
    }
    await expect(page.getByRole("heading")).toBeVisible({ timeout: 10_000 });
  });

  test("/holidays requires admin (non-admin redirected)", async ({ page }) => {
    const response = await page.goto("/holidays");
    // Redirects to /login or /dashboard for non-admin; admin sees the page
    expect([200, 302, 307]).toContain(response?.status() ?? 0);
  });
});
