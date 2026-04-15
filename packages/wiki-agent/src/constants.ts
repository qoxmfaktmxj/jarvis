/**
 * Prompt version — bump whenever prompts change so that the
 * `llm_cache` key invalidates correctly and we can attribute
 * quality regressions to a specific revision.
 *
 * Format: "YYYY-MM-DD-vN".
 */
export const PROMPT_VERSION = "2026-04-15-v1" as const;

/**
 * Minimum number of aliases that every generated wiki page's
 * frontmatter must declare. This is the hard rule that prevents
 * the MindVault "마인드볼트 ≠ MindVault" regression.
 *
 * Validator and prompt contract both depend on this constant.
 */
export const MIN_ALIASES = 3;

/**
 * Maximum number of existing pages that we feed into the
 * Analysis / Generation prompts. Larger indexes are truncated
 * by the caller before invocation to keep token budget bounded.
 */
export const MAX_EXISTING_PAGES = 15;

/**
 * Maximum characters of raw source content embedded in a single
 * prompt. Callers MUST truncate longer input and append the
 * canonical "[...truncated...]" marker so that the LLM knows the
 * upstream was cut.
 */
export const MAX_SOURCE_CHARS = 50_000;

/**
 * Marker appended to truncated source text.
 */
export const TRUNCATION_MARKER = "\n\n[...truncated...]";
