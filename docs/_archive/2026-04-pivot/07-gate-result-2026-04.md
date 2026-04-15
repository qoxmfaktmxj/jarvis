# Phase-7A Gate Result — 2026-04

**Status:** partial (G2 ✅ G5 ✅ / G1 G3 G4 G6 G7 pending CI)
**Date:** 2026-04-15
**Judge:** automated gate agent (G2+G5 local; G1/G3/G4/G6/G7 require CI PostgreSQL)

## Summary
- Lanes merged: A ✅ / B ✅ / C ✅ / D ✅
- Gates: G1 ⏳ G2 ✅ G3 ⏳ G4 ⏳ G5 ✅ G6 ⏳ G7 ⏳
- Decision: PENDING — G2+G5 verified locally; G1/G3/G4/G6/G7 require CI with PostgreSQL+OpenAI

## G1 — cost kill-switch
- Command: `pnpm eval:budget-test`
- Status: **⏳ PENDING-CI** — requires PostgreSQL (no local DB)
- Re-run in CI with `LLM_DAILY_BUDGET_USD=0.01`; expect `blocked_by=budget` row ≥1
- Verdict: ⏳ PENDING

## G2 — PII redactor unit
- Command: `pnpm --filter @jarvis/worker test pii-redactor`
- Expected: all cases pass (≥20), 0 failures
- Actual:
  ```
  RUN  v3.2.4

   ✓ src/lib/pii-redactor.test.ts (31 tests) 8ms

   Test Files  1 passed (1)
        Tests  31 passed (31)
     Start at  00:02:34
     Duration  1.14s (transform 393ms, setup 0ms, collect 404ms, tests 8ms, environment 0ms, prepare 364ms)
  ```
- Test count: 31 passed, 0 failed
- Verdict: ✅ PASS

## G3 — review_queue integration
- Command: `pnpm --filter @jarvis/worker test pii-flow`
- Status: **⏳ PENDING-CI** — requires PostgreSQL (no local DB)
- Verdict: ⏳ PENDING

## G4 — cross-workspace leakage
- Command: `pnpm test:integration -- cross-workspace-leakage`
- Status: **⏳ PENDING-CI** — requires PostgreSQL + pgvector (no local DB)
- Verdict: ⏳ PENDING

## G5 — schema-drift hook blocks
- Command: `node scripts/check-schema-drift.mjs --ci` (intentional drift probe)
- Test method: isolated worktree probe (per plan §Task 7)
- Probe results:
  - Baseline (mtime-synced, `touch _journal.json`): exit 0
  - With intentional drift (`echo "// G5 drift probe" >> packages/db/schema/knowledge.ts`): exit 1
- Drift detection output: `❌ [CI] Schema drift detected. packages/db/schema/*.ts가 마이그레이션보다 3초 앞서 있습니다.`
- Note: Integration branch itself shows mtime false-positive (schema files ~4s newer than journal after merge). Mitigated by `touch _journal.json`. Real drift is correctly caught.
- Verdict: ✅ PASS

## G6 — eval fixture baseline
- Command: `pnpm eval:run`
- Status: **⏳ PENDING-CI** — requires OpenAI API key
- Note: 30 eval fixtures exist in `apps/worker/eval/fixtures/2026-04/`
- Verdict: ⏳ PENDING

## G7 — llm_call_log completeness
- Command: manual smoke + SQL `SELECT COUNT(*) FROM llm_call_log`
- Status: **⏳ PENDING-CI** — requires PostgreSQL + live AI calls
- Verdict: ⏳ PENDING

## Overall

G2 ✅ G5 ✅ verified locally.
G1 G3 G4 G6 G7 require CI environment (PostgreSQL 16+pgvector, OpenAI API key).
Full pass confirmation blocked until CI run completes.

## 7B unlock record
- Feature flags / paths to be activated in 7B start PR:
  - `FEATURE_TWO_STEP_INGEST=true`
  - `FEATURE_HYBRID_SEARCH_MVP=true`
  - `wiki_*` write path activation
- Responsible person: (to-fill at 7B PR time)
- Target start date: (to-fill after full CI pass)

> Note: `FEATURE_DOCUMENT_CHUNKS_WRITE` defaults to `false` (wired in Lane C). Flip separately in 7B write-path PR. NOT part of 7B unlock conditions.

---

## Phase-7B Entry Record

**Date:** 2026-04-15
**Status:** LANDED — all Phase-7B features committed behind feature flags

### Features implemented (flags default `false` — flip in prod when ready)

| Flag | Feature | PR |
|------|---------|-----|
| `FEATURE_TWO_STEP_INGEST=true` | Chunk+embed raw_source → document_chunks; LLM synthesises knowledge_page(draft, generated) | d2068e4–a55d41e |
| `FEATURE_DOCUMENT_CHUNKS_WRITE=true` | Enables the upsertChunks write path (prerequisite for above) | dd75075 |
| `FEATURE_HYBRID_SEARCH_MVP=true` | BM25 + vector + RRF retrieval over document_chunks in askAI() | a8b0be1–08dfa77 |

### Review findings (all addressed in 08dfa77)
- **Critical fixed:** `retrieveChunkHybrid()` now applies `buildKnowledgeSensitivitySqlFilter(userPermissions)` — cross-clearance leakage closed
- **Important fixed:** chunk embeddings are now sequential (rate-limit safe); `ChunkSourceRef` wired into SSE sources event; defensive null guard on RRF map lookup
- **Minor fixed:** UUIDs removed from LLM extraction prompt

### Next: Phase-8 unlock condition
Both `7A all gates green` + `7B complete` required. 7B is now complete pending G6 eval baseline run and G7 manual smoke.
