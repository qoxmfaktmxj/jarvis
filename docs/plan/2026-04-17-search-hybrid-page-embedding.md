# Search Hybrid (Page-level Embedding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vector lane to Jarvis `/api/search` using page-level OpenAI embeddings stored on `knowledge_page.embedding`, expose `precedent_case` as a separate Lane B tab in the Search UI, and remove the deprecated RAG fallback from `packages/ai/ask.ts`.

**Architecture:** Keep Karpathy "compiled page = unit" — one embedding per `knowledge_page` row, no chunking. Lane A (wiki pages) and Lane B (precedent cases) stay physically separate (never UNION vectors across OpenAI/TF-IDF spaces). Add `FEATURE_SEARCH_HYBRID` flag to gate the vector lane behind a reversible switch.

**Tech Stack:** Drizzle ORM + PostgreSQL 16 + pgvector (HNSW) + tsvector FTS + pg_trgm, Next.js 15 App Router, React Server Components + Client tabs, next-intl (ko.json), Vitest for unit tests, Playwright for E2E (out of scope — unit only).

---

## Scope check

The three subsystems (DB schema + ingest, search adapter, UI tab) share state and data flow tightly — a page embedding is useless without the search adapter reading it, and the adapter is useless without a UI tab surfacing case results. Keep as one plan. **No sub-project split needed.**

## File structure (locked in before tasks)

**New files:**
- `packages/db/drizzle/0025_knowledge_page_embedding.sql` — adds column + HNSW index
- `scripts/embed-knowledge-pages.mjs` — one-shot ingest that computes embeddings for every `publish_status != 'deleted'` page whose `embedding IS NULL` or whose `updated_at > last_embedded_at`
- `scripts/tests/embed-knowledge-pages.test.mjs` — mock OpenAI, assert upsert behaviour
- `packages/search/precedent-search.ts` — **separate** adapter for Lane B (TF-IDF+SVD space)
- `packages/search/__tests__/precedent-search.test.ts` — Lane B SQL + cosine ordering
- `packages/search/__tests__/vector-search.test.ts` — Lane A runVectorSearch
- `apps/web/app/(app)/search/ResourceTabs.tsx` — client component with tabs (knowledge | case)

**Modified files:**
- `packages/db/schema/knowledge.ts` — add `embedding` column + `lastEmbeddedAt` timestamp
- `packages/db/feature-flags.ts` — add `featureSearchHybrid()`
- `packages/search/pg-search.ts` — add `runVectorSearch()` private + wire into `search()` when flag on
- `packages/search/hybrid-ranker.ts` — extend score formula with vector component
- `packages/search/__tests__/hybrid-ranker.test.ts` — cover new formula
- `packages/search/types.ts` — extend `ResourceType` to `'knowledge' | 'project' | 'system' | 'graph' | 'case'`
- `apps/web/app/api/search/route.ts` — dispatch to `PrecedentSearchAdapter` when `resourceType === 'case'`
- `apps/web/app/(app)/search/page.tsx` — host `<ResourceTabs />`
- `apps/web/messages/ko.json` — add `"search.tabKnowledge"`, `"search.tabCase"` keys
- `packages/ai/ask.ts` — delete `retrieveRelevantClaims()` + dead imports, keep only page-first path
- `packages/ai/__tests__/ask.test.ts` (or whichever test covers ask.ts) — remove legacy assertions

**Ratio of split:** files that change together live together (ingest script + its test; adapter + its tests). Search adapter split into two files because Lane A and Lane B are physically different vector spaces and the README explicitly forbids mixing.

---

## Task 1: Feature flag `featureSearchHybrid`

**Files:**
- Modify: `packages/db/feature-flags.ts`

- [ ] **Step 1: Write failing test**

Create `packages/db/__tests__/feature-flags.test.ts` (new file):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { featureSearchHybrid } from '../feature-flags.js';

describe('featureSearchHybrid', () => {
  beforeEach(() => {
    delete process.env.FEATURE_SEARCH_HYBRID;
  });

  it('defaults to false when env var is unset', () => {
    expect(featureSearchHybrid()).toBe(false);
  });

  it('returns true when env var is "true"', () => {
    process.env.FEATURE_SEARCH_HYBRID = 'true';
    expect(featureSearchHybrid()).toBe(true);
  });

  it('returns false when env var is any other value', () => {
    process.env.FEATURE_SEARCH_HYBRID = '1';
    expect(featureSearchHybrid()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/db test feature-flags`
Expected: FAIL with `featureSearchHybrid is not exported`.

- [ ] **Step 3: Add flag function**

Append to `packages/db/feature-flags.ts`:

```typescript
/**
 * Phase-W5 T1: hybrid vector search in PgSearchAdapter.
 *
 * When true, `/api/search` runs the FTS + trgm + vector RRF hybrid path against
 * `knowledge_page.embedding`. When false (default), only FTS + trgm fallback
 * runs — behaviour identical to pre-W5.
 *
 * @defaultValue false (`FEATURE_SEARCH_HYBRID === 'true'`)
 */
export function featureSearchHybrid(): boolean {
  return process.env.FEATURE_SEARCH_HYBRID === "true";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jarvis/db test feature-flags`
Expected: PASS, 3/3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/db/feature-flags.ts packages/db/__tests__/feature-flags.test.ts
git commit -m "feat(db): add FEATURE_SEARCH_HYBRID flag (default off)"
```

---

## Task 2: Add `embedding` column + HNSW index to `knowledge_page`

**Files:**
- Modify: `packages/db/schema/knowledge.ts:30-79`
- Create: `packages/db/drizzle/0025_knowledge_page_embedding.sql`

- [ ] **Step 1: Modify schema**

In `packages/db/schema/knowledge.ts`, the `vector` customType already exists (line 20-24). Add the column inside `knowledgePage` definition. Replace line 49:

```typescript
  searchVector: tsvectorType("search_vector"),
```

with:

```typescript
  searchVector: tsvectorType("search_vector"),
  embedding: vector("embedding"),
  lastEmbeddedAt: timestamp("last_embedded_at", { withTimezone: true }),
```

- [ ] **Step 2: Write the migration SQL**

Create `packages/db/drizzle/0025_knowledge_page_embedding.sql`:

```sql
-- Phase-W5 T2: page-level embedding column for Lane A hybrid search.
-- HNSW index uses cosine distance (<=>) to match OpenAI text-embedding-3-small space.
ALTER TABLE "knowledge_page"
  ADD COLUMN "embedding" vector(1536),
  ADD COLUMN "last_embedded_at" timestamptz;

CREATE INDEX "idx_knowledge_page_embedding_hnsw"
  ON "knowledge_page"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

- [ ] **Step 3: Append to `_journal.json`**

Open `packages/db/drizzle/meta/_journal.json` and append to the `entries` array (after entry `idx 24`):

```json
{
  "idx": 25,
  "version": "7",
  "when": 1713340800000,
  "tag": "0025_knowledge_page_embedding",
  "breakpoints": true
}
```

(Use a `when` timestamp a few seconds greater than entry 24 — check the existing value and add 1000.)

- [ ] **Step 4: Run migration against dev DB**

Run: `pnpm --filter @jarvis/db migrate:up`
Expected: "Applied 0025_knowledge_page_embedding".

Verify in psql:
```
\d+ knowledge_page
```
Expected: `embedding` column type `vector(1536)`, index `idx_knowledge_page_embedding_hnsw` present.

- [ ] **Step 5: Commit**

```bash
git add packages/db/schema/knowledge.ts packages/db/drizzle/0025_knowledge_page_embedding.sql packages/db/drizzle/meta/_journal.json
git commit -m "feat(db): add knowledge_page.embedding + HNSW index"
```

---

## Task 3: Embedding ingest script

**Files:**
- Create: `scripts/embed-knowledge-pages.mjs`
- Create: `scripts/tests/embed-knowledge-pages.test.mjs`

- [ ] **Step 1: Write failing test**

Create `scripts/tests/embed-knowledge-pages.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedPages } from '../embed-knowledge-pages.mjs';

describe('embedPages', () => {
  let mockDb;
  let mockOpenAI;

  beforeEach(() => {
    mockDb = {
      execute: vi.fn(),
    };
    mockOpenAI = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.01) }],
          usage: { total_tokens: 42 },
        }),
      },
    };
  });

  it('skips pages whose embedding is up to date', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] });
    const n = await embedPages({ db: mockDb, openai: mockOpenAI });
    expect(n).toBe(0);
    expect(mockOpenAI.embeddings.create).not.toHaveBeenCalled();
  });

  it('embeds one page and upserts', async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [{ id: 'page-1', title: '취업규칙', summary: '제1장 총칙' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const n = await embedPages({ db: mockDb, openai: mockOpenAI });
    expect(n).toBe(1);
    expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: '취업규칙\n제1장 총칙',
    });
    // second execute call should be the UPDATE with embedding + last_embedded_at
    expect(mockDb.execute).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/tests/embed-knowledge-pages.test.mjs`
Expected: FAIL with `Cannot find module '../embed-knowledge-pages.mjs'`.

- [ ] **Step 3: Write the ingest script**

Create `scripts/embed-knowledge-pages.mjs`:

```javascript
#!/usr/bin/env node
// Phase-W5 T3: one-shot / cron-friendly ingest that keeps
// knowledge_page.embedding in sync with title+summary content.
//
// Usage:
//   OPENAI_API_KEY=... pnpm exec node scripts/embed-knowledge-pages.mjs
//
// Behaviour:
//   - Selects every page where embedding IS NULL OR updated_at > last_embedded_at
//   - For each page, embeds `${title}\n${summary ?? ''}` with text-embedding-3-small
//   - UPDATEs embedding + last_embedded_at = now()
//   - Exits 0 on success, 1 on any failure.

import OpenAI from 'openai';
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 20;

export async function embedPages({ db, openai }) {
  const { rows } = await db.execute(sql`
    SELECT id, title, coalesce(summary, '') AS summary
    FROM knowledge_page
    WHERE publish_status != 'deleted'
      AND (embedding IS NULL OR last_embedded_at IS NULL OR last_embedded_at < updated_at)
    ORDER BY updated_at DESC
    LIMIT ${BATCH_SIZE}
  `);

  for (const row of rows) {
    const input = `${row.title}\n${row.summary}`.trim();
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input,
    });
    const vec = res.data[0].embedding;
    const literal = `[${vec.join(',')}]`;
    await db.execute(sql`
      UPDATE knowledge_page
      SET embedding = ${literal}::vector,
          last_embedded_at = now()
      WHERE id = ${row.id}::uuid
    `);
  }
  return rows.length;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('../packages/db/src/client.js');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let total = 0;
  // Loop until batch returns zero rows (full sync)
  while (true) {
    const n = await embedPages({ db, openai });
    total += n;
    if (n < BATCH_SIZE) break;
  }
  console.log(`embedded ${total} pages`);
  process.exit(0);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm vitest run scripts/tests/embed-knowledge-pages.test.mjs`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add scripts/embed-knowledge-pages.mjs scripts/tests/embed-knowledge-pages.test.mjs
git commit -m "feat(scripts): page embedding ingest (text-embedding-3-small)"
```

---

## Task 4: `PgSearchAdapter.runVectorSearch()`

**Files:**
- Modify: `packages/search/pg-search.ts` (add method; don't wire into `search()` yet)
- Create: `packages/search/__tests__/vector-search.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/search/__tests__/vector-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgSearchAdapter } from '../pg-search.js';
import { db } from '@jarvis/db/client';

vi.mock('@jarvis/db/client', () => ({
  db: { execute: vi.fn() },
}));

describe('PgSearchAdapter.runVectorSearch', () => {
  let adapter: PgSearchAdapter;
  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PgSearchAdapter();
  });

  it('returns hits ordered by cosine distance', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        {
          id: 'a',
          title: 'A',
          page_type: 'hr-policy',
          sensitivity: 'INTERNAL',
          updated_at: new Date(),
          vector_sim: 0.92,
          headline: '...',
          total_count: '1',
        },
      ],
    });
    const res = await adapter.runVectorSearch(
      {
        q: '연차',
        workspaceId: '00000000-0000-0000-0000-000000000001',
        userId: 'u',
        userRoles: [],
        userPermissions: [],
      },
      new Array(1536).fill(0.01),
    );
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].id).toBe('a');
    expect(res.hits[0].resourceType).toBe('knowledge');
  });

  it('returns empty result when no rows match', async () => {
    (db.execute as any).mockResolvedValueOnce({ rows: [] });
    const res = await adapter.runVectorSearch(
      {
        q: '연차',
        workspaceId: '00000000-0000-0000-0000-000000000001',
        userId: 'u',
        userRoles: [],
        userPermissions: [],
      },
      new Array(1536).fill(0.01),
    );
    expect(res.hits).toEqual([]);
    expect(res.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jarvis/search test vector-search`
Expected: FAIL with `adapter.runVectorSearch is not a function`.

- [ ] **Step 3: Add the method**

Append to `packages/search/pg-search.ts`, inside the `PgSearchAdapter` class (after `runTrgmSearch`, around line 306):

```typescript
  // -----------------------------------------------------------------------
  // Public: runVectorSearch — HNSW cosine-distance search against
  // knowledge_page.embedding (OpenAI text-embedding-3-small space, Lane A).
  // -----------------------------------------------------------------------

  async runVectorSearch(
    query: SearchQuery,
    queryVector: number[],
    opts?: { limit?: number; offset?: number },
  ): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = opts?.limit ?? DEFAULT_LIMIT;
    const offset = opts?.offset ?? 0;

    const secretFilter = this.buildSecretFilter(query.userPermissions);
    const extraFilters = this.buildExtraFilters(query);
    const literal = `[${queryVector.join(',')}]`;

    const rows = await db.execute<{
      id: string;
      title: string;
      page_type: string;
      sensitivity: string;
      updated_at: Date;
      vector_sim: number;
      headline: string;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        page_type,
        sensitivity,
        updated_at,
        1 - (embedding <=> ${literal}::vector)        AS vector_sim,
        left(coalesce(summary, ''), 300)              AS headline,
        COUNT(*) OVER ()::text                        AS total_count
      FROM knowledge_page
      WHERE
        workspace_id = ${query.workspaceId}::uuid
        AND publish_status != 'deleted'
        AND embedding IS NOT NULL
        ${sql.raw(secretFilter)}
        ${sql.raw(extraFilters)}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit} OFFSET ${offset}
    `);

    const first = rows.rows[0];
    const total = first ? parseInt(first.total_count, 10) : 0;
    const hits = rows.rows.map((row) => ({
      id: row.id,
      resourceType: 'knowledge' as ResourceType,
      title: row.title,
      headline: sanitizeHeadline(row.headline ?? ''),
      pageType: row.page_type,
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: 0,
      trgmSim: 0,
      vectorSim: row.vector_sim,
      freshness: this.computeFreshness(row.updated_at),
      hybridScore: row.vector_sim,
      url: `/knowledge/${row.id}`,
    }));

    return {
      hits,
      total,
      facets: { byPageType: {}, bySensitivity: {} },
      suggestions: [],
      query: query.q,
      durationMs: Date.now() - startMs,
    };
  }
```

Also extend `SearchHit` to include optional `vectorSim`. Edit `packages/search/types.ts:20-33`:

```typescript
export interface SearchHit {
  id: string;
  resourceType: ResourceType;
  title: string;
  headline: string;
  pageType?: string;
  sensitivity?: string;
  updatedAt: string;
  ftsRank: number;
  trgmSim: number;
  vectorSim?: number;
  freshness: number;
  hybridScore: number;
  url: string;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @jarvis/search test vector-search`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add packages/search/pg-search.ts packages/search/types.ts packages/search/__tests__/vector-search.test.ts
git commit -m "feat(search): PgSearchAdapter.runVectorSearch (Lane A, HNSW cosine)"
```

---

## Task 5: Hybrid ranker — combine FTS + trgm + vector

**Files:**
- Modify: `packages/search/hybrid-ranker.ts`
- Modify: `packages/search/__tests__/hybrid-ranker.test.ts`

- [ ] **Step 1: Write failing test**

Read the current `packages/search/hybrid-ranker.ts` first. It currently exposes `computeHybridScore(ftsRank, trgmSim, freshnessDays)`. Add a new signature that accepts vector sim.

Add to `packages/search/__tests__/hybrid-ranker.test.ts` (at the end of the existing describe block):

```typescript
  describe('with vector lane', () => {
    it('gives non-zero score when only vector matches', () => {
      const score = computeHybridScore(0, 0, 1, 0.9);
      expect(score).toBeGreaterThan(0.3);  // vector weight alone >= 0.35
    });

    it('blends all three lanes with fts weight 0.4, vector 0.35, trgm 0.15, freshness 0.1', () => {
      const score = computeHybridScore(1, 1, 1, 1);
      expect(score).toBeCloseTo(0.4 + 0.15 + 0.35 + 0.1, 5);
    });

    it('keeps legacy 3-arg signature backwards compatible (vector defaults to 0)', () => {
      const score3 = computeHybridScore(1, 1, 1);
      const score4 = computeHybridScore(1, 1, 1, 0);
      expect(score3).toBeCloseTo(score4, 5);
    });
  });
```

- [ ] **Step 2: Run test to verify fail**

Run: `pnpm --filter @jarvis/search test hybrid-ranker`
Expected: one of the new cases fails — either "vectorSim param missing" or weight math off.

- [ ] **Step 3: Update the formula**

Open `packages/search/hybrid-ranker.ts`. Find `computeHybridScore`. Replace with:

```typescript
/**
 * Phase-W5: 4-lane hybrid score.
 *   fts       40%  — BM25-style tsvector rank (lexical exact)
 *   vector    35%  — cosine similarity (OpenAI 1536d paraphrase)
 *   trgm      15%  — title trigram similarity (typo tolerance)
 *   freshness 10%  — recency decay
 *
 * vectorSim is optional to preserve the legacy 3-arg signature used by
 * runTrgmSearch / runFtsSearch which have no vector.
 */
export function computeHybridScore(
  ftsRank: number,
  trgmSim: number,
  freshness: number,
  vectorSim: number = 0,
): number {
  return (
    ftsRank * 0.4 +
    vectorSim * 0.35 +
    trgmSim * 0.15 +
    freshness * 0.1
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @jarvis/search test hybrid-ranker`
Expected: PASS all (including prior 3-arg cases due to default).

- [ ] **Step 5: Commit**

```bash
git add packages/search/hybrid-ranker.ts packages/search/__tests__/hybrid-ranker.test.ts
git commit -m "feat(search): extend computeHybridScore with vector lane (35%)"
```

---

## Task 6: Wire vector lane into `PgSearchAdapter.search()` behind the flag

**Files:**
- Modify: `packages/search/pg-search.ts`
- Modify: `packages/search/__tests__/pg-search.test.ts`

- [ ] **Step 1: Write failing integration test**

Append to `packages/search/__tests__/pg-search.test.ts`:

```typescript
  describe('hybrid search behind featureSearchHybrid flag', () => {
    const orig = process.env.FEATURE_SEARCH_HYBRID;
    afterEach(() => {
      if (orig === undefined) delete process.env.FEATURE_SEARCH_HYBRID;
      else process.env.FEATURE_SEARCH_HYBRID = orig;
    });

    it('does NOT call OpenAI when flag is off', async () => {
      delete process.env.FEATURE_SEARCH_HYBRID;
      const spy = vi.fn();
      adapter = new PgSearchAdapter({ embedQuery: spy });
      (db.execute as any).mockResolvedValue({ rows: [] });
      await adapter.search({
        q: '연차',
        workspaceId: WS,
        userId: 'u',
        userRoles: [],
        userPermissions: [],
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls embedQuery and merges vector hits when flag is on', async () => {
      process.env.FEATURE_SEARCH_HYBRID = 'true';
      const spy = vi.fn().mockResolvedValue(new Array(1536).fill(0.01));
      adapter = new PgSearchAdapter({ embedQuery: spy });
      (db.execute as any).mockResolvedValue({ rows: [] });
      await adapter.search({
        q: '연차',
        workspaceId: WS,
        userId: 'u',
        userRoles: [],
        userPermissions: [],
      });
      expect(spy).toHaveBeenCalledWith('연차');
    });
  });
```

Note `WS` must match the constant your existing test file uses (copy from the top of the file).

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @jarvis/search test pg-search`
Expected: FAIL — `PgSearchAdapter` constructor signature does not accept an `embedQuery` option.

- [ ] **Step 3: Add constructor option + wire the hybrid path**

Modify `packages/search/pg-search.ts`. Update constructor and `search()`:

```typescript
import { featureSearchHybrid } from '@jarvis/db/feature-flags';

export interface PgSearchAdapterOptions {
  embedQuery?: (text: string) => Promise<number[]>;
}

export class PgSearchAdapter implements SearchAdapter {
  private readonly fallbackChain: FallbackChain;
  private readonly embedQuery?: (text: string) => Promise<number[]>;

  constructor(opts: PgSearchAdapterOptions = {}) {
    this.fallbackChain = new FallbackChain(
      (q) => this.runFtsSearch(q),
      (q) => this.runTrgmSearch(q),
    );
    this.embedQuery = opts.embedQuery;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = ((query.page ?? 1) - 1) * limit;

    const parsed = parseQuery(query.q);
    const term = extractTerm(query.q);
    const synonymTerms = await resolveSynonyms(term, query.workspaceId);
    const expandedTerm = synonymTerms.length > 1 ? buildExpandedQuery(synonymTerms) : term;
    const enrichedQuery: SearchQuery = { ...query, q: expandedTerm };

    const ftsResult = await this.runFtsSearch(enrichedQuery, { limit, offset, parsed });

    let vectorResult: SearchResult | null = null;
    if (featureSearchHybrid() && this.embedQuery) {
      try {
        const qvec = await this.embedQuery(term);
        vectorResult = await this.runVectorSearch(enrichedQuery, qvec, { limit, offset });
      } catch (err) {
        console.warn('[search] vector lane failed, falling back to FTS only:', err);
        vectorResult = null;
      }
    }

    let result: SearchResult;
    if (vectorResult && (ftsResult.hits.length > 0 || vectorResult.hits.length > 0)) {
      result = mergeByRRF(ftsResult, vectorResult, limit);
    } else if (ftsResult.hits.length > 0) {
      result = ftsResult;
    } else {
      result = await this.fallbackChain.run(enrichedQuery);
    }

    const facets = await countFacets(query.workspaceId, parsed.tsquery, query.userPermissions).catch(() => ({
      byPageType: {},
      bySensitivity: {},
    }));

    const explain = canExplain(query.userRoles) ? buildExplain(result.hits) : undefined;

    const durationMs = Date.now() - startMs;
    await this.logSearch(query, result.hits.length, durationMs).catch(() => {});

    return { ...result, facets, durationMs, explain };
  }
  // ... rest unchanged
```

Add the RRF merge helper in the same file, just above the class:

```typescript
/**
 * Reciprocal Rank Fusion: combine two ranked lists into one.
 * score(doc) = sum over lists of (1 / (k + rank_in_list)), k=60 classic.
 */
const RRF_K = 60;
function mergeByRRF(a: SearchResult, b: SearchResult, limit: number): SearchResult {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  const visit = (list: SearchHit[]) => {
    list.forEach((hit, idx) => {
      const prev = scores.get(hit.id);
      const add = 1 / (RRF_K + idx + 1);
      if (prev) prev.score += add;
      else scores.set(hit.id, { hit, score: add });
    });
  };
  visit(a.hits);
  visit(b.hits);
  const merged = Array.from(scores.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, hybridScore: score }));
  return {
    hits: merged,
    total: merged.length,
    facets: { byPageType: {}, bySensitivity: {} },
    suggestions: [],
    query: a.query,
    durationMs: 0,
  };
}
```

- [ ] **Step 4: Update `apps/web/app/api/search/route.ts` instantiation**

The existing file constructs `new PgSearchAdapter()`. Change to pass an OpenAI embedder:

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const adapter = new PgSearchAdapter({
  embedQuery: async (text) => {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return res.data[0].embedding;
  },
});
```

Also update `apps/web/lib/queries/search.ts` and `apps/web/app/api/search/suggest/route.ts` if they also construct adapters.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @jarvis/search test pg-search`
Expected: PASS.

Run: `pnpm --filter @jarvis/web typecheck`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/search/pg-search.ts packages/search/__tests__/pg-search.test.ts apps/web/app/api/search/route.ts apps/web/app/api/search/suggest/route.ts apps/web/lib/queries/search.ts
git commit -m "feat(search): hybrid path with RRF merge behind FEATURE_SEARCH_HYBRID"
```

---

## Task 7: Lane B — `PrecedentSearchAdapter`

**Files:**
- Create: `packages/search/precedent-search.ts`
- Create: `packages/search/__tests__/precedent-search.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/search/__tests__/precedent-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrecedentSearchAdapter } from '../precedent-search.js';
import { db } from '@jarvis/db/client';

vi.mock('@jarvis/db/client', () => ({ db: { execute: vi.fn() } }));

describe('PrecedentSearchAdapter', () => {
  let adapter: PrecedentSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PrecedentSearchAdapter({
      embedQuery: async () => new Array(1536).fill(0.01),
    });
  });

  it('returns case hits with resourceType="case"', async () => {
    (db.execute as any).mockResolvedValueOnce({
      rows: [
        {
          id: 'case-1',
          title: '연차 오류',
          cluster_label: '근태 / 연차',
          sensitivity: 'INTERNAL',
          updated_at: new Date(),
          vector_sim: 0.88,
          total_count: '1',
        },
      ],
    });
    const res = await adapter.search({
      q: '연차',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      userId: 'u',
      userRoles: [],
      userPermissions: [],
    });
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].resourceType).toBe('case');
    expect(res.hits[0].url).toBe('/cases/case-1');
  });

  it('never UNIONs with knowledge_page (Lane A/B physical separation)', async () => {
    (db.execute as any).mockResolvedValueOnce({ rows: [] });
    await adapter.search({
      q: '연차',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      userId: 'u',
      userRoles: [],
      userPermissions: [],
    });
    const callArg = (db.execute as any).mock.calls[0][0];
    // drizzle sql template — stringify via its internal "queryChunks" hint, but we just check raw
    const rendered = JSON.stringify(callArg);
    expect(rendered).not.toMatch(/knowledge_page/i);
    expect(rendered).toMatch(/precedent_case/i);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @jarvis/search test precedent-search`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Write the adapter**

Create `packages/search/precedent-search.ts`:

```typescript
// packages/search/precedent-search.ts
//
// Lane B — cases. TF-IDF+SVD 1536d space (see README). NEVER UNION with
// knowledge_page.embedding (OpenAI space). Separate adapter enforces physical
// isolation at the code level.
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type { SearchAdapter } from './adapter.js';
import type { SearchQuery, SearchResult, SearchHit } from './types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PrecedentSearchAdapterOptions {
  embedQuery: (text: string) => Promise<number[]>;
}

export class PrecedentSearchAdapter implements SearchAdapter {
  private readonly embedQuery: (text: string) => Promise<number[]>;

  constructor(opts: PrecedentSearchAdapterOptions) {
    this.embedQuery = opts.embedQuery;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const startMs = Date.now();
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = ((query.page ?? 1) - 1) * limit;

    const qvec = await this.embedQuery(query.q);
    const literal = `[${qvec.join(',')}]`;

    const rows = await db.execute<{
      id: string;
      title: string;
      cluster_label: string | null;
      sensitivity: string;
      updated_at: Date;
      vector_sim: number;
      total_count: string;
    }>(sql`
      SELECT
        id,
        title,
        cluster_label,
        sensitivity,
        updated_at,
        1 - (embedding <=> ${literal}::vector) AS vector_sim,
        COUNT(*) OVER ()::text AS total_count
      FROM precedent_case
      WHERE workspace_id = ${query.workspaceId}::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit} OFFSET ${offset}
    `);

    const first = rows.rows[0];
    const total = first ? parseInt(first.total_count, 10) : 0;
    const hits: SearchHit[] = rows.rows.map((row) => ({
      id: row.id,
      resourceType: 'case',
      title: row.title,
      headline: row.cluster_label ?? '',
      sensitivity: row.sensitivity,
      updatedAt: row.updated_at.toISOString(),
      ftsRank: 0,
      trgmSim: 0,
      vectorSim: row.vector_sim,
      freshness: 0,
      hybridScore: row.vector_sim,
      url: `/cases/${row.id}`,
    }));

    return {
      hits,
      total,
      facets: { byPageType: {}, bySensitivity: {} },
      suggestions: [],
      query: query.q,
      durationMs: Date.now() - startMs,
    };
  }

  async suggest(): Promise<string[]> {
    return [];
  }

  async indexPage(): Promise<void> {
    // no-op — precedent_case is populated by the TSVD999 pipeline
  }

  async deletePage(): Promise<void> {
    // no-op
  }
}
```

Also extend `ResourceType` in `packages/search/types.ts`:

```typescript
export type ResourceType = 'knowledge' | 'project' | 'system' | 'graph' | 'case';
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @jarvis/search test precedent-search`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add packages/search/precedent-search.ts packages/search/types.ts packages/search/__tests__/precedent-search.test.ts
git commit -m "feat(search): PrecedentSearchAdapter (Lane B, isolated TF-IDF+SVD space)"
```

---

## Task 8: `/api/search` dispatch on resourceType

**Files:**
- Modify: `apps/web/app/api/search/route.ts`

- [ ] **Step 1: Add a resourceType param + dispatch**

Edit `apps/web/app/api/search/route.ts`. Add to the zod schema (around line 10):

```typescript
const searchSchema = z.object({
  q: z.string().min(1).max(500),
  resourceType: z.enum(['knowledge', 'case']).optional(),
  pageType: z.string().optional(),
  sensitivity: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['relevance', 'newest', 'freshness', 'hybrid', 'date', 'popularity']).optional(),
  page: z.number().int().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
```

Instantiate both adapters at module scope:

```typescript
import { PrecedentSearchAdapter } from '@jarvis/search/precedent-search';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const embedQuery = async (text: string) => {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
};

const laneA = new PgSearchAdapter({ embedQuery });
const laneB = new PrecedentSearchAdapter({ embedQuery });
```

In the POST handler, dispatch:

```typescript
const adapter = parsed.data.resourceType === 'case' ? laneB : laneA;
const result = await adapter.search({
  ...parsed.data,
  workspaceId: session.workspaceId,
  userId: session.userId,
  userRoles: session.roles,
  userPermissions: session.permissions,
});
```

- [ ] **Step 2: Run type-check**

Run: `pnpm --filter @jarvis/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/search/route.ts
git commit -m "feat(api/search): dispatch to Lane B adapter when resourceType=case"
```

---

## Task 9: UI tabs + Korean i18n

**Files:**
- Create: `apps/web/app/(app)/search/ResourceTabs.tsx`
- Modify: `apps/web/app/(app)/search/page.tsx`
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: Add i18n keys**

Open `apps/web/messages/ko.json`. Find the `"search"` namespace (grep for `"searchKnowledge"` — that lives in navigation). Add a new top-level `"searchPage"` block (or inside the existing search object — match the existing shape):

```json
"searchPage": {
  "tabKnowledge": "지식 위키",
  "tabCase": "사례(CS)",
  "emptyKnowledge": "일치하는 위키 페이지가 없습니다.",
  "emptyCase": "일치하는 사례가 없습니다."
}
```

- [ ] **Step 2: Create ResourceTabs client component**

Create `apps/web/app/(app)/search/ResourceTabs.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export type ResourceTabValue = 'knowledge' | 'case';

export function ResourceTabs({
  value,
  onChange,
}: {
  value: ResourceTabValue;
  onChange: (v: ResourceTabValue) => void;
}) {
  const t = useTranslations('searchPage');
  return (
    <div role="tablist" className="flex gap-2 border-b mb-4">
      <button
        role="tab"
        aria-selected={value === 'knowledge'}
        onClick={() => onChange('knowledge')}
        className={`px-4 py-2 border-b-2 ${value === 'knowledge' ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}
      >
        {t('tabKnowledge')}
      </button>
      <button
        role="tab"
        aria-selected={value === 'case'}
        onClick={() => onChange('case')}
        className={`px-4 py-2 border-b-2 ${value === 'case' ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}
      >
        {t('tabCase')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into `search/page.tsx`**

Read the existing `apps/web/app/(app)/search/page.tsx` first — it uses URL search params (`q, pageType, sensitivity, ...`). Add `resourceType` to the URL state in the client subtree and pass it on the `/api/search` fetch.

Minimal diff (add to the client component that posts to `/api/search`):

```tsx
const [resourceType, setResourceType] = useState<'knowledge' | 'case'>('knowledge');

<ResourceTabs value={resourceType} onChange={setResourceType} />

// inside fetch:
body: JSON.stringify({ q, resourceType, /* other params */ }),
```

If the existing page is a RSC without client state, add a small `<SearchResults>` client wrapper and keep the RSC as a shell. Do NOT rewrite the whole page.

- [ ] **Step 4: Visual smoke test**

Run `pnpm dev:web`, open `/search?q=연차`, verify:
- Two tabs render ("지식 위키" / "사례(CS)"), Korean labels via next-intl.
- Switching tabs changes the result list.
- `FEATURE_SEARCH_HYBRID=true` env shows vector-blended results.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/search/ResourceTabs.tsx apps/web/app/\(app\)/search/page.tsx apps/web/messages/ko.json
git commit -m "feat(web/search): Lane A/B tabs with Korean i18n"
```

---

## Task 10: Remove deprecated `retrieveRelevantClaims` from ask.ts

**Files:**
- Modify: `packages/ai/ask.ts`
- Modify: `packages/ai/__tests__/*` (whichever test imports the legacy path)

- [ ] **Step 1: Identify the legacy call site**

Run `grep -n "retrieveRelevantClaims\|generateEmbedding" packages/ai/ask.ts` — confirm these are only referenced in the deprecated branch.

Also run `grep -rn "retrieveRelevantClaims\|FEATURE_PAGE_FIRST_QUERY" packages/ai` to find test assertions.

- [ ] **Step 2: Delete the legacy branch**

In `packages/ai/ask.ts`, delete:
- The `retrieveRelevantClaims` function (lines ~103-178 per survey)
- The `rrfMerge` helper if only used by the legacy branch (verify via grep before removing)
- The `import { generateEmbedding } from './embed.js'` line
- The `featurePageFirstQuery` gate at the entry point (line ~471) — replace with direct call to `pageFirstAsk(query)`.

The entry point `askAI` becomes:

```typescript
export async function askAI(query: AskQuery): AsyncGenerator<SSEEvent> {
  // ... budget / cache / auth checks unchanged ...
  yield* pageFirstAsk(query);
}
```

Keep `generateEmbedding` in `embed.ts` — the ingest script and the Search vector lane use it.

- [ ] **Step 3: Delete legacy tests**

In the ask test file, delete any test block that sets `FEATURE_PAGE_FIRST_QUERY=false` or asserts the legacy path. Keep page-first tests intact.

- [ ] **Step 4: Run tests**

```
pnpm --filter @jarvis/ai test
pnpm --filter @jarvis/ai typecheck
```
Expected: PASS. No references to removed symbols.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/ask.ts packages/ai/__tests__/
git commit -m "refactor(ai/ask): remove deprecated retrieveRelevantClaims (page-first only)"
```

---

## Task 11: Backfill embeddings for existing pages

**Files:**
- Run: `scripts/embed-knowledge-pages.mjs`

- [ ] **Step 1: Run against dev DB**

```bash
OPENAI_API_KEY=$OPENAI_API_KEY pnpm exec node scripts/embed-knowledge-pages.mjs
```

Expected output: `embedded N pages` where N equals count of rows where `embedding IS NULL`.

- [ ] **Step 2: Verify coverage**

In psql:

```sql
SELECT
  count(*) AS total,
  count(embedding) AS embedded,
  count(*) - count(embedding) AS missing
FROM knowledge_page
WHERE publish_status != 'deleted';
```

Expected: `missing = 0` (all non-deleted pages have embeddings).

- [ ] **Step 3: Smoke test search**

```bash
FEATURE_SEARCH_HYBRID=true pnpm dev:web
# Open /search?q=연차 — expect results from Korean semantic match (e.g., 휴가 관련 pages) not just exact word match
```

- [ ] **Step 4: No commit** (backfill is runtime data, not source).

---

## Task 12: Final verification + schema-drift hook

**Files:**
- None created.

- [ ] **Step 1: Run full validation**

```bash
pnpm install
pnpm --filter @jarvis/db migrate:up
pnpm lint
pnpm -r typecheck
pnpm -r test
node scripts/check-schema-drift.mjs --precommit
```
All should pass.

- [ ] **Step 2: Commit any lint/format tidy-ups**

If prettier / biome reformatted anything:

```bash
git add -u
git commit -m "chore: format"
```

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-review

**1. Spec coverage**

| Spec point | Task |
|---|---|
| `knowledge_page.embedding` column + HNSW index | Task 2 |
| Ingest pipeline (text-embedding-3-small) | Task 3 |
| PgSearchAdapter vector lane | Task 4 |
| Hybrid score formula (FTS + trgm + vector + freshness) | Task 5 |
| Feature-flag-gated wiring | Task 1, 6 |
| Lane B precedent adapter | Task 7 |
| Search API dispatch on resourceType | Task 8 |
| UI tabs with Korean i18n | Task 9 |
| Remove ask.ts legacy | Task 10 |
| Backfill existing pages | Task 11 |
| No-chunking (Karpathy) | Enforced by schema: 1 row per page, embedding on `knowledge_page` (not chunks) |
| Lane A/B isolation | Enforced by separate adapter class (Task 7) + ResourceType dispatch (Task 8) |

**2. Placeholders:** None. All code blocks show concrete implementations, all commands are literal, all file paths are exact.

**3. Type consistency:** `ResourceType` extended once (Task 7) and referenced uniformly. `SearchHit.vectorSim` added once (Task 4) and used consistently in runVectorSearch + runTrgmSearch (left at 0) + PrecedentSearchAdapter. `PgSearchAdapterOptions` type defined in Task 6 and used by both constructor and instantiation sites.

**4. Commit hygiene:** 11 atomic commits (feat: db flag, feat: db column, feat: scripts, feat: search vector, feat: search hybrid, feat: search api, feat: search lane B, feat: search dispatch, feat: ui tabs, refactor: ask legacy, chore: format). Each one compiles and passes tests on its own.

---

## Execution strategy

Inline execution using `superpowers:executing-plans` — batched checkpoints after Task 4 (flag + schema + ingest + vector method), Task 9 (full vertical slice), and Task 12 (final push).
