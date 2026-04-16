// packages/db/feature-flags.ts
// 중앙화된 DB 관련 feature flag 읽기. 각 함수의 JSDoc에 기본값이 명시되어 있습니다.

export function featureTwoStepIngest(): boolean {
  return process.env.FEATURE_TWO_STEP_INGEST === "true";
}

/**
 * Phase-W2 T2: page-first navigation for `askAI`.
 *
 * When true (default since B4 Phase 2), `packages/ai/ask.ts` routes the
 * query through the page-first pipeline (wiki_page_index lexical shortlist
 * → 1-hop wikilink expansion → disk read → LLM synthesis with
 * `[[page-slug]]` citations).
 *
 * When false, the legacy knowledge_claim hybrid retrieval path runs
 * unchanged.
 *
 * @defaultValue true (`FEATURE_PAGE_FIRST_QUERY !== 'false'`)
 */
export function featurePageFirstQuery(): boolean {
  return process.env['FEATURE_PAGE_FIRST_QUERY'] !== 'false';
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
 * When false (default), the legacy knowledge_page pipeline runs unchanged.
 */
export function featureWikiFsMode(): boolean {
  return process.env.FEATURE_WIKI_FS_MODE === "true";
}
