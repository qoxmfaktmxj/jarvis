/**
 * Recharts formatter helpers — recharts v3 ValueType is
 * `string | number | readonly (string|number)[] | undefined`, so a
 * `(v: number) => string` formatter fails strict typing. These wrappers coerce safely.
 */
type ValueLike = string | number | readonly (string | number)[] | undefined | null;

export const fmtKR = (v: ValueLike): string => {
  if (typeof v === "number" && Number.isFinite(v)) return v.toLocaleString("ko-KR");
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "");
};
