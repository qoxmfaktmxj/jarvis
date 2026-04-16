# Manual Migrations

SQL files here are NOT managed by Drizzle Kit. Apply them manually via psql or a custom migration runner AFTER running `pnpm db:migrate`.

## Files

- `0001_auth_and_search_indexes.sql` — Legacy search indexes (GIN/trgm/ivfflat) from a pre-Phase-7A dev branch. NOT in the journal — superseded by the main migration chain. Kept for reference only.
