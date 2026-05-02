import { describe, expect, it } from "vitest";
import {
  UPLOAD_DEFAULT_MAX_BYTES,
  UPLOAD_XLSX_MIME,
  UPLOAD_XLSX_STRICT_MIME,
  looksLikeXlsxMagicBytes,
  validateUploadMime,
  validateUploadSize,
} from "../validateUpload";

describe("validateUploadSize", () => {
  it("accepts size just under the cap", () => {
    const result = validateUploadSize(UPLOAD_DEFAULT_MAX_BYTES - 1);
    expect(result.ok).toBe(true);
  });

  it("accepts size exactly at the cap", () => {
    const result = validateUploadSize(UPLOAD_DEFAULT_MAX_BYTES);
    expect(result.ok).toBe(true);
  });

  it("rejects size 1 byte over the cap", () => {
    const result = validateUploadSize(UPLOAD_DEFAULT_MAX_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/too large/i);
      expect(result.error).toMatch(/10MB/);
    }
  });

  it("respects custom maxBytes parameter", () => {
    const ok = validateUploadSize(2048, 4096);
    expect(ok.ok).toBe(true);

    const tooBig = validateUploadSize(8192, 4096);
    expect(tooBig.ok).toBe(false);
  });

  it("rejects zero bytes", () => {
    const result = validateUploadSize(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid file size");
  });

  it("rejects negative bytes", () => {
    const result = validateUploadSize(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid file size");
  });

  it("rejects NaN", () => {
    const result = validateUploadSize(Number.NaN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid file size");
  });

  it("rejects Infinity", () => {
    const result = validateUploadSize(Number.POSITIVE_INFINITY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Invalid file size");
  });
});

describe("validateUploadMime", () => {
  it("accepts xlsx OOXML MIME", () => {
    const result = validateUploadMime(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts legacy xls MIME", () => {
    const result = validateUploadMime("application/vnd.ms-excel");
    expect(result.ok).toBe(true);
  });

  it("accepts text/csv", () => {
    const result = validateUploadMime("text/csv");
    expect(result.ok).toBe(true);
  });

  it("rejects unrelated MIME (PDF)", () => {
    const result = validateUploadMime("application/pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/disallowed mime/i);
      expect(result.error).toMatch(/application\/pdf/);
    }
  });

  it("rejects executable MIME", () => {
    const result = validateUploadMime("application/x-msdownload");
    expect(result.ok).toBe(false);
  });

  it("respects custom allowlist", () => {
    const allow = ["image/png"] as const;
    expect(validateUploadMime("image/png", allow).ok).toBe(true);
    expect(validateUploadMime("text/csv", allow).ok).toBe(false);
  });

  it("exposes the default allowlist", () => {
    expect(UPLOAD_XLSX_MIME).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(UPLOAD_XLSX_MIME).toContain("application/vnd.ms-excel");
    expect(UPLOAD_XLSX_MIME).toContain("text/csv");
  });

  it("rejects text/csv when called with UPLOAD_XLSX_STRICT_MIME", () => {
    const result = validateUploadMime("text/csv", UPLOAD_XLSX_STRICT_MIME);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/disallowed mime/i);
      expect(result.error).toMatch(/text\/csv/);
    }
    // Sanity: strict allowlist still accepts xlsx.
    expect(
      validateUploadMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        UPLOAD_XLSX_STRICT_MIME,
      ).ok,
    ).toBe(true);
  });
});

describe("looksLikeXlsxMagicBytes", () => {
  it("returns true for buffer starting with PK\\x03\\x04", () => {
    const buf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(looksLikeXlsxMagicBytes(buf)).toBe(true);
  });

  it("returns false for buffer with wrong header", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    expect(looksLikeXlsxMagicBytes(buf)).toBe(false);
  });

  it("returns false for buffer shorter than 4 bytes", () => {
    expect(looksLikeXlsxMagicBytes(new Uint8Array([0x50, 0x4b, 0x03]))).toBe(false);
    expect(looksLikeXlsxMagicBytes(new Uint8Array([]))).toBe(false);
  });

  it("returns false for partial PK header", () => {
    const buf = new Uint8Array([0x50, 0x4b, 0x05, 0x06]); // empty zip end-of-central-directory, not entry
    expect(looksLikeXlsxMagicBytes(buf)).toBe(false);
  });

  it("accepts ArrayBuffer input", () => {
    const ab = new ArrayBuffer(4);
    const view = new Uint8Array(ab);
    view[0] = 0x50;
    view[1] = 0x4b;
    view[2] = 0x03;
    view[3] = 0x04;
    expect(looksLikeXlsxMagicBytes(ab)).toBe(true);
  });

  it("rejects ArrayBuffer with wrong bytes", () => {
    const ab = new ArrayBuffer(4);
    new Uint8Array(ab).set([0x00, 0x00, 0x00, 0x00]);
    expect(looksLikeXlsxMagicBytes(ab)).toBe(false);
  });
});
