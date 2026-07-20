import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { can, hasPermission } from "../rbac.js";

describe("rbac", () => {
  it("matches the fixed role matrix", () => {
    expect(can("READER", PERMISSIONS.WIKI_READ)).toBe(true);
    expect(can("READER", PERMISSIONS.WIKI_EDIT)).toBe(false);
    expect(can("EDITOR", PERMISSIONS.SOURCE_INGEST)).toBe(true);
    expect(can("ADMIN", PERMISSIONS.USER_ADMIN)).toBe(true);
  });

  it("checks session permissions directly", () => {
    expect(hasPermission({ permissions: [PERMISSIONS.WIKI_READ] }, PERMISSIONS.WIKI_READ)).toBe(true);
    expect(hasPermission({ permissions: [PERMISSIONS.WIKI_READ] }, PERMISSIONS.CODE_ADMIN)).toBe(false);
  });
});
