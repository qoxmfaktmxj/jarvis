# Manual Migrations

SQL files here are NOT managed by Drizzle Kit. Apply them manually via psql or a custom migration runner AFTER running `pnpm db:migrate`.

## Files

- `0011_document_chunks_ivfflat.sql` — IVFFlat ANN index for `document_chunks.embedding`. Drizzle 0.45.x does not generate vector ANN indexes automatically. Apply once after `document_chunks` table exists.
- `0001_auth_and_search_indexes.sql` — Legacy search indexes (GIN/trgm/ivfflat) from a pre-Phase-7A dev branch. NOT in the journal — superseded by the main migration chain. Kept for reference only.
