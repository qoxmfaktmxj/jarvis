import { describe, it, expect } from "vitest";
import {
  listCustomerContactsInput,
  exportCustomerContactsInput,
} from "@jarvis/shared/validation/sales/customer-contact";

describe("listCustomerContactsInput", () => {
  it("parses without optional fields", () => {
    const result = listCustomerContactsInput.parse({ page: 1, limit: 50 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.chargerNm).toBeUndefined();
    expect(result.hpNo).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.searchYmdFrom).toBeUndefined();
    expect(result.searchYmdTo).toBeUndefined();
  });

  it("parses chargerNm and trims whitespace", () => {
    const result = listCustomerContactsInput.parse({
      chargerNm: "  홍길동  ",
    });
    expect(result.chargerNm).toBe("홍길동");
  });

  it("parses hpNo and trims whitespace", () => {
    const result = listCustomerContactsInput.parse({
      hpNo: "  010-1234-5678  ",
    });
    expect(result.hpNo).toBe("010-1234-5678");
  });

  it("parses email and trims whitespace", () => {
    const result = listCustomerContactsInput.parse({
      email: "  test@example.com  ",
    });
    expect(result.email).toBe("test@example.com");
  });

  it("parses valid searchYmdFrom / searchYmdTo", () => {
    const result = listCustomerContactsInput.parse({
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-12-31",
    });
    expect(result.searchYmdFrom).toBe("2024-01-01");
    expect(result.searchYmdTo).toBe("2024-12-31");
  });

  it("rejects invalid searchYmdFrom format", () => {
    expect(() =>
      listCustomerContactsInput.parse({ searchYmdFrom: "2024/01/01" }),
    ).toThrow();
  });

  it("rejects invalid searchYmdTo format", () => {
    expect(() =>
      listCustomerContactsInput.parse({ searchYmdTo: "not-a-date" }),
    ).toThrow();
  });

  it("accepts all new filter fields together", () => {
    const result = listCustomerContactsInput.parse({
      custName: "홍길동",
      chargerNm: "김담당",
      hpNo: "010-0000-0001",
      email: "test@domain.com",
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-12-31",
      page: 2,
      limit: 50,
    });
    expect(result.chargerNm).toBe("김담당");
    expect(result.hpNo).toBe("010-0000-0001");
    expect(result.email).toBe("test@domain.com");
    expect(result.searchYmdFrom).toBe("2024-01-01");
    expect(result.searchYmdTo).toBe("2024-12-31");
  });
});

describe("exportCustomerContactsInput", () => {
  it("parses without any fields (full export)", () => {
    const result = exportCustomerContactsInput.parse({});
    expect(result).toEqual({});
  });

  it("parses all filter fields", () => {
    const result = exportCustomerContactsInput.parse({
      custName: "홍길동",
      chargerNm: "  이담당  ",
      hpNo: "010-1234-5678",
      email: "test@example.com",
      searchYmdFrom: "2024-01-01",
      searchYmdTo: "2024-06-30",
    });
    // chargerNm is trimmed
    expect(result.chargerNm).toBe("이담당");
    expect(result.hpNo).toBe("010-1234-5678");
    expect(result.email).toBe("test@example.com");
    expect(result.searchYmdFrom).toBe("2024-01-01");
  });

  it("does not include page/limit fields", () => {
    // exportCustomerContactsInput intentionally has no page/limit
    const shape = exportCustomerContactsInput.shape;
    expect("page" in shape).toBe(false);
    expect("limit" in shape).toBe(false);
  });
});
