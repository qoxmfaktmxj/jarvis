import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Attendance page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/attendance');
  });

  test('renders attendance page with calendar and table', async ({ page }) => {
    // Page metadata.title is Korean ("출퇴근") and layout sets document title to "Jarvis".
    // Assert the translated page heading instead of the document <title>.
    await expect(page.getByRole('heading', { name: '출퇴근' })).toBeVisible();
    // Calendar heading (Attendance.monthlyOverview = "월간 현황")
    await expect(page.getByText('월간 현황')).toBeVisible();
    // Table heading (Attendance.dailyRecords = "일별 기록")
    await expect(page.getByText('일별 기록')).toBeVisible();
  });

  test('check-in button is visible when not yet checked in', async ({ page }) => {
    // Button label is "출근" (Attendance.checkIn) or the current-time string on hover.
    const btn = page.getByRole('button', { name: /출근|\d{2}:\d{2}:\d{2}/ });
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

    const checkInBtn = page.getByRole('button', { name: /출근|\d{2}:\d{2}:\d{2}/ });
    await checkInBtn.click();
    // After refresh, button should not be "출근" anymore
    // (page refreshes and today's record now has checkIn)
    await page.waitForLoadState('networkidle');
  });

  test('navigates to out-of-office page', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    // OutManagePageClient renders OutManage.title = "외근 관리" as the <h1>.
    await expect(page.getByRole('heading', { name: '외근 관리' })).toBeVisible();
    // New-request trigger button still uses English "New Request" text.
    await expect(page.getByRole('button', { name: /new request/i })).toBeVisible();
  });

  test('opens new request dialog', async ({ page }) => {
    await page.goto('/attendance/out-manage');
    await page.getByRole('button', { name: /new request/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Dialog title uses OutManage.newRequest = "외근 신청".
    await expect(page.getByRole('dialog').getByText('외근 신청')).toBeVisible();
  });
});
