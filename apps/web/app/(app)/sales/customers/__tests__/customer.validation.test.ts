import { describe, it, expect } from "vitest";
import {
  listCustomersInput,
  exportCustomersInput,
} from "@jarvis/shared/validation/sales/customer";

describe("listCustomersInput", () => {
  it("parses without optional fields", () => {
    const result = listCustomersInput.parse({ page: 1, limit: 50 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.chargerNm).toBeUndefined();
    expect(result.searchYmdFrom).toBeUndefined();
    expect(result.searchYmdTo).toBeUndefined();
  });

  it("parses chargerNm and trims whitespace", () => {
    const result = listCustomersInput.parse({
      chargerNm: "  홍길동  ",
    });
    expect(result.chargerNm).toBe("홍길동");
  });

  it("parses custNm and trims whitespace", () => {
    const result = listCustomersInput.parse({
      custNm: "  (주)테스트  ",
    });
    expect(result.custNm).toBe("(주)테스트");
  });

  it("parses valid searchYmdFrom / searchYmdTo", () => {
    const result = listCustomersInput.parse({
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-12-31",
    });
    expect(result.searchYmdFrom).toBe("2024-01-01");
    expect(result.searchYmdTo).toBe("2024-12-31");
  });

  it("rejects invalid searchYmdFrom format", () => {
    expect(() =>
      listCustomersInput.parse({ searchYmdFrom: "2024/01/01" }),
    ).toThrow();
  });

  it("rejects invalid searchYmdTo format", () => {
    expect(() =>
      listCustomersInput.parse({ searchYmdTo: "not-a-date" }),
    ).toThrow();
  });

  it("accepts all new filter fields together", () => {
    const result = listCustomersInput.parse({
      custNm: "테스트",
      custKindCd: "001",
      custDivCd: "A",
      chargerNm: "김담당",
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-12-31",
      page: 2,
      limit: 50,
    });
    expect(result.chargerNm).toBe("김담당");
    expect(result.searchYmdFrom).toBe("2024-01-01");
    expect(result.searchYmdTo).toBe("2024-12-31");
  });
});

describe("exportCustomersInput", () => {
  it("parses without any fields (full export)", () => {
    const result = exportCustomersInput.parse({});
    expect(result).toEqual({});
  });

  it("parses all filter fields", () => {
    const result = exportCustomersInput.parse({
      custNm: "테스트",
      chargerNm: "  이담당  ",
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-06-30",
    });
    // chargerNm is trimmed
    expect(result.chargerNm).toBe("이담당");
    expect(result.searchYmdFrom).toBe("2024-01-01");
  });

  it("does not include page/limit fields", () => {
    // exportCustomersInput intentionally has no page/limit
    const shape = exportCustomersInput.shape;
    expect("page" in shape).toBe(false);
    expect("limit" in shape).toBe(false);
  });
});
