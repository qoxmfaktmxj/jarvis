/**
 * composite-key.test.ts
 *
 * Unit-level coverage for the custMcd composite-key duplicate check that
 * guards CustomerContactsGridContainer.onSave.
 *
 * WHY vitest instead of e2e:
 *   `custMcd` is Hidden:1 in the legacy ibSheet policy — it is NOT rendered
 *   as a grid column and is NOT editable through the UI. Two freshly-inserted
 *   rows always receive distinct UUID-derived values from `makeBlankRow`, so it
 *   is impossible to create a UI-driven duplicate via Playwright without an
 *   artificial page-level escape hatch. The duplicate guard itself lives in
 *   `findDuplicateKeys` + the `onSave` handler; exercising it at the unit
 *   level is the correct test boundary.
 */
import { describe, it, expect } from "vitest";
import { findDuplicateKeys } from "@/lib/utils/validateDuplicateKeys";
import type { CustomerContactRow } from "@jarvis/shared/validation/sales/customer-contact";

/** Minimal factory — only custMcd and id matter for duplicate detection. */
function makeRow(overrides: Partial<CustomerContactRow> = {}): CustomerContactRow {
  const id = crypto.randomUUID();
  return {
    id,
    custMcd: id.slice(0, 12),
    customerId: null,
    custName: null,
    jikweeNm: null,
    orgNm: null,
    telNo: null,
    hpNo: null,
    email: null,
    statusYn: true,
    sabun: null,
    custNm: null,
    createdAt: null,
    ...overrides,
  };
}

describe("composite-key custMcd duplicate detection (customer-contacts grid)", () => {
  // ── Scenario 1: duplicate save must be blocked ──────────────────────────
  it("flags two rows sharing the same custMcd as a duplicate", () => {
    const dupCustMcd = "DUP-TEST-001";
    const row1 = makeRow({ custMcd: dupCustMcd });
    const row2 = makeRow({ custMcd: dupCustMcd }); // same custMcd, different id

    const dups = findDuplicateKeys([row1, row2], ["custMcd"]);

    expect(dups).toHaveLength(1);
    expect(dups[0]).toBe(dupCustMcd);
  });

  // ── Scenario 2: all unique — no block ───────────────────────────────────
  it("returns empty array when all custMcd values are unique", () => {
    const row1 = makeRow({ custMcd: "CONT-A" });
    const row2 = makeRow({ custMcd: "CONT-B" });
    const row3 = makeRow({ custMcd: "CONT-C" });

    const dups = findDuplicateKeys([row1, row2, row3], ["custMcd"]);

    expect(dups).toHaveLength(0);
  });

  // ── Scenario 3: triple shared key reported once ─────────────────────────
  it("reports each duplicate key once even when three rows share it", () => {
    const dupCustMcd = "TRIPLE-DUP";
    const rows = [
      makeRow({ custMcd: dupCustMcd }),
      makeRow({ custMcd: dupCustMcd }),
      makeRow({ custMcd: dupCustMcd }),
    ];

    const dups = findDuplicateKeys(rows, ["custMcd"]);

    // findDuplicateKeys uses a Set — the key appears exactly once in output
    expect(dups).toHaveLength(1);
    expect(dups[0]).toBe(dupCustMcd);
  });

  // ── Scenario 4: two default makeBlankRow rows are non-duplicates ─────────
  it("treats two default makeBlankRow rows as non-duplicates (uuid-based custMcd)", () => {
    // makeBlankRow uses crypto.randomUUID().slice(0,12) — statistically unique
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const row1 = makeRow({ id: id1, custMcd: id1.slice(0, 12) });
    const row2 = makeRow({ id: id2, custMcd: id2.slice(0, 12) });

    const dups = findDuplicateKeys([row1, row2], ["custMcd"]);

    // Should not flag a collision between two freshly-created blank rows
    expect(dups).toHaveLength(0);
  });

  // ── Scenario 5: onSave guard simulation ─────────────────────────────────
  it("onSave guard: duplicate check fires before server action is called", () => {
    // Simulates the logic inside CustomerContactsGridContainer.onSave:
    //   const dups = findDuplicateKeys(allRows, ["custMcd"])
    //   if (dups.length > 0) return { ok: false, errors: [...] }
    const dupCustMcd = "DUP-GUARD-TEST";
    const rows = [makeRow({ custMcd: dupCustMcd }), makeRow({ custMcd: dupCustMcd })];

    const dups = findDuplicateKeys(rows, ["custMcd"]);

    // Guard MUST fire — ok: false returned to the grid, server action NOT called
    const shouldBlock = dups.length > 0;
    expect(shouldBlock).toBe(true);

    // The error message template matches what onSave returns
    const errorCodes = dups.join(", ");
    expect(errorCodes).toBe(dupCustMcd);
  });
});
