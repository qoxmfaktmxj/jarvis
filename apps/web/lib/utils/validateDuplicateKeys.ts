export function findDuplicateKeys<T extends Record<string, unknown>>(
  rows: readonly T[],
  keys: readonly (keyof T)[],
): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const row of rows) {
    const composite = keys.map((k) => String(row[k] ?? "")).join("|");
    if (seen.has(composite)) {
      dups.add(composite);
    } else {
      seen.add(composite);
    }
  }
  return Array.from(dups);
}
