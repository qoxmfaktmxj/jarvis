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

  const mode = (env.LLM_MODE ?? "mock").trim().toLowerCase();
  if (env.NODE_ENV === "production" || mode !== "mock") {
    throw new Error("ASK_DAILY_BUDGET_USD is required outside local mock mode");
  }
  return "1";
}
