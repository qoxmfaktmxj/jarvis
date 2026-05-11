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

/**
 * Resource-type aware upload policy registry.
 *
 * A3 P0-1 fix — Previously `/api/upload` only applied strict 10MB + xlsx
 * gating when the client claimed `resourceType === 'sales_contract_upload'`.
 * That made the strict policy opt-in from the client, so a malicious or
 * misconfigured client could simply omit `resourceType` and fall through to
 * the broad 50MB presign allowlist (incl. PDF, zip, images). This registry
 * keeps the per-resourceType policy in one place and is consulted by BOTH
 * presign and finalize so the strict gate cannot be bypassed.
 *
 * Lookup is server-side; client-supplied resourceType is treated as a HINT
 * that selects the policy bucket — but the bucket itself (size + MIME) is
 * never under client control.
 */
export type UploadPolicy = {
  /** Maximum byte size accepted. */
  maxBytes: number;
  /** Allowed MIME types. */
  allowedMimeTypes: readonly string[];
};

const SALES_CONTRACT_UPLOAD_POLICY: UploadPolicy = {
  maxBytes: DEFAULT_MAX_BYTES, // 10 MB
  allowedMimeTypes: XLSX_MIME, // xlsx + xls + csv
};

const UPLOAD_POLICY_REGISTRY: Record<string, UploadPolicy> = {
  sales_contract_upload: SALES_CONTRACT_UPLOAD_POLICY,
};

/**
 * Server-authoritative policy lookup. Returns `null` when the resourceType
 * has no specific policy bucket — callers should then fall back to whatever
 * baseline gate is appropriate for the endpoint (broad presign allowlist for
 * generic uploads). Returning `null` is NOT a failure — it just means "no
 * stricter rule than the default applies".
 */
export function getUploadPolicy(resourceType: string | null | undefined): UploadPolicy | null {
  if (!resourceType) return null;
  return UPLOAD_POLICY_REGISTRY[resourceType] ?? null;
}

/**
 * Combined size+MIME validation against the registered policy for a
 * resourceType. Returns `{ ok: true }` when:
 *   - resourceType has no specific policy (caller handles default), OR
 *   - resourceType has a policy and both size+MIME match.
 *
 * Returns `{ ok: false, error }` for explicit policy violations.
 */
export function validateUploadAgainstPolicy(
  resourceType: string | null | undefined,
  sizeBytes: number,
  mimeType: string,
): UploadValidation {
  const policy = getUploadPolicy(resourceType);
  if (!policy) return { ok: true };
  const size = validateUploadSize(sizeBytes, policy.maxBytes);
  if (!size.ok) return size;
  const mime = validateUploadMime(mimeType, policy.allowedMimeTypes);
  if (!mime.ok) return mime;
  return { ok: true };
}
