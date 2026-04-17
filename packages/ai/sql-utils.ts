import { sql, type SQL } from "drizzle-orm";

/**
 * drizzle's sql template inlines a JS array as separate placeholders, which
 * Postgres parses as a record literal `($1, $2, ...)` — breaking
 * `ANY(...)` / `unnest(...)` / array casts. Wrap with this helper to emit
 * `ARRAY[$1, $2, ...]::<type>[]` instead.
 */
export type PgArrayType = "text" | "uuid";

export function pgArray(
  values: readonly string[],
  type: PgArrayType = "text",
): SQL {
  if (values.length === 0) return sql.raw(`'{}'::${type}[]`);
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql.raw(", "),
  )}]::${sql.raw(`${type}[]`)}`;
}

export function pgTextArray(values: readonly string[]): SQL {
  return pgArray(values, "text");
}
