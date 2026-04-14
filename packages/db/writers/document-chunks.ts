import { featureDocumentChunksWrite } from "../feature-flags.js";
import type { NewDocumentChunk } from "../schema/document-chunks.js";

/**
 * Phase-7A PR#7 — document_chunks write path guard stub.
 *
 * 7A에서는 실제 insert 경로가 없다. 7B에서 이 함수에 실 insert를 붙일 예정.
 * 지금은 플래그 가드만 둬서 누군가가 "먼저" write를 시도할 경우 즉시 실패시킨다.
 */
export function writeChunks(_chunks: NewDocumentChunk[]): never {
  if (!featureDocumentChunksWrite()) {
    throw new Error(
      "document_chunks write path is disabled (FEATURE_DOCUMENT_CHUNKS_WRITE=false). " +
      "Phase-7B 이후 활성화 예정."
    );
  }
  throw new Error(
    "document_chunks write path is enabled via flag, but implementation is not landed yet (Phase-7B)."
  );
}
