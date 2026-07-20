import { describe, expect, it } from "vitest";
import { evaluateBudget } from "./eval-budget-test.js";

describe("evaluateBudget", () => {
  it("passes entries that stay within declared limits and flags overages", () => {
    const report = evaluateBudget([
      { label: "safe", promptTokens: 10, completionTokens: 5, maxTotalTokens: 20, actualCostUsd: 0.01, maxCostUsd: 0.02 },
      { label: "over", promptTokens: 50, completionTokens: 60, maxTotalTokens: 80, actualCostUsd: 0.15, maxCostUsd: 0.10 },
    ]);

    expect(report.violations.some((line: string) => line.includes("over"))).toBe(true);
  });

  it("fails empty input", () => {
    expect(evaluateBudget([]).violations).toContain("budget input must contain at least one entry");
  });
});
