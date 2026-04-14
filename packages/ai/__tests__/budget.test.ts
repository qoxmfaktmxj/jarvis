import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();

vi.mock("@jarvis/db/client", () => ({
  db: { execute: executeMock },
}));

describe("assertBudget", () => {
  beforeEach(() => {
    executeMock.mockReset();
    process.env.LLM_DAILY_BUDGET_USD = "1.00";
  });

  it("passes under budget", async () => {
    executeMock.mockResolvedValue({ rows: [{ total: "0.25" }] });
    const { assertBudget } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).resolves.toBeUndefined();
  });

  it("throws BudgetExceededError over budget", async () => {
    executeMock.mockResolvedValue({ rows: [{ total: "1.50" }] });
    const { assertBudget, BudgetExceededError } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("uses default $10 when env missing", async () => {
    delete process.env.LLM_DAILY_BUDGET_USD;
    executeMock.mockResolvedValue({ rows: [{ total: "9.99" }] });
    const { assertBudget } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-000000000001"),
    ).resolves.toBeUndefined();
  });
});
