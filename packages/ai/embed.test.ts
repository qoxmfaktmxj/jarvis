// packages/ai/embed.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEmbedding } from './embed.js';

// Mock openai
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        }),
      },
    })),
  };
});

// Mock Redis
vi.mock('@jarvis/db/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  }),
}));

describe('generateEmbedding', () => {
  it('returns a float array of length 1536', async () => {
    const result = await generateEmbedding('test question');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    result.forEach((v: number) => expect(typeof v).toBe('number'));
  });

  it('returns cached value on second call', async () => {
    const { getRedis } = await import('@jarvis/db/redis');
    const mockRedis = getRedis();
    const fakeEmbedding = new Array(1536).fill(0.5);
    vi.mocked(mockRedis.get).mockResolvedValueOnce(JSON.stringify(fakeEmbedding));

    const result = await generateEmbedding('cached question');
    expect(result).toEqual(fakeEmbedding);
  });
});
