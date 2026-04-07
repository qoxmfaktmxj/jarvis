/**
 * Splits text into overlapping chunks of approximately `chunkSize` words.
 * @param text - Input text to chunk
 * @param chunkSize - Target words per chunk (default: 300)
 * @param overlap - Words to overlap between adjacent chunks (default: 50)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  chunkSize: number = 300,
  overlap: number = 50,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) return [];
  if (words.length <= chunkSize) return [words.join(' ')];

  const chunks: string[] = [];
  const step = chunkSize - overlap;
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start += step;
  }

  return chunks;
}
