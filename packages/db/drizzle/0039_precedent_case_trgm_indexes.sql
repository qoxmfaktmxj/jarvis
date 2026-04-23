-- Phase-Harness F (2026-04-23): precedent_case BM25/trigram 검색 인덱스.
-- migration 0037 로 embedding HNSW 를 드롭한 뒤 precedent-search adapter 가
-- title/symptom/cluster_label 에 pg_trgm similarity 를 사용하도록 바뀌었다.
-- btree 인덱스로는 similarity/ILIKE 가 가속되지 않으므로 GIN + gin_trgm_ops
-- 인덱스를 명시적으로 추가해 Lane B 검색이 전체 스캔으로 회귀하지 않게 한다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_precedent_case_title_trgm"
  ON "precedent_case" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_precedent_case_symptom_trgm"
  ON "precedent_case" USING GIN ("symptom" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_precedent_case_cluster_label_trgm"
  ON "precedent_case" USING GIN ("cluster_label" gin_trgm_ops);
