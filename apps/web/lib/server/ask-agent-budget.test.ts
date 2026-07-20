import { describe, expect, it } from "vitest";
import { resolveAskDailyBudgetUsd } from "./ask-agent-budget";

describe("resolveAskDailyBudgetUsd", () => {
  it("uses a bounded local default only in non-production mock mode", () => {
    expect(resolveAskDailyBudgetUsd({ NODE_ENV: "development", LLM_MODE: "mock" })).toBe("1");
  });

  it("fails closed when a real provider or production has no explicit budget", () => {
    expect(() => resolveAskDailyBudgetUsd({ NODE_ENV: "development", LLM_MODE: "openai" })).toThrow(/required/i);
    expect(() => resolveAskDailyBudgetUsd({ NODE_ENV: "production", LLM_MODE: "mock" })).toThrow(/required/i);
  });

  it("rejects non-positive and non-finite configured values", () => {
    expect(() => resolveAskDailyBudgetUsd({ NODE_ENV: "development", ASK_DAILY_BUDGET_USD: "0" })).toThrow(/positive finite/i);
    expect(() => resolveAskDailyBudgetUsd({ NODE_ENV: "development", ASK_DAILY_BUDGET_USD: "Infinity" })).toThrow(/positive finite/i);
  });
});
