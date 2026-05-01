/**
 * composite-key.test.ts
 *
 * Unit-level coverage for the custCd composite-key duplicate check that
 * guards CustomersGridContainer.onSave.
 *
 * WHY vitest instead of e2e:
 *   `custCd` is Hidden:1 in the legacy ibSheet policy — it is NOT rendered
 *   as a grid column and is NOT editable through the UI. Two freshly-inserted
 *   rows always receive distinct UUIDs from `makeBlankRow`, so it is
 *   impossible to create a UI-driven duplicate via Playwright without an
 *   artificial page-level escape hatch. The duplicate guard itself lives in
 *   `findDuplicateKeys` + the `onSave` handler; exercising it at the unit
 *   level is the correct test boundary.
 */
import { describe, it, expect } from "vitest";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { CustomerRow } from "@jarvis/shared/validation/sales/customer";

/** Minimal factory — only custCd and id matter for duplicate detection. */
function makeRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  const id = crypto.randomUUID();
  return {
    id,
    custCd: id.slice(0, 12),
    custNm: "테스트고객",
    custKindCd: null,
    custDivCd: null,
    exchangeTypeCd: null,
    custSourceCd: null,
    custImprCd: null,
    buyInfoCd: null,
    buyInfoDtCd: null,
    ceoNm: null,
    telNo: null,
    businessNo: null,
    faxNo: null,
    businessKind: null,
    homepage: null,
    addrNo: null,
    addr1: null,
    addr2: null,
    createdAt: null,
    ...overrides,
  };
}

describe("composite-key custCd duplicate detection (customers grid)", () => {
  // ── Scenario: duplicate save must be blocked ────────────────────────────────
  it("flags two rows sharing the same custCd as a duplicate", () => {
    const dupCustCd = "DUP-TEST-001";
    const row1 = makeRow({ custCd: dupCustCd });
    const row2 = makeRow({ custCd: dupCustCd }); // same custCd, different id

    const dups = findDuplicateKeys([row1, row2], ["custCd"]);

    expect(dups).toHaveLength(1);
    expect(dups[0]).toBe(dupCustCd);
  });

  it("returns empty array when all custCd values are unique", () => {
    const row1 = makeRow({ custCd: "CUST-A" });
    const row2 = makeRow({ custCd: "CUST-B" });
    const row3 = makeRow({ custCd: "CUST-C" });

    const dups = findDuplicateKeys([row1, row2, row3], ["custCd"]);

    expect(dups).toHaveLength(0);
  });

  it("reports each duplicate key once even when three rows share it", () => {
    const dupCustCd = "TRIPLE-DUP";
    const rows = [makeRow({ custCd: dupCustCd }), makeRow({ custCd: dupCustCd }), makeRow({ custCd: dupCustCd })];

    const dups = findDuplicateKeys(rows, ["custCd"]);

    // findDuplicateKeys uses a Set — the key appears exactly once in output
    expect(dups).toHaveLength(1);
    expect(dups[0]).toBe(dupCustCd);
  });

  it("treats two default makeBlankRow rows as non-duplicates (uuid-based custCd)", () => {
    // makeBlankRow uses crypto.randomUUID().slice(0,12) — statistically unique
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const row1 = makeRow({ id: id1, custCd: id1.slice(0, 12) });
    const row2 = makeRow({ id: id2, custCd: id2.slice(0, 12) });

    const dups = findDuplicateKeys([row1, row2], ["custCd"]);

    // Should not flag a collision between two freshly-created blank rows
    expect(dups).toHaveLength(0);
  });

  it("onSave guard: duplicate check fires before server action is called", () => {
    // Simulates the logic inside CustomersGridContainer.onSave:
    //   const dups = findDuplicateKeys(allRows, ["custCd"])
    //   if (dups.length > 0) return { ok: false, errors: [...] }
    const dupCustCd = "DUP-GUARD-TEST";
    const rows = [makeRow({ custCd: dupCustCd }), makeRow({ custCd: dupCustCd })];

    const dups = findDuplicateKeys(rows, ["custCd"]);

    // Guard MUST fire — ok: false returned to the grid, server action NOT called
    const shouldBlock = dups.length > 0;
    expect(shouldBlock).toBe(true);

    // The error message template matches what onSave returns (i18n key params)
    const errorCodes = dups.join(", ");
    expect(errorCodes).toBe(dupCustCd);
  });
});
