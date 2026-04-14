-- Phase-7A PR#7 supplement: IVFFlat ANN index on document_chunks.embedding.
-- cosine operator class matches OpenAI 1536d 임베딩의 저장 방식과 일치.
-- Note: Drizzle 0.45.x does not generate vector ANN indexes; added manually.
CREATE INDEX IF NOT EXISTS document_chunks_vec_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
