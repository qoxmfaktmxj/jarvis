export {
  PROMPT_VERSION,
  MIN_ALIASES,
  MAX_EXISTING_PAGES,
  MAX_SOURCE_CHARS,
  TRUNCATION_MARKER,
} from "./constants.js";

export {
  analysisResultSchema,
  evidenceFindingSchema,
  fileBlockSchema,
  generationOutputSchema,
  reviewBlockSchema,
} from "./types.js";

export type {
  AnalysisResult,
  ChatMessage,
  EvidenceFinding,
  ExistingPage,
  FileBlock,
  GenerationOutput,
  ReviewBlock,
} from "./types.js";

export { buildAnalysisPrompt } from "./prompts/analysis.js";
export type { BuildAnalysisPromptInput } from "./prompts/analysis.js";
export { buildGenerationPrompt } from "./prompts/generation.js";
export type { BuildGenerationPromptInput } from "./prompts/generation.js";
export { ALIASES_CONTRACT } from "./prompts/aliases-contract.js";
export { parseFileBlocks } from "./parsers/file-block.js";
export { parseReviewBlocks } from "./parsers/review-block.js";
export { buildIndexMarkdown } from "./maintain-index.js";
export type { MaintainIndexOptions, WikiPageMeta } from "./maintain-index.js";
export { appendLogEntry, formatLogEntry } from "./append-log.js";
export type { LogEntry, LogEventType } from "./append-log.js";
