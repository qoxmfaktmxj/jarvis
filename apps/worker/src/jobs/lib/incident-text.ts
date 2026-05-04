const HTML_TAG_RE = /<(\/)?([a-zA-Z]*)(\s[a-zA-Z]*=[^>]*)?(\s)*(\/)?>/g;

export function stripHtml(input: string): string {
  return input.replace(HTML_TAG_RE, "");
}

export function splitByBytes(
  str: string,
  beginBytes: number,
  endBytes: number
): string {
  if (!str || endBytes < 0) return "";
  const safeBegin = Math.max(0, beginBytes);

  let curBytes = 0;
  let beginIndex = -1;
  let endIndex = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    const chBytes = Buffer.byteLength(ch, "utf-8");

    // Mark the start when we reach or exceed the beginning byte position
    if (beginIndex === -1 && curBytes >= safeBegin) {
      beginIndex = i;
    }

    // Advance curBytes and check if we should include this character
    curBytes += chBytes;

    // If we've started and are still within the range, mark the end
    if (beginIndex !== -1 && curBytes <= endBytes + 1) {
      endIndex = i + 1;
    }

    // Stop if we've exceeded the end range
    if (curBytes > endBytes) {
      break;
    }
  }

  if (beginIndex === -1) return "";
  return str.substring(beginIndex, endIndex);
}
