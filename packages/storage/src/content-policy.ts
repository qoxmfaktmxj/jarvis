export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_NORMALIZED_TEXT_BYTES = 10 * 1024 * 1024;

export type AllowedSourceContentType =
  | "application/pdf"
  | "application/json"
  | "application/xml"
  | "text/xml"
  | "text/plain";

const TYPES = new Set<AllowedSourceContentType>([
  "application/pdf",
  "application/json",
  "application/xml",
  "text/xml",
  "text/plain",
]);

const EXTENSIONS: Record<AllowedSourceContentType, string> = {
  "application/pdf": "pdf",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/plain": "txt",
};

const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });
const looseUtf8 = new TextDecoder("utf-8");

export function normalizeContentType(value: string): AllowedSourceContentType {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized || !TYPES.has(normalized as AllowedSourceContentType)) {
    throw new Error(`unsupported MIME type: ${value}`);
  }
  return normalized as AllowedSourceContentType;
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = fatalUtf8.decode(bytes);
  } catch {
    throw new Error("MIME content is not valid UTF-8 text");
  }
  if (text.includes("\u0000")) {
    throw new Error("MIME content contains binary NUL bytes");
  }
  return text;
}

export function validateUpload(
  bytes: Uint8Array,
  declaredContentType: string,
  maxBytes = MAX_SOURCE_BYTES,
): { contentType: AllowedSourceContentType; extension: string; sizeBytes: number } {
  if (bytes.byteLength === 0) {
    throw new Error("source payload is empty");
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error("source payload is too large");
  }

  const contentType = normalizeContentType(declaredContentType);
  if (contentType === "application/pdf") {
    if (looseUtf8.decode(bytes.subarray(0, 5)) !== "%PDF-") {
      throw new Error("MIME/magic-byte mismatch for PDF");
    }
    return { contentType, extension: EXTENSIONS[contentType], sizeBytes: bytes.byteLength };
  }

  const text = decodeText(bytes);
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("%PDF-")) {
    throw new Error("MIME/magic-byte mismatch: PDF declared as text");
  }
  if (contentType === "application/json") {
    try {
      JSON.parse(trimmed);
    } catch {
      throw new Error("MIME content is not valid JSON");
    }
  }
  if ((contentType === "application/xml" || contentType === "text/xml") && !trimmed.startsWith("<")) {
    throw new Error("MIME content is not valid XML text");
  }

  return { contentType, extension: EXTENSIONS[contentType], sizeBytes: bytes.byteLength };
}

export function normalizeSourceText(value: string): string {
  const normalized = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC").trimEnd();
  if (!normalized.trim()) {
    throw new Error("normalized source text is empty");
  }

  const result = `${normalized}\n`;
  if (new TextEncoder().encode(result).byteLength > MAX_NORMALIZED_TEXT_BYTES) {
    throw new Error("normalized source text is too large");
  }
  return result;
}
