import type { LlmProvider } from "./types.js";
import { createCliProxyProvider } from "./providers/cli-proxy.js";

export interface ProviderEnv {
  [key: string]: string | undefined;
  LLM_GATEWAY_URL?: string;
  LLM_GATEWAY_KEY?: string;
  ASK_AI_MODEL?: string;
}

export function createProvider(
  env: ProviderEnv,
  overrides: { fetchImpl?: typeof fetch; provider?: LlmProvider } = {},
): LlmProvider {
  if (overrides.provider) return overrides.provider;
  return createCliProxyProvider(env, {
    fetchImpl: overrides.fetchImpl,
  });
}
