import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock minio before importing the module
vi.mock('minio', () => {
  const bucketExistsMock = vi.fn();
  const makeBucketMock = vi.fn();
  return {
    Client: vi.fn().mockImplementation(() => ({
      bucketExists: bucketExistsMock,
      makeBucket: makeBucketMock,
    })),
  };
});

describe('ensureBucket', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['MINIO_ENDPOINT'] = 'localhost';
    process.env['MINIO_PORT'] = '9000';
    process.env['MINIO_ACCESS_KEY'] = 'minioadmin';
    process.env['MINIO_SECRET_KEY'] = 'minioadmin';
  });

  it('calls makeBucket when bucket does not exist', async () => {
    const { Client } = await import('minio');
    const instance = new (Client as any)();
    instance.bucketExists.mockResolvedValue(false);
    instance.makeBucket.mockResolvedValue(undefined);

    const { ensureBucket } = await import('./minio-client.js');
    await ensureBucket();

    expect(instance.makeBucket).toHaveBeenCalledWith('jarvis-files', 'us-east-1');
  });

  it('does not call makeBucket when bucket already exists', async () => {
    const { Client } = await import('minio');
    const instance = new (Client as any)();
    instance.bucketExists.mockResolvedValue(true);
    instance.makeBucket.mockResolvedValue(undefined);

    const { ensureBucket } = await import('./minio-client.js');
    await ensureBucket();

    expect(instance.makeBucket).not.toHaveBeenCalled();
  });
});
