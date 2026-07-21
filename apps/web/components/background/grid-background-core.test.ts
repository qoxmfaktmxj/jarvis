import { describe, expect, it } from "vitest";
import { capDpr, createOrthogonalEdges, hashCell, nextGridMode } from "./grid-background-core";

describe("grid background core", () => {
  it("alternates after the first random selection", () => {
    expect(nextGridMode(null, 0.1)).toBe("blinking");
    expect(nextGridMode(null, 0.9)).toBe("kinetic");
    expect(nextGridMode("blinking", 0.1)).toBe("kinetic");
    expect(nextGridMode("kinetic", 0.9)).toBe("blinking");
  });

  it("uses deterministic hashes and orthogonal-only edges", () => {
    expect(hashCell(3, 5)).toBe(hashCell(3, 5));
    expect(createOrthogonalEdges(3, 2)).toHaveLength(7);
  });

  it("caps device pixel ratio at two", () => {
    expect(capDpr(0.5)).toBe(1);
    expect(capDpr(3)).toBe(2);
  });
});
