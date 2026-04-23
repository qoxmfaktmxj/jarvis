import { describe, expect, it } from "vitest";
import { buildLeaveSummaryRow } from "./contractors.js";

describe("buildLeaveSummaryRow", () => {
  it("computes used / remaining from cancelled-free leaves", () => {
    const row = buildLeaveSummaryRow({
      contractId: "c1",
      userId: "u1",
      employeeId: "SD26001",
      name: "홍길동",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      generatedHours: 80,
      additionalHours: 8,
      note: "연장",
      leaves: [
        { hours: 16, cancelledAt: null, endDate: "2026-03-01" },
        { hours: 8, cancelledAt: new Date(), endDate: "2026-03-05" },
        { hours: 8, cancelledAt: null, endDate: "2026-05-01" }
      ],
      referenceDate: "2026-04-30"
    });
    // used: 16 (both 3-01 and 5-01 included if end<=refDate; 5-01 > refDate → excluded)
    expect(row.usedDays).toBe(2);      // 16/8
    expect(row.generatedDays).toBe(11); // (80+8)/8
    expect(row.remainingDays).toBe(9);
  });
});
