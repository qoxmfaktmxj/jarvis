import { Client } from "minio";
import { sha256 } from "./checksum.js";
import { MAX_NORMALIZED_TEXT_BYTES, normalizeContentType } from "./content-policy.js";
import { assertSafeObjectKey, type ImmutableObjectStore, type PutObjectInput } from "./types.js";

export interface StorageEnv {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

interface MinioClientLike {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
  statObject(bucket: string, key: string): Promise<{ size: number; metaData?: Record<string, unknown> }>;
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    size: number,
    metadata: Record<string, string>,
  ): Promise<unknown>;
  getObject(bucket: string, key: string): Promise<NodeJS.ReadableStream & { destroy?: () => void }>;
}

function required(name: string, env: Record<string, string | undefined>): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readStorageEnv(env: Record<string, string | undefined> = process.env): StorageEnv {
  const endpoint = new URL(required("MINIO_ENDPOINT", env));
  const accessKey = required("MINIO_ACCESS_KEY", env);
  const secretKey = required("MINIO_SECRET_KEY", env);
  const bucket = required("MINIO_BUCKET", env);

  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("MINIO_ENDPOINT must use http or https");
  }
  if (endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
    throw new Error("MINIO_ENDPOINT must contain only scheme, host and port");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("MINIO_BUCKET is invalid");
  }

  const port = endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MINIO_ENDPOINT port is invalid");
  }

  return {
    endPoint: endpoint.hostname,
    port,
    useSSL: endpoint.protocol === "https:",
    accessKey,
    secretKey,
    bucket,
  };
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
}

function isMissingObject(error: unknown): boolean {
  return ["NotFound", "NoSuchKey", "NoSuchObject"].includes(errorCode(error));
}

function isBucketRace(error: unknown): boolean {
  return ["BucketAlreadyExists", "BucketAlreadyOwnedByYou"].includes(errorCode(error));
}

function metadataChecksum(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (["sha256", "x-amz-meta-sha256"].includes(key.toLowerCase())) {
      return String(value).toLowerCase();
    }
  }
  return null;
}

export class MinioObjectStore implements ImmutableObjectStore {
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly client: MinioClientLike,
    private readonly bucket: string,
  ) {}

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      if (await this.client.bucketExists(this.bucket)) {
        return;
      }
      try {
        await this.client.makeBucket(this.bucket);
      } catch (error) {
        if (!isBucketRace(error)) {
          throw error;
        }
      }
    })();
    return this.bucketReady;
  }

  async putIfAbsent(input: PutObjectInput): Promise<{ created: boolean }> {
    await this.ensureBucket();
    const key = assertSafeObjectKey(input.key);
    const calculated = sha256(input.body);
    if (calculated !== input.checksum.toLowerCase()) {
      throw new Error("checksum mismatch");
    }

    try {
      const stat = await this.client.statObject(this.bucket, key);
      if (metadataChecksum(stat.metaData) !== calculated || stat.size !== input.body.byteLength) {
        throw new Error("immutable object collision");
      }
      return { created: false };
    } catch (error) {
      if (!isMissingObject(error)) {
        throw error;
      }
    }

    await this.client.putObject(this.bucket, key, Buffer.from(input.body), input.body.byteLength, {
      "Content-Type": normalizeContentType(input.contentType),
      "X-Amz-Meta-Sha256": calculated,
    });
    const stored = await this.client.statObject(this.bucket, key);
    if (metadataChecksum(stored.metaData) !== calculated || stored.size !== input.body.byteLength) {
      throw new Error("immutable object verification failed");
    }
    return { created: true };
  }

  async getText(key: string): Promise<string> {
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, assertSafeObjectKey(key));
    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as ArrayBuffer);
      total += bytes.byteLength;
      if (total > MAX_NORMALIZED_TEXT_BYTES) {
        stream.destroy?.();
        throw new Error("stored text is too large");
      }
      chunks.push(bytes);
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new Error("stored object is not valid UTF-8 text");
    }
  }
}

export function createMinioObjectStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): MinioObjectStore {
  const config = readStorageEnv(env);
  return new MinioObjectStore(
    new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    }),
    config.bucket,
  );
}
