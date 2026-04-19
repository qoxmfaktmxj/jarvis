/**
 * packages/ai/breaker.ts
 *
 * Phase-W1.5 — lightweight circuit breaker around CLIProxyAPI gateway calls.
 *
 * Wraps a non-streaming `chat.completions.create` invocation. On 3
 * consecutive failures the circuit opens for 30 seconds, during which the
 * call is sent through the direct OPENAI_API_KEY client even when the
 * `FEATURE_SUBSCRIPTION_<OP>` flag is on. After the cooldown the gateway is
 * tried again — a single success closes the circuit.
 *
 * Streaming callers (`ask.ts`, `tutor.ts`, `page-first/synthesize.ts`)
 * import `getProvider()` directly because Opossum-style breakers play badly
 * with `AsyncIterable` streams; the existing per-call try/catch in those
 * paths is sufficient.
 *
 * No external dependency (e.g. opossum) — this module is small enough that
 * an in-process state machine costs less than a transitive package.
 */

import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { getProvider, type Operation } from "./provider.js";

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
}

const states = new Map<Operation, CircuitState>();

function state(op: Operation): CircuitState {
  let s = states.get(op);
  if (!s) {
    s = { consecutiveFailures: 0, openUntil: 0 };
    states.set(op, s);
  }
  return s;
}

function isOpen(op: Operation): boolean {
  return Date.now() < state(op).openUntil;
}

function recordSuccess(op: Operation): void {
  const s = state(op);
  s.consecutiveFailures = 0;
  s.openUntil = 0;
}

function recordFailure(op: Operation): void {
  const s = state(op);
  s.consecutiveFailures += 1;
  if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
    s.openUntil = Date.now() + COOLDOWN_MS;
    s.consecutiveFailures = 0;
  }
}

/**
 * Run a non-streaming chat completion through the gateway with automatic
 * direct-API fallback. The fallback fires either when the breaker is open
 * OR when the gateway call throws (the latter also feeds the breaker).
 */
export async function callChatWithFallback(
  op: Operation,
  params: ChatCompletionCreateParamsNonStreaming,
): Promise<ChatCompletion> {
  const callOnce = (client: OpenAI): Promise<ChatCompletion> =>
    client.chat.completions.create(params);

  if (isOpen(op)) {
    return callOnce(getProvider(op, true).client);
  }

  const primary = getProvider(op);
  try {
    const result = await callOnce(primary.client);
    if (primary.via === "gateway") recordSuccess(op);
    return result;
  } catch (err) {
    if (primary.via === "gateway") {
      recordFailure(op);
      return callOnce(getProvider(op, true).client);
    }
    throw err;
  }
}

/** Test-only — reset all per-op breaker state. */
export function __resetBreakerState(): void {
  states.clear();
}
