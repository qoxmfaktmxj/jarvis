import { describe, expect, it } from "vitest";
import { buildSourceObjectKey, sha256 } from "../index.js";

describe("immutable source keys", () => {
  it("hashes bytes deterministically", () => {
    const bytes = new TextEncoder().encode("same");

    expect(sha256(bytes)).toBe(sha256(bytes));
  });

  it("uses UUID tenant/document segments and the payload checksum", () => {
    expect(
      buildSourceObjectKey({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        sourceDocumentId: "11111111-1111-4111-8111-111111111111",
        checksum: "a".repeat(64),
        variant: "raw",
        extension: "pdf",
      }),
    ).toBe(
      "sources/00000000-0000-4000-8000-000000000001/" +
        "11111111-1111-4111-8111-111111111111/" +
        `${"a".repeat(64)}.raw.pdf`,
    );
  });

  it("rejects workspace code where UUID is required", () => {
    expect(() =>
      buildSourceObjectKey({
        workspaceId: "public-demo",
        sourceDocumentId: "11111111-1111-4111-8111-111111111111",
        checksum: "a".repeat(64),
        variant: "raw",
        extension: "pdf",
      }),
    ).toThrow(/workspaceId/i);
  });

  it("rejects path escape object keys", () => {
    expect(() =>
      buildSourceObjectKey({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        sourceDocumentId: "11111111-1111-4111-8111-111111111111",
        checksum: "a".repeat(64),
        variant: "raw",
        extension: "../pdf",
      }),
    ).toThrow(/extension|object key/i);
  });
});
