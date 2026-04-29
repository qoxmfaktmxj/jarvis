/**
 * Pure magic-byte verification — no I/O, no Next.js imports.
 *
 * Verifies that the first bytes of an uploaded file match the declared MIME type.
 * This is the second line of defense after the presign route's declared-MIME whitelist:
 * a client could declare "image/png" to pass the whitelist but upload malicious HTML/EXE.
 *
 * Reference signatures:
 *   PDF        : 25 50 44 46 2D           ("%PDF-")
 *   PNG        : 89 50 4E 47 0D 0A 1A 0A  (PNG magic)
 *   JPEG       : FF D8 FF                  (JFIF/Exif start)
 *   GIF        : 47 49 46 38 37|39 61     ("GIF87a" | "GIF89a")
 *   ZIP / OOXML: 50 4B 03 04              ("PK\x03\x04")
 *   text/plain, text/markdown: heuristic — no leading "<", no NUL in first 256 bytes
 */

export type MagicResult = { ok: true } | { ok: false; reason: string };

// Byte-level prefix comparison helper
function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

// --- Signature table --------------------------------------------------------

const SIGNATURES: Record<string, (bytes: Uint8Array) => MagicResult> = {
  'application/pdf': (bytes) => {
    // %PDF-
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: true };
    return { ok: false, reason: 'Missing PDF magic bytes (%PDF-)' };
  },

  'image/png': (bytes) => {
    // 89 50 4E 47 0D 0A 1A 0A
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true };
    return { ok: false, reason: 'Missing PNG magic bytes' };
  },

  'image/jpeg': (bytes) => {
    // FF D8 FF
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ok: true };
    return { ok: false, reason: 'Missing JPEG magic bytes (FF D8 FF)' };
  },

  'image/gif': (bytes) => {
    // GIF87a or GIF89a
    if (
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    )
      return { ok: true };
    return { ok: false, reason: 'Missing GIF magic bytes (GIF87a or GIF89a)' };
  },

  'application/zip': zipVerifier,

  // OOXML formats are ZIP archives internally
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': zipVerifier,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': zipVerifier,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': zipVerifier,

  'text/plain': textVerifier,
  'text/markdown': textVerifier,
};

function zipVerifier(bytes: Uint8Array): MagicResult {
  // PK\x03\x04
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { ok: true };
  return { ok: false, reason: 'Missing ZIP/PK magic bytes (PK\\x03\\x04)' };
}

// Dangerous HTML/JS tag patterns that enable XSS via browser content sniffing.
// Matched case-insensitively after stripping leading whitespace + BOM.
const DANGEROUS_TAG_PATTERNS = [
  '<script',
  '<iframe',
  '<svg',
  '<!doctype',
  '<html',
];

function textVerifier(bytes: Uint8Array): MagicResult {
  const scanLength = Math.min(bytes.length, 256);

  // Heuristic 1: no NUL byte in first 256 bytes (indicates binary)
  for (let i = 0; i < scanLength; i++) {
    if (bytes[i] === 0x00) {
      return { ok: false, reason: 'Binary content (NUL byte) found in file declared as text' };
    }
  }

  // Heuristic 2: strip leading whitespace (0x09 \t, 0x0a \n, 0x0d \r, 0x20 space)
  // and UTF-8 BOM (0xEF 0xBB 0xBF), then check for dangerous HTML tags.
  let start = 0;
  // Skip UTF-8 BOM
  if (
    scanLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    start = 3;
  }
  // Skip leading ASCII whitespace
  while (start < scanLength && (
    bytes[start] === 0x09 ||
    bytes[start] === 0x0a ||
    bytes[start] === 0x0d ||
    bytes[start] === 0x20
  )) {
    start++;
  }

  // Build lowercase string from the trimmed region for tag scanning
  const trimmedStr = Array.from(bytes.subarray(start, scanLength))
    .map((b) => String.fromCharCode(b))
    .join('')
    .toLowerCase();

  for (const pattern of DANGEROUS_TAG_PATTERNS) {
    if (trimmedStr.startsWith(pattern)) {
      return {
        ok: false,
        reason: `Text file must not begin with "${pattern}" (possible HTML/script injection)`,
      };
    }
  }

  return { ok: true };
}

// --- Public API -------------------------------------------------------------

/**
 * Verify that `bytes` (first N bytes from the uploaded object) match `declaredMime`.
 *
 * @param bytes        First ≥8 bytes of the uploaded object (256 recommended for text heuristic).
 * @param declaredMime The MIME type the client declared at presign time.
 */
export function verifyMagicBytes(bytes: Uint8Array, declaredMime: string): MagicResult {
  const verifier = SIGNATURES[declaredMime];
  if (!verifier) {
    return { ok: false, reason: `Unknown or unsupported MIME type: ${declaredMime}` };
  }
  return verifier(bytes);
}
