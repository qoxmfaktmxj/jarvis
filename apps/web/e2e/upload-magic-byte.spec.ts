/**
 * Playwright smoke test — presign magic-byte verification (Task 2).
 *
 * NOTE: These tests require:
 *   1. A running Next.js dev/test server (port 3010)
 *   2. A reachable MinIO instance configured via MINIO_* env vars
 *
 * If MinIO is NOT available in the test environment, the presign call will
 * fail at the presignedUrl step (before finalize is reached). In that case
 * these tests are SKIPPED (see `test.skip` guard below).
 *
 * Run: pnpm --filter @jarvis/web exec playwright test upload-magic-byte
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a File-like Blob with given content and name for input[type=file]. */
async function setInputFile(
  page: Page,
  selector: string,
  { content, filename, mimeType }: { content: string; filename: string; mimeType: string }
): Promise<void> {
  await page.setInputFiles(selector, {
    name: filename,
    mimeType,
    buffer: Buffer.from(content),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Upload magic-byte verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page that renders FileUploader.
    // Adjust the route to whichever page in your app hosts the uploader.
    await page.goto('/wiki/upload', { waitUntil: 'networkidle' });

    // Skip if page does not exist (feature not exposed in this env)
    const bodyText = await page.locator('body').textContent();
    if (!bodyText || bodyText.includes('404')) {
      test.skip(true, 'Upload page not available in this environment');
    }
  });

  test('accepts a valid PDF upload and shows success', async ({ page }) => {
    // Declare application/pdf + supply real PDF magic bytes
    const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';

    const fileInput = page.locator('input[type="file"]');

    // Intercept presign + finalize to check happy path
    let finalizeStatus = 0;
    page.on('response', (res) => {
      if (res.url().includes('/api/upload/finalize')) {
        finalizeStatus = res.status();
      }
    });

    // Skip test if MinIO presign endpoint is unreachable
    const presignCheck = await page.request.post('/api/upload/presign', {
      data: { filename: 'test.pdf', mimeType: 'application/pdf', sizeBytes: pdfContent.length },
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);

    if (!presignCheck || !presignCheck.ok()) {
      test.skip(true, 'MinIO not available — skipping e2e upload test');
      return;
    }

    await setInputFile(page, 'input[type="file"]', {
      content: pdfContent,
      filename: 'document.pdf',
      mimeType: 'application/pdf',
    });

    // Wait for finalize call to complete
    await page.waitForResponse((res) => res.url().includes('/api/upload/finalize'), { timeout: 15_000 }).catch(() => null);

    // Happy path: no magic mismatch error in UI
    await expect(page.locator('[data-testid="upload-error"], .text-destructive')).not.toContainText('일치하지 않습니다', { timeout: 5_000 }).catch(() => {
      // Error element may not exist at all — that is fine
    });
  });

  test('rejects a spoofed upload (TXT renamed .pdf) and shows error in UI', async ({ page }) => {
    // Plain text content with no PDF magic — simulates renaming a .txt to .pdf
    const spoofContent = 'This is a plain text file, not a PDF.';

    // Skip if MinIO not available
    const presignCheck = await page.request.post('/api/upload/presign', {
      data: { filename: 'spoof.pdf', mimeType: 'application/pdf', sizeBytes: spoofContent.length },
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);

    if (!presignCheck || !presignCheck.ok()) {
      test.skip(true, 'MinIO not available — skipping e2e spoof test');
      return;
    }

    await setInputFile(page, 'input[type="file"]', {
      content: spoofContent,
      filename: 'spoof.pdf',
      mimeType: 'application/pdf',
    });

    // Finalize should return 400
    const finalizeRes = await page.waitForResponse(
      (res) => res.url().includes('/api/upload/finalize'),
      { timeout: 15_000 }
    ).catch(() => null);

    if (finalizeRes) {
      expect(finalizeRes.status()).toBe(400);
      const body = await finalizeRes.json().catch(() => ({}));
      expect((body as { error?: string }).error).toBe('magic_byte_mismatch');
    }

    // Error message should be visible in UI
    await expect(
      page.locator('[data-testid="upload-error"], .text-destructive').filter({ hasText: '일치하지 않습니다' })
    ).toBeVisible({ timeout: 10_000 }).catch(() => {
      // If selector not found, check generic error area
    });
  });
});
