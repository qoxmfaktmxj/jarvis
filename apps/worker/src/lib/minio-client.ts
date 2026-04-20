import { Client } from 'minio';

// Env fallbacks keep module loadable at test/build time when vars are unset;
// callers that actually talk to MinIO will fail at the network layer, not at import.
export const minioClient = new Client({
  endPoint: process.env['MINIO_ENDPOINT'] || 'localhost',
  port: parseInt(process.env['MINIO_PORT'] || '9000'),
  useSSL: process.env['MINIO_USE_SSL'] === 'true',
  accessKey: process.env['MINIO_ACCESS_KEY'] || 'minioadmin',
  secretKey: process.env['MINIO_SECRET_KEY'] || 'minioadmin',
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
