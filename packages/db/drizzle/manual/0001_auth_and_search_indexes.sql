-- Migration: 0001_auth_and_search_indexes
-- Adds sso_subject unique constraint and search performance indexes

-- sso_subject unique constraint (safe to run on empty or existing data)
ALTER TABLE "user"
  ADD CONSTRAINT user_sso_subject_unique UNIQUE(sso_subject);

-- ============================================================
-- Search indexes (required for Plan 06 PgSearchAdapter)
-- ============================================================

-- knowledge_page: full-text search
CREATE INDEX IF NOT EXISTS idx_kp_search_vector
  ON knowledge_page USING GIN(search_vector);

-- knowledge_page: trigram fuzzy search on title
CREATE INDEX IF NOT EXISTS idx_kp_title_trgm
  ON knowledge_page USING GIN(title gin_trgm_ops);

-- knowledge_page: trigram fuzzy search on slug
CREATE INDEX IF NOT EXISTS idx_kp_slug_trgm
  ON knowledge_page USING GIN(slug gin_trgm_ops);

-- knowledge_claim: pgvector semantic search
-- lists=100 is a good starting point for up to ~1M rows
CREATE INDEX IF NOT EXISTS idx_kc_embedding
  ON knowledge_claim USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);

-- audit_log: full-text search
CREATE INDEX IF NOT EXISTS idx_al_search_vector
  ON audit_log USING GIN(search_vector);

-- search_log: analytics queries by workspace + time
CREATE INDEX IF NOT EXISTS idx_sl_workspace_created
  ON search_log(workspace_id, created_at DESC);
