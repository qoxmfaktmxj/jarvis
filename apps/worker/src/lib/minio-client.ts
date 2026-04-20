import { Client } from 'minio';

// Lazy-initialize the MinIO client so that:
// 1. Modules importing `minioClient` don't crash at import time when
//    MINIO_* env vars are absent (test setup, docker build page-data
//    collection, etc.).
// 2. The client is still constructed exactly once on first use.
// A Proxy lets all existing callers keep using `minioClient.x()` without
// changes — the real `Client` is only constructed when a property is
// accessed.
let _client: Client | null = null;
function getClient(): Client {
  if (!_client) {
    _client = new Client({
      endPoint: process.env['MINIO_ENDPOINT']!,
      port: parseInt(process.env['MINIO_PORT'] || '9000'),
      useSSL: process.env['MINIO_USE_SSL'] === 'true',
      accessKey: process.env['MINIO_ACCESS_KEY']!,
      secretKey: process.env['MINIO_SECRET_KEY']!,
    });
  }
  return _client;
}

export const minioClient = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

export const BUCKET = process.env['MINIO_BUCKET'] ?? 'jarvis-files';

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1');
    console.log(`[minio] Created bucket: ${BUCKET}`);
  } else {
    console.log(`[minio] Bucket already exists: ${BUCKET}`);
  }
}
