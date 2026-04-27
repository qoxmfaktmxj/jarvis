/**
 * @jarvis/wiki-agent
 *
 * Pure-TypeScript prompt builders and LLM-output parsers for the
 * Two-Step Chain-of-Thought ingest pipeline (WIKI-AGENTS.md §3.1).
 *
 * This package is stateless and free of network I/O: LLM invocation,
 * caching, logging, and DB projection live in the consumer layers
 * (`apps/worker/src/jobs/ingest/*`, `packages/ai/*`).
 */

export {
  PROMPT_VERSION,
  MIN_ALIASES,
  MAX_EXISTING_PAGES,
  MAX_SOURCE_CHARS,
  TRUNCATION_MARKER,
} from "./constants.js";

export type {
  ChatMessage,
  ExistingPage,
  AnalysisEntity,
  AnalysisConcept,
  AnalysisContradiction,
  AnalysisResult,
  FileBlock,
  ReviewBlock,
  GenerationOutput,
} from "./types.js";

export { buildAnalysisPrompt } from "./prompts/analysis.js";
export type { BuildAnalysisPromptInput } from "./prompts/analysis.js";

export { buildGenerationPrompt } from "./prompts/generation.js";
export type { BuildGenerationPromptInput } from "./prompts/generation.js";

export { ALIASES_CONTRACT } from "./prompts/aliases-contract.js";

export { parseFileBlocks } from "./parsers/file-block.js";
export { parseReviewBlocks } from "./parsers/review-block.js";

// ---------------------------------------------------------------------------
// Phase C — Karpathy LLM Wiki indexing/logging helpers (pure functions).
// Caller(wiki-fs / apps/worker) 가 실제 I/O 를 담당한다.
// ---------------------------------------------------------------------------
export { buildIndexMarkdown } from "./maintain-index.js";
export type {
  WikiPageMeta,
  MaintainIndexOptions,
} from "./maintain-index.js";

export {
  formatLogEntry,
  appendLogEntry,
  parseRecentLogHeaders,
} from "./append-log.js";
export type { LogEntry, LogEventType } from "./append-log.js";
