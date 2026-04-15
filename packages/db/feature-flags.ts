// packages/db/feature-flags.ts
// 중앙화된 DB 관련 feature flag 읽기. 모든 flag는 기본 false.
export function featureDocumentChunksWrite(): boolean {
  return process.env.FEATURE_DOCUMENT_CHUNKS_WRITE === "true";
}

export function featureTwoStepIngest(): boolean {
  return process.env.FEATURE_TWO_STEP_INGEST === "true";
}

export function featureHybridSearchMvp(): boolean {
  return process.env.FEATURE_HYBRID_SEARCH_MVP === "true";
}

/**
 * Phase-W2 T2: page-first navigation for `askAI`.
 *
 * When true, `packages/ai/ask.ts` routes the query through the page-first
 * pipeline (wiki_page_index lexical shortlist → 1-hop wikilink expansion →
 * disk read → LLM synthesis with `[[page-slug]]` citations).
 *
 * When false (default), the legacy knowledge_claim + document_chunks hybrid
 * retrieval path runs unchanged.
 */
export function featurePageFirstQuery(): boolean {
  return process.env.FEATURE_PAGE_FIRST_QUERY === "true";
}

/**
 * Phase-W2 T3: weekly wiki lint cron (`apps/worker/src/jobs/wiki-lint.ts`).
 *
 * When true, the worker registers the `wiki-lint-weekly` schedule (Sunday
 * 03:00 KST = Saturday 18:00 UTC = `0 18 * * 6`) and processes the queue
 * with the lint orchestrator. When false (default), the cron is not
 * registered so no lint runs occur — WIKI-AGENTS.md §3.3.
 */
export function featureWikiLintCron(): boolean {
  return process.env.FEATURE_WIKI_LINT_CRON === "true";
}

/**
 * Phase-W2 pivot: wiki-fs mode (Karpathy-first).
 *
 * When true, ingest writes to the wiki-fs layer (disk + git), and the wiki
 * page index (wiki_page_index) is the primary projection DB.
 *
 * When false (default), the legacy knowledge_page / document_chunks pipeline
 * runs unchanged.
 */
export function featureWikiFsMode(): boolean {
  return process.env.FEATURE_WIKI_FS_MODE === "true";
}

/**
 * Phase-W3: raw document_chunk query gate.
 *
 * When false (default), `retrieveChunkHybrid` in `packages/ai/ask.ts` is
 * disabled and throws immediately. Use `FEATURE_PAGE_FIRST_QUERY=true` for
 * the Karpathy-first wiki navigation path.
 *
 * Set to true only when explicitly reverting to the legacy RAG pipeline.
 * Will be removed entirely in Phase-W4 after document_chunks table DROP.
 */
export function featureRawChunkQuery(): boolean {
  return process.env.FEATURE_RAW_CHUNK_QUERY === "true";
}
