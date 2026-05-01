/**
 * e2e/sales-customers.spec.ts
 *
 * sales/customers 그리드 smoke test (Task 9 / P1.5 → P2-A Task 5).
 * 레거시 ibSheet bizActCustCompanyMgr.jsp:221~233 Hidden:0 정책 검증:
 *  - custCd / businessNo / businessKind / homepage / addr1 PK 또는 부가 컬럼은 보이지 않아야 함
 *  - custNm / custKindCd / custDivCd / ceoNm / telNo / 등록일자 보임
 *
 * P2-A 추가 (Task 5):
 *  - Excel export button visibility
 *  - chargerNm 검색 지속성 (URL param)
 *  - searchYmd 날짜 range 입력
 *  - pagination URL param
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/customers grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customers");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert/save buttons", async ({ page }) => {
    const toolbar = page.locator("button", { hasText: "입력" }).first();
    await expect(toolbar).toBeVisible();
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });

  test("Hidden:0 columns visible (고객명 / 고객종류 / 고객구분 / 대표자 / 전화번호 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("고객명");
    await expect(header).toContainText("고객종류");
    await expect(header).toContainText("고객구분");
    await expect(header).toContainText("대표자");
    await expect(header).toContainText("전화번호");
    await expect(header).toContainText("등록일자");
  });

  test("Hidden:1 columns not rendered (고객코드 / 사업자번호 / 업종 / 홈페이지 / 주소)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).not.toContainText("고객코드");
    await expect(header).not.toContainText("사업자번호");
    await expect(header).not.toContainText("업종");
    await expect(header).not.toContainText("홈페이지");
    await expect(header).not.toContainText("주소");
  });

  test("filter input exists for custNm", async ({ page }) => {
    const custNmInput = page.locator('input[placeholder*="고객명"]').first();
    await expect(custNmInput).toBeVisible();
  });

  // ── P2-A Task 5 additions ──────────────────────────────────────────────────

  test("Excel export button is visible", async ({ page }) => {
    const exportBtn = page.locator("button", { hasText: "엑셀 다운로드" });
    await expect(exportBtn).toBeVisible();
  });

  test("chargerNm search input is present", async ({ page }) => {
    const input = page.locator('input[placeholder="담당자명"]');
    await expect(input).toBeVisible();
  });

  test("searchYmdFrom date input is present", async ({ page }) => {
    // Date range: two date inputs rendered inside the toolbar
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs.first()).toBeVisible();
  });

  test("chargerNm value persists in URL after Enter", async ({ page }) => {
    const input = page.locator('input[placeholder="담당자명"]');
    await input.fill("홍길동");
    await input.press("Enter");
    await page.waitForLoadState("networkidle");
    // URL must encode chargerNm parameter
    expect(page.url()).toMatch(/chargerNm=/);
  });

  test("URL filter params are pre-filled on direct navigation", async ({ page }) => {
    await page.goto("/sales/customers?chargerNm=%ED%99%8D%EA%B8%B8%EB%8F%99");
    await page.waitForLoadState("networkidle");
    const input = page.locator('input[placeholder="담당자명"]');
    await expect(input).toHaveValue("홍길동");
  });

  test("pagination control changes page param in URL", async ({ page }) => {
    // Navigate with a forced page to verify parameter round-trip
    await page.goto("/sales/customers?page=1");
    await page.waitForLoadState("networkidle");
    // If next-page button is visible (enough data rows), click it
    const nextBtn = page.locator("button[aria-label='다음 페이지'], button:has-text('다음')").first();
    const isVisible = await nextBtn.isVisible().catch(() => false);
    if (!isVisible) {
      // Not enough rows for pagination — verify page=1 param present
      expect(page.url()).toContain("page=1");
      return;
    }
    await nextBtn.click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("page=2");
  });
});
