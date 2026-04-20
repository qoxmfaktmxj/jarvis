import { describe, expect, it } from "vitest";
import { computeEffectiveSensitivity } from "./resolve-lineage.js";

describe("computeEffectiveSensitivity", () => {
  it("returns 'INTERNAL' for null origin (no attachment)", () => {
    expect(computeEffectiveSensitivity(null)).toBe("INTERNAL");
  });

  it("mirrors project.sensitivity for project origins", () => {
    expect(
      computeEffectiveSensitivity({ type: "project", sensitivity: "RESTRICTED" }),
    ).toBe("RESTRICTED");
    expect(
      computeEffectiveSensitivity({ type: "project", sensitivity: "INTERNAL" }),
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

  it("defaults null project/knowledge sensitivity to INTERNAL", () => {
    expect(
      computeEffectiveSensitivity({ type: "project", sensitivity: null }),
    ).toBe("INTERNAL");
    expect(
      computeEffectiveSensitivity({ type: "knowledge", sensitivity: null }),
    ).toBe("INTERNAL");
  });
});
