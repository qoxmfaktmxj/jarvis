import { describe, expect, it } from "vitest";
import { sanitizeCellValue } from "./sanitize-csv";

describe("sanitizeCellValue", () => {
  it("passes safe primitives unchanged", () => {
    expect(sanitizeCellValue("ACME Corp")).toBe("ACME Corp");
    expect(sanitizeCellValue(42)).toBe(42);
    expect(sanitizeCellValue(true)).toBe(true);
    expect(sanitizeCellValue(null)).toBe("");
    expect(sanitizeCellValue(undefined)).toBe("");
  });

  it("neutralizes CSV-injection prefixes (=, +, -, @, \\t, \\r)", () => {
    expect(sanitizeCellValue("=HACK()")).toBe("'=HACK()");
    expect(sanitizeCellValue("+CMD")).toBe("'+CMD");
    expect(sanitizeCellValue("-MINUS")).toBe("'-MINUS");
    expect(sanitizeCellValue("@HYPERLINK")).toBe("'@HYPERLINK");
    expect(sanitizeCellValue("\tTAB")).toBe("'\tTAB");
    expect(sanitizeCellValue("\rCR")).toBe("'\rCR");
  });

  it("preserves leading zeros and Korean", () => {
    expect(sanitizeCellValue("0123")).toBe("0123");
    expect(sanitizeCellValue("홍길동")).toBe("홍길동");
  });
});
