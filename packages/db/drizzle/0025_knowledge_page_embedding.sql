-- Phase-W5 T2: page-level embedding column for Lane A hybrid search.
-- One embedding per knowledge_page (Karpathy "compiled page = unit"; no chunks).
-- HNSW index uses cosine distance (<=>) to match OpenAI text-embedding-3-small space.
ALTER TABLE "knowledge_page"
  ADD COLUMN "embedding" vector(1536),
  ADD COLUMN "last_embedded_at" timestamp with time zone;

CREATE INDEX "idx_knowledge_page_embedding_hnsw"
  ON "knowledge_page"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
