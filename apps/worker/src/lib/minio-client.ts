import { Client } from 'minio';

export const minioClient = new Client({
  endPoint: process.env['MINIO_ENDPOINT']!,
  port: parseInt(process.env['MINIO_PORT'] || '9000'),
  useSSL: process.env['MINIO_USE_SSL'] === 'true',
  accessKey: process.env['MINIO_ACCESS_KEY']!,
  secretKey: process.env['MINIO_SECRET_KEY']!,
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
