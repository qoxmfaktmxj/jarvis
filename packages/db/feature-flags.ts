// packages/db/feature-flags.ts
// 중앙화된 DB 관련 feature flag 읽기. 모든 flag는 기본 false.
export function featureDocumentChunksWrite(): boolean {
  return process.env.FEATURE_DOCUMENT_CHUNKS_WRITE === "true";
}
