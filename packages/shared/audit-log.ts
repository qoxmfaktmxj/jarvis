/**
 * Shared audit-log helper.
 *
 * Standardizes audit_log inserts across all Jarvis domains. Centralizes:
 *   1. Masking of sensitive keys (password, token, secret, etc.) in `details`.
 *   2. Optional `before` / `after` diff generation for update paths.
 *   3. Consistent shape (action / resourceType / resourceId / details / success).
 *
 * Usage:
 *   import { writeAuditLog } from "@jarvis/shared/audit-log";
 *
 *   await db.transaction(async (tx) => {
 *     // ... mutation ...
 *     await writeAuditLog(tx, {
 *       workspaceId, userId,
 *       action: "notice.update",
 *       resourceType: "notice",
 *       resourceId: notice.id,
 *       before, after,                 // diff auto-generated in details.diff
 *     });
 *   });
 *
 * The helper accepts a Drizzle `Tx` (or top-level `db`) via duck-typed
 * `{ insert(table).values(row) }`. This avoids a workspace cycle from
 * @jarvis/shared → @jarvis/db (currently shared has no db dependency).
 *
 * Callers are responsible for passing the auditLog table reference because the
 * shared package cannot import from @jarvis/db without breaking the dependency
 * direction. Use the convenience wrapper in @jarvis/db (TBD) or pass auditLog
 * inline.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Keys whose values should be replaced with `[REDACTED]` in audit_log.details.
 * Case-insensitive substring match — e.g. "passwordHash", "PASSWORD_HASH",
 * "apiKey", "api_key", "auth_token", "credential_id" all match.
 *
 * Tune carefully — false positives degrade audit usefulness; false negatives
 * leak secrets.
 */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "passwordhash",
  "pwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "credential",
  "private_key",
  "privatekey",
  "session_key",
  "sessionkey",
  "auth_token",
  "access_token",
  "refresh_token",
  "client_secret",
  "passwordref",
  "password_ref",
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-_]/g, "");
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p.replace(/[-_]/g, "")));
}

/**
 * Recursively mask sensitive keys in any JSON-shaped value.
 *
 * Behavior:
 *  - Primitives (string/number/boolean/null/undefined) pass through.
 *  - Arrays mask each element.
 *  - Plain objects mask values for any key matching SENSITIVE_KEY_PATTERNS.
 *  - Cycles are tracked by WeakSet to avoid infinite recursion.
 *  - Non-plain objects (Date, Map, etc.) pass through unchanged — callers
 *    should serialize them before passing if they contain secrets.
 */
export function maskSensitive<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  // Avoid cycles.
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => maskSensitive(v, seen)) as unknown as T;
  }

  // Only mask plain objects (Object.prototype or null prototype). Skip Date,
  // Map, custom class instances — passing those through unchanged.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = maskSensitive(v, seen);
    }
  }
  return out as unknown as T;
}

/**
 * Build a shallow diff between `before` and `after` objects for audit purposes.
 *
 * Returns `null` if either input is missing or not a plain object.
 *
 * Output shape:
 *   { changed: ["field1", "field2"], before: { field1: ... }, after: { field1: ... } }
 *
 * Values are masked via maskSensitive — keys themselves are reported even when
 * sensitive (so audit consumers know the change happened), but values are
 * redacted.
 *
 * Only top-level keys are diffed (sufficient for typical CRUD patch objects).
 * For deep diffs, callers should pre-process.
 */
export function buildDiff(
  before: unknown,
  after: unknown,
): { changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> } | null {
  if (
    before === null ||
    before === undefined ||
    after === null ||
    after === undefined ||
    typeof before !== "object" ||
    typeof after !== "object"
  ) {
    return null;
  }
  // Skip arrays and non-plain objects.
  if (Array.isArray(before) || Array.isArray(after)) return null;
  const bProto = Object.getPrototypeOf(before);
  const aProto = Object.getPrototypeOf(after);
  if (bProto !== Object.prototype && bProto !== null) return null;
  if (aProto !== Object.prototype && aProto !== null) return null;

  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed: string[] = [];
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};

  for (const k of keys) {
    if (!Object.is(b[k], a[k])) {
      changed.push(k);
      beforeOut[k] = isSensitiveKey(k) ? REDACTED : maskSensitive(b[k]);
      afterOut[k] = isSensitiveKey(k) ? REDACTED : maskSensitive(a[k]);
    }
  }

  return { changed, before: beforeOut, after: afterOut };
}

/**
 * Standard audit-log input shape.
 *
 * Either provide `details` directly, or provide `before` + `after` (or both —
 * `before`/`after` are appended into `details.diff` and don't overwrite
 * `details` keys).
 */
export interface AuditLogInput {
  workspaceId: string;
  userId: string | null;
  /** Stable dot-namespaced verb. e.g. `notice.create`, `project.update.sensitivity`. */
  action: string;
  /** snake_case table or domain name. e.g. `notice`, `project`, `infra_system`. */
  resourceType: string;
  /** Target row id (UUID). Optional for batch / non-row events (e.g. excel_import). */
  resourceId?: string | null;
  /** Additional context. Masked recursively before insert. */
  details?: unknown;
  /** Pre-mutation state (top-level shallow). Diff'd vs `after` into `details.diff`. */
  before?: unknown;
  /** Post-mutation state. */
  after?: unknown;
  /** Defaults to `true`. Set `false` only when the mutation itself failed. */
  success?: boolean;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Drizzle `Tx` interface duck-typed to avoid @jarvis/shared → @jarvis/db import.
 * Both `db` and the `tx` argument inside `db.transaction(async tx => …)` satisfy
 * this.
 */
export interface AuditTx {
  insert: (table: any) => {
    values: (row: any) => Promise<unknown> | { onConflictDoNothing?: () => Promise<unknown> };
  };
}

/**
 * Build the audit_log row payload from a standard AuditLogInput.
 *
 * Returns the values object suitable for `tx.insert(auditLog).values(...)`.
 * Extracted so writeAuditLog can also be unit-tested without a real Drizzle Tx.
 */
export function buildAuditLogRow(input: AuditLogInput): {
  workspaceId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  success: boolean;
  errorMessage: string | null;
} {
  const maskedDetails = maskSensitive(input.details ?? {}) as Record<string, unknown> | unknown;
  // Guarantee details is a plain object so jsonb column gets {} not "scalar".
  const detailsObj: Record<string, unknown> =
    maskedDetails && typeof maskedDetails === "object" && !Array.isArray(maskedDetails)
      ? { ...(maskedDetails as Record<string, unknown>) }
      : { value: maskedDetails };

  // If both before+after present, attach a diff under details.diff (don't overwrite).
  if (input.before !== undefined || input.after !== undefined) {
    const diff = buildDiff(input.before, input.after);
    if (diff && diff.changed.length > 0 && detailsObj["diff"] === undefined) {
      detailsObj["diff"] = diff;
    }
  }

  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    details: detailsObj,
    success: input.success ?? true,
    errorMessage: input.errorMessage ?? null,
  };
}

/**
 * Standard audit-log writer. Inserts one row into the provided audit_log table.
 *
 * The caller passes the audit_log table reference (`auditLog` from
 * `@jarvis/db/schema`) because @jarvis/shared cannot import @jarvis/db without
 * inverting the dependency direction.
 *
 * Always operates inside the provided tx (or top-level db). For multi-row
 * audits, batch via `auditTable.values([row1, row2, ...])` — use
 * `buildAuditLogRow` to construct each row.
 *
 * @example
 *   import { auditLog } from "@jarvis/db/schema";
 *   import { writeAuditLog } from "@jarvis/shared/audit-log";
 *
 *   await db.transaction(async (tx) => {
 *     await writeAuditLog(tx, auditLog, {
 *       workspaceId, userId,
 *       action: "notice.update",
 *       resourceType: "notice",
 *       resourceId: notice.id,
 *       before, after,
 *     });
 *   });
 */
export async function writeAuditLog(
  tx: AuditTx,
  auditTable: any,
  input: AuditLogInput,
): Promise<void> {
  const row = buildAuditLogRow(input);
  // Drizzle: tx.insert(auditTable).values(row) — fire and ignore returned value.
  // We don't return rows; callers shouldn't depend on the audit insert result.
  await tx.insert(auditTable).values(row);
}
