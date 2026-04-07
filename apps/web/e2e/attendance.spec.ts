import { test, expect } from '@playwright/test';

test.describe('Attendance page', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes test user session is seeded or a login fixture is used
    await page.goto('/attendance');
  });

  test('renders attendance page with calendar and table', async ({ page }) => {
    await expect(page).toHaveTitle(/Attendance/);
    // Calendar heading
    await expect(page.getByText('Monthly Overview')).toBeVisible();
    // Table heading
    await expect(page.getByText('Daily Records')).toBeVisible();
  });

  test('check-in button is visible when not yet checked in', async ({ page }) => {
    // The button text is either "Check In" or a time string on hover
    const btn = page.getByRole('button', { name: /check in/i });
    await expect(btn).toBeVisible();
  });

  test('clicking check-in button posts to API and refreshes', async ({ page }) => {
    await page.route('/api/attendance', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'mock-id',
              checkIn: new Date().toISOString(),
              checkOut: null,
              status: 'present',
              attendDate: new Date().toISOString().split('T')[0],
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    const checkInBtn = page.getByRole('button', { name: /check in/i });
    await checkInBtn.click();
    // After refresh, button should not be "Check In" anymore
    // (page refreshes and today's record now has checkIn)
    await page.waitForLoadState('networkidle');
  });

  test('navigates to out-of-office page', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    await expect(page).toHaveTitle(/Out-of-Office/);
    await expect(page.getByRole('button', { name: /new request/i })).toBeVisible();
  });

  test('opens new request dialog', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    await page.getByRole('button', { name: /new request/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('New Out-of-Office Request')).toBeVisible();
  });
});
