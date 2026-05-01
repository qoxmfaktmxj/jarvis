import { describe, expect, it } from "vitest";
import { findDuplicateKeys } from "./validateDuplicateKeys";

describe("findDuplicateKeys", () => {
  it("returns empty when no duplicates", () => {
    const rows = [
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "A", devGbCd: "X", symd: "20260201" },
      { custCd: "B", devGbCd: "X", symd: "20260101" },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "devGbCd", "symd"])).toEqual([]);
  });

  it("returns composite duplicate keys joined with |", () => {
    const rows = [
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "B", devGbCd: "X", symd: "20260101" },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "devGbCd", "symd"])).toEqual(["A|X|20260101"]);
  });

  it("treats null and undefined as empty string in key", () => {
    const rows = [
      { custCd: "A", symd: null as unknown as string },
      { custCd: "A", symd: undefined as unknown as string },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "symd"])).toEqual(["A|"]);
  });

  it("supports number keys", () => {
    const rows = [{ id: 1, type: 10 }, { id: 1, type: 10 }];
    expect(findDuplicateKeys(rows, ["id", "type"])).toEqual(["1|10"]);
  });

  it("returns each duplicate exactly once even when triplicated", () => {
    const rows = [{ k: "A" }, { k: "A" }, { k: "A" }, { k: "B" }];
    expect(findDuplicateKeys(rows, ["k"])).toEqual(["A"]);
  });
});
