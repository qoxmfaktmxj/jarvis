import type { LlmProvider } from "./types.js";
import { createDeterministicMockProvider } from "./providers/mock.js";
import { createOpenAiCompatibleProvider } from "./providers/openai.js";

export interface ProviderEnv {
  NODE_ENV?: string;
  LLM_MODE?: string;
  ALLOW_PRODUCTION_MOCK?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
}

export function createProvider(
  env: ProviderEnv,
  overrides: { fetchImpl?: typeof fetch; provider?: LlmProvider } = {},
): LlmProvider {
  if (overrides.provider) return overrides.provider;
  const parsed = parseProviderEnv(env);
  if (
    env.NODE_ENV === "production" &&
    parsed.LLM_MODE === "mock" &&
    env.ALLOW_PRODUCTION_MOCK !== "true"
  ) {
    throw new Error("LLM_MODE=mock is disabled in production");
  }
  if (parsed.LLM_MODE === "mock") {
    return createDeterministicMockProvider("default");
  }
  return createOpenAiCompatibleProvider({
    apiKey: parsed.OPENAI_API_KEY,
    baseUrl: parsed.OPENAI_BASE_URL,
    model: parsed.OPENAI_MODEL,
    fetchImpl: overrides.fetchImpl ?? fetch,
  });
}

function parseProviderEnv(env: ProviderEnv): {
  LLM_MODE: "mock" | "openai";
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
} {
  const mode = (env.LLM_MODE ?? "mock").trim().toLowerCase();
  if (mode !== "mock" && mode !== "openai") {
    throw new Error("LLM_MODE must be mock or openai");
  }
  if (mode === "mock") {
    return {
      LLM_MODE: "mock",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      OPENAI_MODEL: "",
    };
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  const baseUrl = env.OPENAI_BASE_URL?.trim();
  const model = env.OPENAI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    throw new Error("OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL are required when LLM_MODE=openai");
  }
  return {
    LLM_MODE: "openai",
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
    OPENAI_MODEL: model,
  };
}
