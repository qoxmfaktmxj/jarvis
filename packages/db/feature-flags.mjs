// packages/db/feature-flags.mjs
// 중앙화된 DB 관련 feature flag 읽기. 모든 flag는 기본 false.
// (Runtime copy of feature-flags.ts for node:test runner)
export function featureDocumentChunksWrite() {
  return process.env.FEATURE_DOCUMENT_CHUNKS_WRITE === "true";
}
