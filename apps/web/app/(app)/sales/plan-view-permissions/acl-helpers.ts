/**
 * Pure ACL helpers for sales plan-view-permissions.
 *
 * Extracted from `actions.ts` so the truth table is unit-testable without a DB
 * and so the synchronous export does not collide with Next 15's "use server"
 * file constraint (which only allows async exports — see CLAUDE.md memory note
 * `feedback_use_server_zod_export.md`).
 */

/**
 * Option B ACL semantics — pure evaluator (no DB):
 * - admin → always allowed (bypasses every explicit deny)
 * - no ACL row for (plan, user) → allowed (fall back to domain permission)
 * - ACL row with `canRead = true` (or null) → read allowed
 * - ACL row with `canRead = false` → read denied
 * - same for canWrite (write allowed unless explicit `canWrite = false`)
 *
 * "ACL row absent or null = allow" matches the list filter in
 * `listPlanViewPermissions` — keeps the three call sites (list / detail / save)
 * consistent.
 *
 * Note: this function is workspace-agnostic by design. The caller is expected
 * to pre-filter ACL rows by (planId, userId) within a workspace. See
 * `listPlanViewPermissions` / `checkPlanAcl` for upstream filters.
 */
export function evaluatePlanAcl(
  acl: { canRead: boolean | null; canWrite: boolean | null } | undefined | null,
  isAdmin: boolean,
  mode: "read" | "write",
): boolean {
  if (isAdmin) return true;
  if (!acl) return true;
  if (mode === "read") return acl.canRead !== false;
  return acl.canWrite !== false;
}
