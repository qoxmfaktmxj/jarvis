import { describe, expect, it } from "vitest";
import {
  leaveBatchInputSchema,
  validateBatchBusinessRules
} from "./actions.js";

describe("leaveBatchInputSchema", () => {
  it("accepts minimal batch", () => {
    const parsed = leaveBatchInputSchema.parse({
      contractId: "00000000-0000-0000-0000-000000000001",
      inserts: [],
      cancels: []
    });
    expect(parsed.inserts).toEqual([]);
  });
  it("rejects invalid type", () => {
    expect(() =>
      leaveBatchInputSchema.parse({
        contractId: "00000000-0000-0000-0000-000000000001",
        inserts: [
          {
            type: "weird",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
});

describe("validateBatchBusinessRules", () => {
  it("rejects start>end", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-25",
            endDate: "2026-04-20",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
  it("rejects hours <= 0", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 0
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
});
