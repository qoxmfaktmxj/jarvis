/**
 * Shared types for @jarvis/wiki-agent.
 *
 * The agent is a pure-TS string manipulation layer:
 *   - `prompts/*`  — builds LLM messages (no network I/O)
 *   - `parsers/*`  — parses LLM output into structured records
 *
 * Network calls (OpenAI, Anthropic, caching, logging) live in
 * a separate `operations` module that consumes these types.
 */

// ─────────────────────────────────────────────────────────────
// Prompt I/O
// ─────────────────────────────────────────────────────────────

/** A single page's index entry. 15-item cap enforced at call site. */
export interface ExistingPage {
  /** Relative path from wiki root, e.g. "auto/concepts/휴가-정책.md" */
  path: string;
  /** Human readable title from frontmatter */
  title: string;
  /** Short summary (≤ 400 chars). Optional; falls back to title if absent. */
  summary?: string;
}

/** OpenAI-compatible chat message shape. */
export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

// ─────────────────────────────────────────────────────────────
// Analysis step (Step A) output contract
// ─────────────────────────────────────────────────────────────

export interface AnalysisEntity {
  name: string;
  type: string;
  aliases: string[];
}

export interface AnalysisConcept {
  name: string;
  summary: string;
  relatedPageIds: string[];
}

export interface AnalysisContradiction {
  pageA: string;
  pageB: string;
  description: string;
}

/** JSON the Analysis LLM must return (validated later with Zod). */
export interface AnalysisResult {
  keyEntities: AnalysisEntity[];
  keyConcepts: AnalysisConcept[];
  findings: string[];
  contradictions: AnalysisContradiction[];
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────
// Generation step (Step B) output contract — post-parsing
// ─────────────────────────────────────────────────────────────

/** Parsed ---FILE: path--- block. */
export interface FileBlock {
  /** Relative path from wiki workspace root. */
  path: string;
  /** Raw markdown body (including YAML frontmatter). */
  content: string;
  /**
   * Write mode hint. "append" is set by the parser only for log.md-like
   * special paths; all other blocks default to "overwrite".
   */
  mode?: "append" | "overwrite";
}

/** Parsed ---REVIEW: type | title--- block. */
export interface ReviewBlock {
  /** Lowercased review category (contradiction / duplicate / ...). */
  type: string;
  /** Short user-facing title. */
  title: string;
  /** Remaining body with meta lines removed. */
  body: string;
  /** Extracted OPTIONS labels. */
  options?: string[];
  /** Extracted PAGES entries (page path list). */
  pages?: string[];
  /** Extracted SEARCH queries. */
  search?: string[];
}

/** Convenience wrapper for callers that want both lists. */
export interface GenerationOutput {
  files: FileBlock[];
  reviews: ReviewBlock[];
}
