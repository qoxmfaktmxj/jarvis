import { describe, expect, it } from "vitest";
import { evaluatePlanAcl } from "../acl-helpers";

/**
 * Unit tests for `evaluatePlanAcl` — Option B ACL semantics.
 *
 * Truth table (non-admin):
 *   acl row absent / null  → allow read & write
 *   canRead = true / null  → allow read
 *   canRead = false        → deny read
 *   canWrite = true        → allow write
 *   canWrite = false / null → deny write only when explicit false
 *
 * Admin bypasses all explicit denies.
 */
describe("evaluatePlanAcl — Option B semantics", () => {
  it("denies read when canRead = false (non-admin)", () => {
    expect(
      evaluatePlanAcl({ canRead: false, canWrite: true }, false, "read"),
    ).toBe(false);
  });

  it("denies write when canWrite = false (non-admin)", () => {
    expect(
      evaluatePlanAcl({ canRead: true, canWrite: false }, false, "write"),
    ).toBe(false);
  });

  it("allows write when canWrite = true (non-admin)", () => {
    expect(
      evaluatePlanAcl({ canRead: true, canWrite: true }, false, "write"),
    ).toBe(true);
  });

  it("allows read when canRead = null (only explicit false denies)", () => {
    expect(
      evaluatePlanAcl({ canRead: null, canWrite: null }, false, "read"),
    ).toBe(true);
  });

  it("allows read & write when no ACL row exists (undefined / null)", () => {
    expect(evaluatePlanAcl(undefined, false, "read")).toBe(true);
    expect(evaluatePlanAcl(null, false, "write")).toBe(true);
  });

  it("admin bypasses canRead = false", () => {
    expect(
      evaluatePlanAcl({ canRead: false, canWrite: false }, true, "read"),
    ).toBe(true);
  });

  it("admin bypasses canWrite = false", () => {
    expect(
      evaluatePlanAcl({ canRead: false, canWrite: false }, true, "write"),
    ).toBe(true);
  });

  // Workspace isolation is enforced upstream by the DB query (see
  // `listPlanViewPermissions` notExists filter and `checkPlanAcl` userId filter).
  // `evaluatePlanAcl` itself is intentionally pure and workspace-agnostic.
  it("does not depend on workspaceId — caller must pre-filter", () => {
    // signal that the function is workspace-agnostic by design
    expect(
      evaluatePlanAcl({ canRead: true, canWrite: true }, false, "read"),
    ).toBe(true);
  });
});
