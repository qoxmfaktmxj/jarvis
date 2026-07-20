const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const EXTENSION = /^[a-z0-9]{1,16}$/;

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  checksum: string;
}

export interface ImmutableObjectStore {
  putIfAbsent(input: PutObjectInput): Promise<{ created: boolean }>;
  getText(key: string): Promise<string>;
}

function requireMatch(field: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value)) {
    throw new Error(`invalid ${field}: ${value}`);
  }
  return value;
}

export function assertSafeObjectKey(key: string): string {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("invalid object key");
  }
  return key;
}

export function buildSourceObjectKey(input: {
  workspaceId: string;
  sourceDocumentId: string;
  checksum: string;
  variant: "raw" | "normalized";
  extension: string;
}): string {
  const workspaceId = requireMatch("workspaceId", input.workspaceId, UUID);
  const sourceDocumentId = requireMatch("sourceDocumentId", input.sourceDocumentId, UUID);
  const checksum = requireMatch("checksum", input.checksum.toLowerCase(), SHA256);
  const extension = requireMatch("extension", input.extension.toLowerCase(), EXTENSION);

  return assertSafeObjectKey(
    `sources/${workspaceId}/${sourceDocumentId}/${checksum}.${input.variant}.${extension}`,
  );
}
