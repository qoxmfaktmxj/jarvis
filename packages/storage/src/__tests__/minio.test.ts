import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { assertSafeObjectKey, MinioObjectStore, readStorageEnv, sha256 } from "../index.js";

describe("MinIO environment and keys", () => {
  it("parses MINIO_ENDPOINT as URL and requires bucket and credentials", () => {
    expect(
      readStorageEnv({
        MINIO_ENDPOINT: "http://127.0.0.1:59000",
        MINIO_ACCESS_KEY: "local-access",
        MINIO_SECRET_KEY: "local-secret",
        MINIO_BUCKET: "jarvis-public-sources",
      }),
    ).toMatchObject({
      endPoint: "127.0.0.1",
      port: 59000,
      useSSL: false,
      bucket: "jarvis-public-sources",
    });
  });

  it("fails closed when credential is absent", () => {
    expect(() =>
      readStorageEnv({
        MINIO_ENDPOINT: "http://127.0.0.1:59000",
        MINIO_ACCESS_KEY: "local-access",
        MINIO_BUCKET: "jarvis-public-sources",
      }),
    ).toThrow(/MINIO_SECRET_KEY/);
  });

  it("rejects unsafe object keys before storage calls", () => {
    for (const key of ["", "/absolute", "sources\\x", "sources/../x", "sources//x"]) {
      expect(() => assertSafeObjectKey(key)).toThrow(/object key/i);
    }
  });

  it("creates the bucket once and treats matching existing objects as immutable duplicates", async () => {
    const objects = new Map<string, { body: Buffer; metaData: Record<string, string> }>();
    let makeBucketCalls = 0;
    const client = {
      async bucketExists() {
        return makeBucketCalls > 0;
      },
      async makeBucket() {
        makeBucketCalls += 1;
      },
      async statObject(_bucket: string, key: string) {
        const object = objects.get(key);
        if (!object) {
          throw Object.assign(new Error("missing"), { code: "NoSuchKey" });
        }
        return { size: object.body.byteLength, metaData: object.metaData };
      },
      async putObject(
        _bucket: string,
        key: string,
        body: Buffer,
        _size: number,
        metadata: Record<string, string>,
      ) {
        objects.set(key, { body, metaData: { "x-amz-meta-sha256": metadata["X-Amz-Meta-Sha256"] } });
      },
      async getObject(_bucket: string, key: string) {
        const object = objects.get(key);
        if (!object) {
          throw Object.assign(new Error("missing"), { code: "NoSuchKey" });
        }
        return Readable.from([object.body]);
      },
    };
    const store = new MinioObjectStore(client, "jarvis-public-sources");
    const body = new TextEncoder().encode("synthetic storage text\n");
    const checksum = sha256(body);
    const key = `sources/00000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111/${checksum}.normalized.txt`;

    await expect(store.putIfAbsent({ key, body, checksum, contentType: "text/plain" })).resolves.toEqual({
      created: true,
    });
    await expect(store.putIfAbsent({ key, body, checksum, contentType: "text/plain" })).resolves.toEqual({
      created: false,
    });
    await expect(store.getText(key)).resolves.toBe("synthetic storage text\n");
    expect(makeBucketCalls).toBe(1);
  });

  it("rejects immutable object collisions", async () => {
    const body = new TextEncoder().encode("synthetic storage text\n");
    const checksum = sha256(body);
    const key = `sources/00000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111/${checksum}.raw.txt`;
    const client = {
      async bucketExists() {
        return true;
      },
      async makeBucket() {},
      async statObject() {
        return { size: body.byteLength + 1, metaData: { "x-amz-meta-sha256": checksum } };
      },
      async putObject() {},
      async getObject() {
        return Readable.from([body]);
      },
    };
    const store = new MinioObjectStore(client, "jarvis-public-sources");

    await expect(store.putIfAbsent({ key, body, checksum, contentType: "text/plain" })).rejects.toThrow(
      /collision/i,
    );
  });
});
