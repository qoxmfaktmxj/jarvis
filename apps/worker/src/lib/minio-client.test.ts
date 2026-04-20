import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track the last-created Client instance so tests can observe it.
// The module-under-test creates its own instance; we must capture that
// one rather than creating a separate dummy.
let lastCreatedInstance: { bucketExists: ReturnType<typeof vi.fn>; makeBucket: ReturnType<typeof vi.fn> } | null = null;

vi.mock('minio', () => ({
  Client: vi.fn().mockImplementation(() => {
    lastCreatedInstance = {
      bucketExists: vi.fn(),
      makeBucket: vi.fn(),
    };
    return lastCreatedInstance;
  }),
}));

describe('ensureBucket', () => {
  beforeEach(() => {
    vi.resetModules();
    lastCreatedInstance = null;
    process.env['MINIO_ENDPOINT'] = 'localhost';
    process.env['MINIO_PORT'] = '9000';
    process.env['MINIO_ACCESS_KEY'] = 'minioadmin';
    process.env['MINIO_SECRET_KEY'] = 'minioadmin';
  });

  it('calls makeBucket when bucket does not exist', async () => {
    const { ensureBucket, minioClient } = await import('./minio-client.js');

    // minioClient is now a lazy Proxy — touch any property to trigger
    // the underlying Client construction and populate lastCreatedInstance.
    void minioClient.bucketExists;

    // Set up AFTER first touch so the instance is the one ensureBucket holds
    lastCreatedInstance!.bucketExists.mockResolvedValue(false);
    lastCreatedInstance!.makeBucket.mockResolvedValue(undefined);

    await ensureBucket();

    expect(lastCreatedInstance!.makeBucket).toHaveBeenCalledWith('jarvis-files', 'us-east-1');
  });

  it('does not call makeBucket when bucket already exists', async () => {
    const { ensureBucket, minioClient } = await import('./minio-client.js');

    // Trigger lazy Proxy init (see comment above)
    void minioClient.bucketExists;

    lastCreatedInstance!.bucketExists.mockResolvedValue(true);
    lastCreatedInstance!.makeBucket.mockResolvedValue(undefined);

    await ensureBucket();

    expect(lastCreatedInstance!.makeBucket).not.toHaveBeenCalled();
  });
});
