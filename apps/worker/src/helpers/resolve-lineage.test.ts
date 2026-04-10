import { describe, expect, it } from "vitest";
import { computeEffectiveSensitivity } from "./resolve-lineage.js";

describe("computeEffectiveSensitivity", () => {
  it("returns 'INTERNAL' for null origin (no attachment)", () => {
    expect(computeEffectiveSensitivity(null)).toBe("INTERNAL");
  });

  it("returns 'INTERNAL' for project (projects have no sensitivity field in P0)", () => {
    expect(
      computeEffectiveSensitivity({ type: "project", sensitivity: null }),
    ).toBe("INTERNAL");
  });

  it("mirrors system.sensitivity for system origins", () => {
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: "RESTRICTED" }),
    ).toBe("RESTRICTED");
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: "INTERNAL" }),
    ).toBe("INTERNAL");
  });

  it("mirrors knowledge_page.sensitivity for knowledge origins", () => {
    expect(
      computeEffectiveSensitivity({ type: "knowledge", sensitivity: "PUBLIC" }),
    ).toBe("PUBLIC");
    expect(
      computeEffectiveSensitivity({
        type: "knowledge",
        sensitivity: "SECRET_REF_ONLY",
      }),
    ).toBe("SECRET_REF_ONLY");
  });

  it("defaults null system/knowledge sensitivity to INTERNAL", () => {
    expect(
      computeEffectiveSensitivity({ type: "system", sensitivity: null }),
    ).toBe("INTERNAL");
    expect(
      computeEffectiveSensitivity({ type: "knowledge", sensitivity: null }),
    ).toBe("INTERNAL");
  });
});
