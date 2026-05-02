/**
 * Upload validation helpers — size + MIME + magic-byte spot checks.
 *
 * Used by sales upload paths (contract-uploads finalize, plan-perf Excel ingest)
 * to block DoS-sized payloads and reject malformed files before parsing.
 *
 * Reuses the broader presign allowlist conceptually but defaults to the xlsx/csv
 * subset that the sales screens accept.
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const XLSX_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export type UploadValidation = { ok: true } | { ok: false; error: string };

export function validateUploadSize(
  bytes: number,
  maxBytes = DEFAULT_MAX_BYTES,
): UploadValidation {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, error: "Invalid file size" };
  }
  if (bytes > maxBytes) {
    return {
      ok: false,
      error: `File too large: ${(bytes / 1024 / 1024).toFixed(1)}MB (max ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
    };
  }
  return { ok: true };
}

export function validateUploadMime(
  mime: string,
  allowed: readonly string[] = XLSX_MIME,
): UploadValidation {
  if (!allowed.includes(mime)) {
    return { ok: false, error: `Disallowed MIME: ${mime}` };
  }
  return { ok: true };
}

/**
 * Magic-bytes spot check for xlsx (zip header "PK\x03\x04"). Returns `true` if
 * the buffer starts with the right header. Belt-and-suspenders against MIME
 * spoofing — modern xlsx files are zip containers, so the first 4 bytes are
 * always 50 4B 03 04. CSV is not detectable via magic bytes (plain text).
 */
export function looksLikeXlsxMagicBytes(buf: Uint8Array | ArrayBuffer): boolean {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return (
    u8.length >= 4 &&
    u8[0] === 0x50 &&
    u8[1] === 0x4b &&
    u8[2] === 0x03 &&
    u8[3] === 0x04
  );
}

/** Default 10 MB cap (exposed for tests / call-sites that want to compare). */
export const UPLOAD_DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;

/** Default xlsx/csv allowlist (exposed for tests). */
export const UPLOAD_XLSX_MIME = XLSX_MIME;

/** xlsx/xls only — for callers that should explicitly reject CSV. */
export const UPLOAD_XLSX_STRICT_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
