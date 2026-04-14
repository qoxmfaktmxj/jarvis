import { describe, expect, it } from "vitest";
import { redactPII } from "./pii-redactor.js";

describe("redactPII — SSN (주민번호)", () => {
  it("redacts a bare SSN", () => {
    const { redacted, hits } = redactPII("홍길동 900101-1234567 문의");
    expect(redacted).toBe("홍길동 [REDACTED_SSN] 문의");
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("ssn");
  });

  it("redacts multiple SSNs in one string", () => {
    const { redacted, hits } = redactPII("A 010101-3000000, B 020202-4000000");
    expect(redacted).toBe("A [REDACTED_SSN], B [REDACTED_SSN]");
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.kind === "ssn")).toBe(true);
  });

  it("records correct span for SSN", () => {
    const input = "ID 900101-1234567 END";
    const { hits } = redactPII(input);
    expect(hits[0].span[0]).toBe(3);
    expect(hits[0].span[1]).toBe(17);
  });

  it("does not match 6-7 with wrong separator", () => {
    const { hits } = redactPII("900101.1234567 and 900101 1234567");
    expect(hits.filter((h) => h.kind === "ssn")).toHaveLength(0);
  });

  it("does not redact plain numeric strings", () => {
    const { redacted, hits } = redactPII("주문번호 12345678901234");
    expect(redacted).toBe("주문번호 12345678901234");
    expect(hits).toHaveLength(0);
  });
});
