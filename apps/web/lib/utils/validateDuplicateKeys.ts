/**
 * Composite-key duplicate detection over a row array. Mirrors legacy
 * ibsheet `dupChk(sheet, "k1|k2|k3")`. Returns each duplicate composite
 * key once (segments joined with "|").
 *
 * Note: NULL, undefined, and empty string ("") all coalesce to the same
 * empty key segment via `String(value ?? "")`. If your Postgres unique
 * constraint distinguishes NULL from "", pre-filter or normalize rows
 * before calling.
 */
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
