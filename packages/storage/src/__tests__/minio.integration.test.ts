import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSourceObjectKey, createMinioObjectStoreFromEnv, sha256 } from "../index.js";

describe("MinIO immutable object integration", () => {
  it("stores once and reads normalized UTF-8 text", async () => {
    const store = await createMinioObjectStoreFromEnv();
    const body = new TextEncoder().encode("합성 HR 자료\n");
    const checksum = sha256(body);
    const key = buildSourceObjectKey({
      workspaceId: randomUUID(),
      sourceDocumentId: randomUUID(),
      checksum,
      variant: "normalized",
      extension: "txt",
    });

    await expect(store.putIfAbsent({ key, body, checksum, contentType: "text/plain" })).resolves.toEqual({
      created: true,
    });
    await expect(store.putIfAbsent({ key, body, checksum, contentType: "text/plain" })).resolves.toEqual({
      created: false,
    });
    await expect(store.getText(key)).resolves.toBe("합성 HR 자료\n");
  });
});
