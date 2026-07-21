export function resolveAskDailyBudgetUsd(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const configured = env.ASK_DAILY_BUDGET_USD?.trim();
  if (configured) {
    const value = Number(configured);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("ASK_DAILY_BUDGET_USD must be a positive finite number");
    }
    return configured;
  }

  if (env.NODE_ENV !== "production") return "1";
  throw new Error("ASK_DAILY_BUDGET_USD is required in production");
}
