/**
 * packages/ai/provider.ts
 *
 * Phase-W1.5 — CLIProxyAPI Subscription Gateway hybrid provider.
 *
 * Returns an OpenAI SDK client per *operation*, routing optionally through
 * the CLIProxyAPI gateway (`http://cli-proxy:8317/v1`) when the corresponding
 * `FEATURE_SUBSCRIPTION_<OP>` flag is `true`. Otherwise falls back to
 * `OPENAI_API_KEY` direct calls — the existing behaviour.
 *
 * Operation policy (see docs/plan/2026-04-19-Jarvis_openai연동가이드.md §5):
 *   - ingest : default direct (ToS — automated/programmatic batch)
 *   - query  : safe to enable via OAuth (user-facing, conversational)
 *   - lint   : weekly cron, low volume → OK to OAuth
 *   - graph  : never goes through gateway (Graphify is deterministic, no LLM)
 *
 * Embeddings (`text-embedding-3-*`) and search-side calls intentionally
 * remain on the direct OPENAI_API_KEY path — CLIProxyAPI advertises chat /
 * responses / messages endpoints; embeddings support is unverified.
 */

import OpenAI from "openai";

export type Operation = "ingest" | "query" | "lint" | "graph";

const GATEWAY_URL =
  process.env["LLM_GATEWAY_URL"] ?? "http://cli-proxy:8317/v1";
const REQUEST_TIMEOUT_MS = 120_000;

function flag(op: Operation): boolean {
  switch (op) {
    case "ingest":
      return process.env["FEATURE_SUBSCRIPTION_INGEST"] === "true";
    case "query":
      return process.env["FEATURE_SUBSCRIPTION_QUERY"] === "true";
    case "lint":
      return process.env["FEATURE_SUBSCRIPTION_LINT"] === "true";
    case "graph":
      return false;
  }
}

let _direct: OpenAI | null = null;
let _gateway: OpenAI | null = null;

function directClient(): OpenAI {
  if (!_direct) {
    _direct = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  return _direct;
}

function gatewayClient(): OpenAI {
  if (!_gateway) {
    const gatewayKey =
      process.env["LLM_GATEWAY_KEY"] ?? process.env["CLIPROXY_API_KEY"];
    if (!gatewayKey) {
      throw new Error(
        "LLM_GATEWAY_KEY or CLIPROXY_API_KEY env var is required when subscription gateway is enabled"
      );
    }
    _gateway = new OpenAI({
      baseURL: GATEWAY_URL,
      apiKey: gatewayKey,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  return _gateway;
}

export interface ResolvedProvider {
  client: OpenAI;
  via: "gateway" | "direct";
}

/**
 * Resolve the OpenAI client for an operation.
 *
 * @param op           Operation tag — controls feature-flag lookup.
 * @param forceDirect  When true, bypass the gateway regardless of flag
 *                     (used by `breaker.ts` after circuit-open events).
 */
export function getProvider(
  op: Operation,
  forceDirect = false,
): ResolvedProvider {
  if (forceDirect || op === "graph" || !flag(op)) {
    return { client: directClient(), via: "direct" };
  }
  return { client: gatewayClient(), via: "gateway" };
}

/**
 * Map Jarvis legacy model ids onto whatever the gateway exposes.
 *
 * The gateway's `oauth-model-alias.codex` block (see
 * `infra/cliproxy/config.yaml`) already maps `gpt-5-codex-mini` →
 * `gpt-5.4-mini`, so this helper is mostly a no-op for the common case;
 * keeping the table here lets future model rotations stay app-side without
 * touching `config.yaml`.
 */
const MODEL_ALIASES: Record<string, string> = {};

export function resolveModel(_op: Operation, requested?: string): string {
  const raw =
    requested ?? process.env["ASK_AI_MODEL"] ?? "gpt-5.4-mini";
  return MODEL_ALIASES[raw] ?? raw;
}

/**
 * Test-only: clear cached singletons so an env-var override in a test
 * actually takes effect. Not exported via the package barrel.
 */
export function __resetProviderCache(): void {
  _direct = null;
  _gateway = null;
}
