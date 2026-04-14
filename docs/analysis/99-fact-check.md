# Fact-Check Report — Integration Plan (99-integration-plan.md)

**Checked against**: Jarvis codebase at `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\jolly-antonelli`
**Date**: 2026-04-14
**Method**: Direct file inspection, grep, ls. No guesses.

---

## Summary

- **Total claims verified**: ~40
- **Correct**: 18
- **Incorrect (P0 — must fix)**: 10
- **Incorrect (P1 — should fix)**: 7
- **Uncertain (needs human)**: 2

---

## P0 Errors (must fix)

| Location in plan | Claim | Actual | Fix |
|------------------|-------|--------|-----|
| §2.5, §3.3, §5.2, §10.1 D1/D3, §10.2 D1/D1/D2/D2 (8 occurrences) | Path is `packages/db/src/schema/…` | Actual path is `packages/db/schema/` (no `src/`). Confirmed via `packages/db/package.json` exports `./schema/*": "./schema/*.ts` and `drizzle.config.ts` → `schema: "./schema/index.ts"`. | Remove `/src` everywhere: `packages/db/schema/llm-cache.ts`, `packages/db/schema/embeddings.ts`, `packages/db/schema/_common.ts`, `packages/db/schema/wiki-sources.ts`, etc. |
| §6.2, §6.4, §6.5, §9.3, §10.3 D4/D5, §10.4 D2/D4 (8 occurrences) | Paths `apps/web/src/components/...`, `apps/web/src/app/(app)/...`, `apps/web/src/app/(admin)/...` | `apps/web/src/` **does not exist**. Real paths: `apps/web/components/`, `apps/web/app/(app)/`, `apps/web/app/api/`, `apps/web/lib/`. No `src/` dir in `apps/web`. | Remove `/src` everywhere in `apps/web/…` paths. E.g. `apps/web/components/editor/WikiEditor.tsx`, `apps/web/app/(admin)/observability/cost/page.tsx`. |
| §2.5 line 174 | `import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';` — no `vector` import issue there, but §3.3 uses `vector('embedding', { dimensions: 1536 })` | Jarvis does NOT use drizzle-orm's built-in vector type. Every schema file (`packages/db/schema/knowledge.ts:21-25`, `packages/db/schema/case.ts:22-27`) defines vector via `customType<{…}>` returning `dataType: () => "vector(1536)"`. Plan's syntax would compile but diverges from project pattern. | Change §3.3 `documentChunks.embedding` to use the project's `customType` pattern, identical to `knowledge.ts:21-25`. Copy-paste the existing `const vector = customType<...>` declaration. |
| §2.5, §3.3, §5.2 multiple | `sensitivityEnum('sensitivity')` and `sensitivity: sensitivityEnum('sensitivity').notNull().default('internal')` | `sensitivityEnum` **does not exist** anywhere. Jarvis stores sensitivity as `varchar("sensitivity", { length: 30 }).default("INTERNAL").notNull()` (confirmed in `case.ts:79`, `graph.ts:43`, `knowledge.ts:39`, `system.ts:26`). Values are UPPERCASE: `PUBLIC`, `INTERNAL`, `RESTRICTED`, `SECRET_REF_ONLY` (per `docs/CURRENT_STATE.md:144-151`). | Replace all `sensitivityEnum(...)` with `varchar("sensitivity", { length: 30 }).notNull().default("INTERNAL")`. If an enum is desired, **create it and add a migration first** — currently it is not defined. |
| §5.2 wikiSources, §5.2 wikiConcepts, §5.2 wikiEdges | `pgEnum('source_kind', [...])('kind')`, `pgEnum('confidence_enum_concepts', [...])('confidence')` — inline usage inside column def | Jarvis defines pgEnum as top-level `export const`, then uses it: see `packages/db/schema/graph.ts:19-26` where `buildStatusEnum = pgEnum(...)` is declared separately, then used as `buildStatusEnum('status')`. The inline pattern may work in Drizzle but conflicts with project style and will trigger schema-drift hook re-generation. | Declare enums at top of file with `export const sourceKindEnum = pgEnum('source_kind', [...])`, then use `sourceKindEnum('kind')`. |
| §10.1 D1 | `0010_llm_cache.sql` is the next migration filename | Actual highest migration: **`0008_yellow_bloodaxe.sql`**. There are 10 `.sql` files but one is a manually-added `0001_auth_and_search_indexes.sql` not in `_journal.json`. `_journal.json` has idx 0-8 (9 entries). Next auto-generated would be **`0009`**, not `0010`. | Change D1 to `0009_llm_cache.sql`. Cascade: `0010_document_chunks.sql`, `0011_wiki_sources.sql`, `0012_wiki_concepts.sql`, `0013_wiki_syntheses.sql`, `0014_directory_ext.sql`, `0015_review_queue_kind.sql`. Also note: drizzle-kit picks the names automatically; do not hard-code except in plan copy. |
| Introduction §TL;DR line 16, §2.2, §12 | Plan repeatedly calls graphify "Python subprocess" | `apps/worker/src/jobs/graphify-build.ts:20-22` spawns via `execFile` with `GRAPHIFY_BIN=graphify` (generic binary). It uses `GRAPHIFY_MODEL=claude-haiku-4-5-20251001` and `ANTHROPIC_API_KEY`. It is a **native binary subprocess**, not Python-specific. | Rephrase as "graphify subprocess (binary via `execFile`, defaults to Claude Haiku)". Also note that Anthropic SDK removal in §2.2/§12/§13 is safe in **application code** but `ANTHROPIC_API_KEY` env var and docker secret remain required for graphify binary. |
| §9.1, §10.4 D3 | `packages/logger/` new package | No existing `packages/logger/`. Safe to create (good). However, confirm no collision with existing helper in `@jarvis/shared`. | Verified no collision with `packages/shared/`. This claim is fine; included as "correct" but flagged for the planner to double-check `packages/shared/` first. |
| §1.1 Q4, §11 row 1 | Uses `@jarvis/db` import style `from '@jarvis/db'` (implicit in code snippets) | Confirmed package name is `@jarvis/db` with exports `./client`, `./schema`, `./schema/*`. Plan's snippet `cachedLLMCall` uses `db.select().from(llmCache)…` — but `db` must be imported from `@jarvis/db/client`. | Add explicit import line: `import { db } from '@jarvis/db/client';` and `import { llmCache } from '@jarvis/db/schema/llm-cache';` (note: no `/src`). |
| §13 line 838 | Proposes `OPENAI_MODEL_SYNTHESIS=gpt-4.1` and `OPENAI_MODEL_UTILITY=gpt-4.1-mini` as **new** env vars | `.env.example:33` already has **`ASK_AI_MODEL=gpt-4.1-mini`**, which is the existing mini-model env var. Adding `OPENAI_MODEL_UTILITY` creates a second source of truth. | Either (a) rename `ASK_AI_MODEL` → `OPENAI_MODEL_UTILITY` in a dedicated migration (touches `packages/ai/ask.ts:42`, `packages/ai/tutor.ts:10`), OR (b) keep `ASK_AI_MODEL` and add only `OPENAI_MODEL_SYNTHESIS`. Plan should mention the existing variable. |

---

## P1 Inaccuracies

| Location | Claim | Actual | Fix |
|----------|-------|--------|-----|
| §3.3 line 282+ | `documentChunks` table uses `uuid('id').defaultRandom().primaryKey()` + `workspaceId: uuid('workspace_id').notNull()` with no FK | Project pattern (see `knowledge.ts:32-34`, `case.ts:40-43`) always adds FK: `.references(() => workspace.id, { onDelete: "cascade" })` for `workspaceId`. | Add `.references(() => workspace.id, { onDelete: "cascade" })` to `workspaceId` columns in all new schemas (documentChunks, wikiSources, wikiConcepts, wikiSyntheses, wikiEdges). |
| §5.2, §3.3 | All new table `createdAt` use `timestamp('created_at').defaultNow().notNull()` — no `withTimezone` | Project convention is **`timestamp("created_at", { withTimezone: true }).defaultNow().notNull()`** (see `knowledge.ts:42`, `case.ts:83`, everywhere). Missing `{ withTimezone: true }` would cause inconsistency and may trigger drift hook. | Add `{ withTimezone: true }` to every timestamp() column in plan. |
| §3.3 line 297 | `index('document_chunks_vec_idx').using('ivfflat', t.embedding.op('vector_cosine_ops'))` | This drizzle syntax may work but Jarvis currently has no ivfflat index in source — vector indexes are defined via raw SQL in migration files (confirmed no `.using('ivfflat'` in `packages/db/schema/`). This is a pattern-break, not an error; keep Drizzle schema clean and declare index in raw migration SQL. | Move the ivfflat index to the SQL migration file (`0010_document_chunks.sql`), not the Drizzle table def. |
| §10.3 D2 | "CJK 토크나이저 PG FTS 설정 업데이트 | SQL migration | mindvault `index.py:13-40` 포팅" | Jarvis currently uses `tsvectorType` in `knowledge.ts:27-29` with `to_tsvector('korean', ...)` pattern (see §5.2 line 484 in plan). There is NO custom Korean tokenizer config in current project; adding one is a real infra change (PostgreSQL needs `pg_bigm` or custom dictionary). | Add a risk entry in §11: "PG korean text-search config may require `pg_bigm` extension or `unaccent` + custom dictionary. Confirm Docker image + migration path." |
| §2.3 directory structure | `packages/prompts/` has `src/ingest/`, `src/search/`, etc. | All existing packages (`packages/ai/`, `packages/search/`, `packages/db/`, `packages/auth/`, `packages/shared/`, `packages/secret/`) use **flat** layout (no `src/`). E.g. `packages/ai/ask.ts` not `packages/ai/src/ask.ts`. | For consistency, remove `src/` from new package layouts in §2.3 and §3.3: use `packages/prompts/ingest/`, `packages/chunker/regex.ts`, `packages/core/llm/cached-call.ts`, `packages/search/pipeline/` etc. |
| §4.2 directory tree | `packages/search/src/pipeline/`, `packages/search/src/retrieve/` etc | **`packages/search/` already exists** with flat layout (no `src/`). See `ls packages/search/`: `adapter.ts`, `pg-search.ts`, `hybrid-ranker.ts`, etc. Adding `src/` breaks existing exports (`./pg-search`, `./hybrid-ranker`). | Use existing flat layout: `packages/search/pipeline/index.ts`, `packages/search/pipeline/intent.ts`, `packages/search/retrieve/bm25.ts`, etc. Update `packages/search/package.json` exports map. |
| §9.4 CI workflow | `pnpm --filter @jarvis/web type-check \| lint \| test` | Scripts do exist in `apps/web/package.json` (lines 4-8) BUT root-level also has `turbo type-check`, `turbo lint`, `turbo test` which is project's standard. Plan ignores worker tests and package tests. | Use `pnpm -r run type-check`, `pnpm -r run lint`, `pnpm -r run test` OR `turbo type-check`, `turbo lint`, `turbo test` (monorepo-wide). |

---

## Correct Claims (verified)

- **39 Drizzle tables** — confirmed by counting `pgTable(` matches in `packages/db/schema/*.ts` (exactly 39).
- **`gpt-4.1-mini` default model** — confirmed at `packages/ai/ask.ts:42` and `packages/ai/tutor.ts:10`.
- **`text-embedding-3-small` 1536d** — confirmed at `packages/ai/embed.ts:14` and `apps/worker/src/jobs/embed.ts:14`.
- **`@anthropic-ai/sdk` is dead dependency in app code** — declared at `packages/ai/package.json:16`, but no `import` anywhere in `apps/` or `packages/` source. Only referenced in `docs/plan/` and `docs/archive/` (historical). graphify binary uses its own Anthropic auth, not via this SDK.
- **No OpenSearch used** — confirmed: zero matches in `packages/`, `apps/`, only appears in `docs/analysis/` reference materials. pgvector + pg_trgm + PG FTS only.
- **`knowledge_claim` and `precedent_case` embedding tables exist** — confirmed `packages/db/schema/knowledge.ts:103-118` (`knowledgeClaim.embedding`) and `packages/db/schema/case.ts:75` (`precedentCase.embedding`). Both use `vector(1536)` via customType.
- **Phase-6 files exist**:
  - HR Tutor: `packages/ai/tutor.ts`
  - Knowledge Debt Radar: `apps/web/components/knowledge/KnowledgeDebtRadar.tsx`
  - Drift Detection: `apps/web/app/actions/drift-detection.ts`
- **305 i18n keys, 13 top-level namespaces** in `apps/web/messages/ko.json` — confirmed exactly (counted via node script).
- **11 e2e spec files** — confirmed in `apps/web/e2e/`.
- **46 unit test files** (45 `.ts` + 1 `.tsx`) — confirmed.
- **`scripts/check-schema-drift.mjs` exists** — confirmed. It checks schema-file mtime vs `_journal.json`, supports `--hook` mode (advisory), manual mode (exit 1 on drift).
- **`pnpm db:generate` exists** — confirmed at root `package.json:8` (delegates to `@jarvis/db`).
- **Packages**: `ai`, `auth`, `db`, `search`, `secret`, `shared` exist. Proposed new packages `core`, `chunker`, `prompts`, `logger` do NOT conflict (none exist today).
- **Ask API route path** `apps/web/app/api/ask/route.ts` exists (plan §10.3 D3 is correct here — no `/src`).
- **worker has `src/`**: `apps/worker/src/jobs/ingest-document.ts` path format is correct (worker DOES use `src/`).
- **4-surface labels**: Plan uses `canonical | directory | case | synthesized`. Actual (`knowledge.ts:54-58` comments + `docs/CURRENT_STATE.md:22`): `canonical | directory | case | derived`. **Minor**: "synthesized" vs "derived" — plan labels this difference correctly in §5.1 table ("synthesized" is plan's proposed NEW label), but the column currently stores "derived" per `knowledge.ts:58`. Not an error, but integrator should decide whether to migrate values or keep "derived".
- **Graph tables (`graph_node`, `graph_edge`, `graph_snapshot`, `graph_community`)** exist in `packages/db/schema/graph.ts` — referenced implicitly by plan, correct.

---

## Uncertain (needs human)

1. **`OPENAI_API_KEY` naming for new `OPENAI_MODEL_*` env vars**: Plan proposes `OPENAI_MODEL_SYNTHESIS` and `OPENAI_MODEL_UTILITY`. There is no formal policy doc about env naming, but the existing precedent is domain-prefixed (`ASK_AI_MODEL`, `GRAPHIFY_MODEL`, `GRAPHIFY_API_KEY`). Ask the planner whether to:
   - Follow existing pattern: `ASK_AI_MODEL` (utility) + new `ASK_AI_SYNTHESIS_MODEL` (synthesis), OR
   - Switch to proposed `OPENAI_MODEL_*` (breaks backward compat; requires coordinated code+env changes).
2. **Tiptap package size risk** (§11): Plan cites "중간" probability / impact. No current Tiptap deps in `package.json` — installing `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` adds ~150-250KB gzip. Recommend W3 D4 adds a bundle-size check. Not an error in plan, but should be verified before committing.

---

## Recommendations (concrete edits to 99-integration-plan.md)

1. **Global path search-and-replace** in `docs/analysis/99-integration-plan.md`:
   - `packages/db/src/schema/` → `packages/db/schema/` (8 occurrences)
   - `apps/web/src/` → `apps/web/` (8 occurrences — §6.2, §6.4, §6.5, §9.3, §10.3 D4/D5, §10.4 D2/D4)
   - `packages/search/src/` → `packages/search/` (§4.2 tree, §10.1 D4/D5, §10.3 D1/D2/D3)
   - `packages/prompts/src/` → `packages/prompts/` (§2.3 tree)
   - `packages/core/src/` → `packages/core/` (§2.5 cachedLLMCall)
   - `packages/chunker/src/` → `packages/chunker/` (§3.3)

2. **§2.5 llmCache schema**: Replace the full example with project-conformant code:
   ```ts
   // packages/db/schema/llm-cache.ts
   import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

   export const llmCache = pgTable("llm_cache", {
     cacheKey: text("cache_key").primaryKey(),
     op: text("op").notNull(),
     model: text("model").notNull(),
     promptVersion: text("prompt_version"),
     inputTokens: integer("input_tokens").notNull(),
     outputTokens: integer("output_tokens").notNull(),
     result: text("result").notNull(),
     createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
     expiresAt: timestamp("expires_at", { withTimezone: true }),
   }, (t) => ({
     opIdx: index("llm_cache_op_idx").on(t.op),
     expiresIdx: index("llm_cache_expires_idx").on(t.expiresAt),
   }));
   ```

3. **§3.3 documentChunks schema**: Replace `vector('embedding', { dimensions: 1536 })` with existing customType pattern. Drop `sensitivityEnum`, use `varchar` for sensitivity. Add workspace FK. Move ivfflat index to SQL migration.

4. **§5.2 all new schemas**: Apply the same three fixes (withTimezone, varchar sensitivity, workspace FK). Declare pgEnum at file top, not inline.

5. **§10.1–§10.4 migration filenames**: Renumber starting from `0009_` not `0010_` (so `0009_llm_cache.sql`, `0010_document_chunks.sql`, ..., `0015_review_queue_kind.sql`).

6. **§2.2 + §13**: Clarify that `@anthropic-ai/sdk` removal applies ONLY to `packages/ai/package.json:16` — `ANTHROPIC_API_KEY` env var must remain for graphify binary (documented in `.env.example:37-40`).

7. **§13 env block**: Note that `ASK_AI_MODEL=gpt-4.1-mini` is the existing var. Either rename or add `OPENAI_MODEL_SYNTHESIS` alongside without overlap.

8. **§9.4 CI commands**: Change `pnpm --filter @jarvis/web ...` to a full monorepo form (`turbo type-check lint test` or `pnpm -r run …`) so worker + package tests are covered.

9. **§4.2**: Rewrite `packages/search/` tree with flat layout respecting existing `adapter.ts`, `pg-search.ts`, `hybrid-ranker.ts` files. Show ADD-only subdirs (`pipeline/`, `retrieve/`, `tokenizer/`), not a full replacement.

10. **§6.2**: Fix Tiptap component path to `apps/web/components/editor/WikiEditor.tsx` (no `src/`).

11. **§7.2 + §10.2**: `apps/worker/src/jobs/ingest-document.ts` path is correct (worker uses `src/`). No change needed. But cross-reference the schema migration order — §10.2 D1-D4 has the `0012-0016` numbers that must shift to `0011-0015` after renumbering.

12. **§14 appendix**: Phrase "Python subprocess" → "graphify binary subprocess" in context.

---

**Bottom line**: The plan's strategy is sound. The technical claims on counts (39 tables, 305 i18n keys, 11 e2e, 46 unit, text-embedding model, gpt-4.1-mini default) are all correct. The systematic errors are almost entirely **path and Drizzle-style mismatches** — fixable by search-and-replace, enum declaration relocation, and schema column attribute alignment. After applying the 12 recommendations above, the plan is safe to execute by jarvis-planner → builder → integrator.
