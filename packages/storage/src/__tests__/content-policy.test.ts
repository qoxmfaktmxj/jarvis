import { describe, expect, it } from "vitest";
import { normalizeSourceText, sha256, validateUpload } from "../index.js";

describe("source content policy", () => {
  it("accepts matching PDF magic bytes", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic");

    expect(validateUpload(bytes, "application/pdf").extension).toBe("pdf");
  });

  it("rejects declared MIME that disagrees with magic bytes", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic");

    expect(() => validateUpload(bytes, "text/plain")).toThrow(/MIME/i);
  });

  it("checksums normalized UTF-8 bytes independently", () => {
    const raw = new TextEncoder().encode("line 1\r\nline 2   \r\n");
    const normalized = new TextEncoder().encode(normalizeSourceText("line 1\r\nline 2   \r\n"));

    expect(sha256(normalized)).not.toBe(sha256(raw));
  });

  it("rejects invalid UTF-8 text payloads", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);

    expect(() => validateUpload(bytes, "text/plain")).toThrow(/UTF-8/i);
  });

  it("rejects empty or oversized normalized text", () => {
    expect(() => normalizeSourceText(" \r\n\t")).toThrow(/empty/i);
    expect(() => normalizeSourceText("x".repeat(10 * 1024 * 1024 + 1))).toThrow(/large/i);
  });
});
