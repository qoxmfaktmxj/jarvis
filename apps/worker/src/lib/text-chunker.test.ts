import { describe, it, expect } from 'vitest';
import { chunkText } from './text-chunker.js';

function makeWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk when text is shorter than chunkSize', () => {
    const text = makeWords(100);
    const result = chunkText(text, 300, 50);
    expect(result).toHaveLength(1);
    expect(result[0]!).toBe(text);
  });

  it('returns multiple chunks for long text', () => {
    const text = makeWords(700);
    const result = chunkText(text, 300, 50);
    // step = 300 - 50 = 250; ceil((700 - 300) / 250) + 1 = 3 chunks
    expect(result.length).toBeGreaterThan(1);
  });

  it('chunks have correct overlap — last words of chunk N equal first words of chunk N+1', () => {
    const text = makeWords(700);
    const result = chunkText(text, 300, 50);
    for (let i = 0; i < result.length - 1; i++) {
      const chunkWords = result[i]!.split(' ');
      const nextWords = result[i + 1]!.split(' ');
      const tail = chunkWords.slice(-50);
      const head = nextWords.slice(0, 50);
      expect(tail).toEqual(head);
    }
  });

  it('each chunk has at most chunkSize words', () => {
    const text = makeWords(1000);
    const result = chunkText(text, 300, 50);
    for (const chunk of result) {
      expect(chunk.split(' ').length).toBeLessThanOrEqual(300);
    }
  });
});
