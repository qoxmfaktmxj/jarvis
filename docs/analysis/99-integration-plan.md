# Jarvis LLM Wiki 통합 계획 (Phase-7 Master Plan)

> **생성일**: 2026-04-14
> **근거**: `00-jarvis-current-state.md` (AS-IS) + `01-graphify.md` + `02-llm_wiki.md` + `03-llm-wiki-agent.md` + `04-mindvault.md` + `05-qmd.md` + `99-comparison-matrix.md`
> **목표**: 5개 레퍼런스의 아이디어를 **최소 리스크로 통합**하여 Jarvis를 "사내 최고의 LLM Wiki + RAG 포털"로 만드는 4주 실행 계획.

---

## TL;DR (핵심 결론 10줄)

1. **5개 레퍼런스 중 어느 것도 통째로 가져오지 않는다** — 전부 싱글유저 로컬 가정이라 멀티테넌트 웹 포털에 부적합.
2. **아이디어·알고리즘·프롬프트·스키마는 최대로 흡수한다** — 다섯 독립 저자가 공통으로 도달한 결론(SHA256 캐시, JSON 구조화, 하이브리드 검색, 4-layer)은 **강력한 시그널**.
3. **Jarvis의 4-surface 모델은 유지·강화한다** — llm-wiki-agent의 sources/entities/concepts/syntheses와 구조 동일. 이름 정렬 + 필드 확장.
4. **텍스트 임베딩은 "유지하되 선별 사용"** — 청킹 없이 페이지 전체 임베딩은 비효율. qmd의 smart chunking + RRF 위원 복합검색에서 한 축으로만.
5. **검색 파이프라인은 qmd의 5-stage를 채택** — Intent → Expand → Parallel Retrieval → RRF Position-Aware Blend → Strong-Signal Bypass + Chunk Rerank.
6. **에디터는 Tiptap** — Milkdown 대비 생태계 크고 유지보수 안정. SSR-safe `use client` 마운트.
7. **LLM은 OpenAI 유지 + 모델 라우팅** — `gpt-4.1-mini`(추출·확장·라우팅) + `gpt-4.1`(합성·ingest·syntheses). Anthropic SDK는 dead dependency 정리.
8. **graphify는 이중 운영 유지** — Python subprocess + TS 쿼리 API 래퍼 7종만 추가.
9. **Phase-7을 4주 스프린트 4개로 쪼갠다** — W1: 기반 (캐시/청킹/RRF), W2: Ingest 재설계, W3: 에디터 + Lint, W4: Eval + Observability.
10. **관측·운영은 레퍼런스 밖에서 별도 축** — 5개 모두 없다. 자체 구축 (request-id, pino, Sentry, OpenAI cost tracking).

---

## 1. 의사결정 프레임워크

### 1.1 각 아이디어에 대한 판정 기준

모든 아이디어는 4개 질문을 통과해야 채택:

```
Q1. Jarvis §10 갭 중 하나를 해소하는가?
Q2. 5000명 멀티테넌트 환경에서 동작하는가? (RBAC + sensitivity + workspaceId)
Q3. 1주 스프린트에 포팅 가능한가? (중간 이하 난이도)
Q4. 기존 Jarvis 패턴(Drizzle + Next.js RSC + i18n)과 정합하는가?

YES × 4 → 채택
YES × 3 + 무해한 1 → 조건부 채택 (리팩토링 계획과 함께)
NO 하나라도 있으면 → 보류 또는 재구성
```

### 1.2 판정 결과 (핵심 20개)

| # | 아이디어 | Q1 | Q2 | Q3 | Q4 | 판정 |
|---|---------|----|----|----|----|------|
| 1 | SHA256 per-file 캐시 | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 2 | RRF + position-aware blend | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 3 | JSON Schema 강제 출력 | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 4 | 3단 신뢰도 엣지 | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 5 | LLM 캐시 테이블 | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 6 | Smart chunking (qmd) | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 7 | Strong-signal BM25 bypass | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 8 | 모델 라우팅 (mini + 4.1) | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 9 | Tiptap 에디터 | ✅ | ✅ | ✅ | ✅ | **P0 채택** |
| 10 | 4-surface 확장 (sources 필드) | ✅ | ✅ | ✅ | ✅ | **P1 채택** |
| 11 | Two-Step CoT Ingest | ✅ | ✅ | ✅ | ✅ | **P1 채택** |
| 12 | Contradictions + Lint/Heal | ✅ | ✅ | ⚠️(2주) | ✅ | **P1 조건부 채택** (단계별) |
| 13 | god nodes / graph insights | ✅ | ✅ | ⚠️ | ✅ | **P1 조건부 채택** |
| 14 | 자기강화 Q&A 루프 | ✅ | ✅ | ✅ | ✅ | **P1 채택** |
| 15 | Canonical ID | ⚠️ | ✅ | ✅ | ✅ | **P2 채택 (스키마 v2에서)** |
| 16 | Intent 스티어링 | ✅ | ✅ | ✅ | ✅ | **P1 채택** |
| 17 | CJK BM25 토크나이저 | ✅ | ✅ | ✅ | ✅ | **P1 채택** (PG FTS 개선) |
| 18 | Auto-context 강제 주입 | ✅ | ✅ | ✅ | ✅ | **P1 채택** |
| 19 | Multi-turn chat | ✅ | ✅ | ⚠️ | ✅ | **P2 채택** |
| 20 | Fine-tuning 하네스 | ❌ | ❌ | ❌ | ❌ | **DROP** |

**총 채택**: P0 9개 + P1 8개 + P2 2개 = 19개. Drop 1개.

---

## 2. LLM 사용 전략 (상세)

### 2.1 현재 AS-IS 문제점

- 단일 모델 `gpt-4.1-mini`만 사용 → 복잡한 합성(4-surface syntheses, contradictions 감지)에서 품질 부족
- 하드코딩 프롬프트 → A/B 불가, 버저닝 불가
- SSE done에 토큰 총합만 → 비용 대시보드 불가
- 캐시 없음 → 같은 질문에 LLM 반복 호출
- Tool calling 미사용 → 구조화 출력은 JSON-in-text + parse 취약

### 2.2 TO-BE 모델 라우팅 테이블

| 호출 지점 | 모델 | 이유 | 근거 레퍼런스 |
|----------|------|------|--------------|
| Ask AI 라우터 분류 | `gpt-4.1-mini` | 단순 분류 + 낮은 지연 | 기존 |
| Query expansion (lex/vec/hyde) | `gpt-4.1-mini` | 3-way JSON 구조 간단 | qmd `src/llm.ts:1141-1218` |
| Intent 분류 | `gpt-4.1-mini` | 짧은 키워드 | qmd |
| Chunk rerank (y/n 평가) | `gpt-4.1-mini` | 배치 호출, 속도 중요 | qmd |
| Answer 합성 | `gpt-4.1` | 인용 + 한국어 품질 | Jarvis 승격 |
| 4-surface syntheses 생성 | `gpt-4.1` | 장문 합성, 구조 | llm_wiki 2-step CoT |
| Contradictions 감지 | `gpt-4.1` | 정밀 추론 필요 | llm-wiki-agent |
| Entity/Concept 추출 (ingest) | `gpt-4.1` | JSON Schema 한방 | llm-wiki-agent |
| Lint semantic 체크 | `gpt-4.1-mini` | 규칙 기반 보조 | llm_wiki `lib/lint.ts:201-229` |

**Anthropic SDK 처리**: `@anthropic-ai/sdk` dead dependency를 `package.json`에서 제거 (사용 안 하므로 보안 벡터 최소화). graphify subprocess는 유지.

### 2.3 프롬프트 관리 표준화

**`packages/prompts/`** 신규 패키지:
```
packages/prompts/
├── src/
│   ├── ingest/
│   │   ├── analyze-step1.ts        # Two-Step CoT Step 1
│   │   ├── generate-step2.ts       # Two-Step CoT Step 2
│   │   └── schema.ts               # Zod 스키마
│   ├── search/
│   │   ├── expand-query.ts         # lex/vec/hyde
│   │   ├── intent.ts
│   │   └── rerank.ts
│   ├── surface/
│   │   ├── syntheses.ts            # 4-surface syntheses 합성
│   │   ├── entities-extract.ts
│   │   └── concepts-extract.ts
│   ├── lint/
│   │   ├── contradictions.ts
│   │   ├── orphan-check.ts
│   │   └── stale-check.ts
│   └── version.ts                  # 프롬프트 버전 스탬프
├── package.json
└── tsconfig.json
```

**규칙**:
- 모든 프롬프트는 **템플릿 리터럴 export 함수**, 하드코딩 금지
- 프롬프트마다 `version` 상수 (예: `export const EXPAND_QUERY_PROMPT_V = '2026-04-14'`)
- `llm_call_log` 테이블에 `prompt_version` 컬럼으로 기록 → A/B 분석 가능

### 2.4 JSON Schema 구조화 출력 (llm-wiki-agent 핵심 차용)

**원칙**: 텍스트 파싱 정규식 폐기. OpenAI `response_format: { type: 'json_schema', schema: ... }` 사용.

```ts
// packages/prompts/src/ingest/schema.ts
import { z } from 'zod';

export const ingestResultSchema = z.object({
  title: z.string(),
  slug: z.string(),
  surface: z.enum(['canonical', 'directory', 'case', 'synthesized']),
  sourceRefs: z.array(z.string()).min(0),
  entities: z.array(z.object({
    name: z.string(),
    kind: z.enum(['person', 'product', 'project', 'customer', 'team']),
    canonicalId: z.string(),
  })),
  concepts: z.array(z.object({
    term: z.string(),
    definition: z.string(),
    synonyms: z.array(z.string()),
  })),
  syntheses: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    citations: z.array(z.string()),
  })),
  contradictions: z.array(z.object({
    against: z.string(),    // 기존 페이지 slug
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  })),
  confidence: z.enum(['EXTRACTED', 'INFERRED', 'AMBIGUOUS']),
});

export type IngestResult = z.infer<typeof ingestResultSchema>;
```

OpenAI 호출 시 zod → JSON Schema 변환 유틸: `packages/prompts/src/utils/zod-to-schema.ts` (또는 `zod-to-json-schema` 라이브러리 사용).

### 2.5 LLM 캐시 (qmd 패턴)

**신규 테이블** `packages/db/src/schema/llm-cache.ts`:

```ts
import { pgTable, text, timestamp, integer, index } from 'drizzle-orm/pg-core';

export const llmCache = pgTable('llm_cache', {
  cacheKey: text('cache_key').primaryKey(),  // SHA256(JSON.stringify({op, model, prompt, params}))
  op: text('op').notNull(),                  // 'expand' | 'rerank' | 'ingest' | 'synthesis' ...
  model: text('model').notNull(),
  promptVersion: text('prompt_version'),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  result: text('result').notNull(),          // JSON as text (JSONB도 가능)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),        // nullable, null = 영구
}, (t) => ({
  opIdx: index('llm_cache_op_idx').on(t.op),
  expiresIdx: index('llm_cache_expires_idx').on(t.expiresAt),
}));
```

**사용 패턴** (`packages/core/src/llm/cached-call.ts`):
```ts
export async function cachedLLMCall<T>(params: {
  op: string;
  model: string;
  prompt: string;
  extra?: unknown;
  ttlSeconds?: number;
  executor: () => Promise<{ result: T; usage: { input: number; output: number } }>;
  promptVersion: string;
}): Promise<T> {
  const key = createHash('sha256')
    .update(JSON.stringify({ op: params.op, model: params.model, prompt: params.prompt, extra: params.extra }))
    .digest('hex');

  const cached = await db.select().from(llmCache).where(eq(llmCache.cacheKey, key)).limit(1);
  if (cached[0] && (!cached[0].expiresAt || cached[0].expiresAt > new Date())) {
    return JSON.parse(cached[0].result) as T;
  }

  const { result, usage } = await params.executor();
  await db.insert(llmCache).values({
    cacheKey: key,
    op: params.op,
    model: params.model,
    promptVersion: params.promptVersion,
    inputTokens: usage.input,
    outputTokens: usage.output,
    result: JSON.stringify(result),
    expiresAt: params.ttlSeconds ? new Date(Date.now() + params.ttlSeconds * 1000) : null,
  }).onConflictDoNothing();
  return result;
}
```

**TTL 가이드**:
- Query expansion: 30일 (사내 용어 변화 느림)
- Rerank: 7일 (문서가 변하면 content_hash가 바뀌어 자연스럽게 miss)
- Syntheses: null (영구, 명시적 invalidation만)
- Contradictions: 14일

**예상 비용 절감**: 20~60% (qmd 근거). 사내에서 같은 질문 반복 빈도가 높으면 더 큼.

---

## 3. 텍스트 임베딩 전략

### 3.1 "꼭 필요한가?" 결론

**답: 유지한다. 단, 현재 방식은 비효율적이므로 재설계한다.**

**근거**:
- 5개 레퍼런스 중 3개(graphify, llm-wiki-agent, mindvault)는 임베딩 없이 동작 → 특정 쿼리에는 불필요
- 하지만 Jarvis 사내 문서는 **한국어 동의어·패러프레이즈·약어 혼용** 심함 → 벡터 검색이 recall 유지 필수
- 결론: 임베딩은 **하이브리드 검색의 한 축**으로 유지, 단독 의존 금지

### 3.2 현재 AS-IS 문제점

- `knowledge_claim`, `precedent_case` 두 테이블만 임베딩 → 다른 문서 유형 누락
- **페이지 전체를 1개 벡터로 임베딩** → 긴 문서의 중간 섹션이 검색 안 됨
- 증분 재임베딩 없음 → 페이지 수정 시 전체 재생성 (비용 낭비)

### 3.3 TO-BE 청크 단위 임베딩

**smart chunking (qmd 직역 이식)**:
```ts
// packages/chunker/src/regex.ts (qmd src/store.ts:97-307 이식)
export const BREAK_PATTERNS = [
  /\n\n/,              // 빈 줄 (최우선)
  /\n#{1,6}\s/,        // 마크다운 헤더
  /\n```/,             // 코드 펜스
  /\n\* |\n- |\n\d+\. /, // 리스트
  /\. (?=[A-Z가-힣])/,  // 문장 끝
];

export function chunkDocumentWithBreakPoints(
  text: string,
  targetTokens = 900,
  minTokens = 200,
): string[] {
  // 1. BREAK_PATTERNS로 모든 breakpoint 수집
  // 2. 코드 펜스 안은 skip
  // 3. target의 제곱 거리로 최적 breakpoint 선택
  // 4. min 이하 청크는 병합
  // ... (구현 상세는 qmd src/store.ts:147-307 참조)
}
```

**신규 테이블** `packages/db/src/schema/embeddings.ts`:
```ts
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull(),  // wiki_pages, precedent_cases 등 참조
  documentType: text('document_type').notNull(),  // polymorphic
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),  // SHA256 of chunk body
  embedding: vector('embedding', { dimensions: 1536 }),
  tokens: integer('tokens').notNull(),
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  workspaceId: uuid('workspace_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  docIdx: index('document_chunks_doc_idx').on(t.documentId, t.documentType),
  hashIdx: index('document_chunks_hash_idx').on(t.contentHash),
  vecIdx: index('document_chunks_vec_idx').using('ivfflat', t.embedding.op('vector_cosine_ops')),
  workspaceIdx: index('document_chunks_ws_idx').on(t.workspaceId),
}));
```

**증분 재임베딩 로직** (`apps/worker/src/jobs/reembed-chunks.ts`):
1. 문서 저장 시 `content_hash` 계산
2. 기존 chunks 조회 → hash 비교
3. **dirty chunks만 재임베딩** (OpenAI batch endpoint 활용 시 추가 절감)
4. unchanged chunks는 그대로, 신규 chunks는 추가, 삭제된 chunks는 soft-delete

**예상 효과**:
- 월간 OpenAI embedding 비용 60~80% 절감 (일반 사내 위키의 경우 페이지당 몇 chunk만 변경)
- 긴 문서의 중간 섹션도 검색 가능
- pgvector IVFFlat 인덱스 유지

---

## 4. 검색 파이프라인 5-Stage 설계

### 4.1 전체 흐름 (qmd 기반)

```
Query
  │
  ├─▶ [Stage 1] Intent Classification (optional)
  │     • 사용자가 명시적 intent 제공 시 사용
  │     • 사내 용어 동음이의어 해결 ("성과" = 인사평가 vs 결과 vs 성능)
  │     • 모델: gpt-4.1-mini + LLM cache 30d
  │
  ├─▶ [Stage 2] Query Expansion (lex + vec + hyde)
  │     • Strong-signal bypass: 첫 BM25 결과 top score ≥ 0.85 + gap ≥ 0.15 시 skip
  │     • JSON Schema로 3-way 출력 강제
  │     • 모델: gpt-4.1-mini + LLM cache 30d
  │
  ├─▶ [Stage 3] Parallel Retrieval
  │     ├─ BM25 (PG FTS with korean tokenizer + mindvault CJK bigram)
  │     ├─ Vector (pgvector cosine on document_chunks)
  │     └─ Graph (graphify BFS 3-depth from keyword-matched seed nodes)
  │     • RBAC 필터: sensitivity + workspaceId + permissions
  │
  ├─▶ [Stage 4] RRF Fusion + Position-Aware Blend
  │     • RRF k=60
  │     • Top-rank bonus: rank 0 → +0.05, rank 1-2 → +0.02
  │     • Rerank blend: top3는 0.75 RRF/0.25 rerank, 4-10은 0.60/0.40, 11+는 0.40/0.60
  │
  ├─▶ [Stage 5] Chunk-Based Rerank
  │     • 40 candidates → 각 문서의 best chunk만 추출 (qmd 최적화)
  │     • 모델: gpt-4.1-mini y/n 배치 평가
  │     • LLM cache 7d (chunk_hash 기준)
  │
  └─▶ Final Result
        • [1][2] 인용 강제
        • citation → wiki_page anchor 점프
        • "왜 이 결과?" explain 트레이스 (관리자 전용)
```

### 4.2 파일 구성

```
packages/search/
├── src/
│   ├── pipeline/
│   │   ├── index.ts              # 전체 5-stage 오케스트레이션
│   │   ├── intent.ts             # Stage 1
│   │   ├── expand.ts             # Stage 2 + strong-signal bypass
│   │   ├── retrieve/
│   │   │   ├── bm25.ts           # PG FTS + CJK
│   │   │   ├── vector.ts         # pgvector
│   │   │   └── graph.ts          # graphify API wrapper
│   │   ├── rrf.ts                # Stage 4 (qmd src/store.ts:3346-3389 직역)
│   │   ├── blend.ts              # Position-aware blend
│   │   └── rerank.ts             # Stage 5 (chunk-based)
│   ├── tokenizer/
│   │   ├── cjk.ts                # mindvault src/mindvault/index.py:13-40 포팅
│   │   └── nori-config.ts        # PG FTS korean config
│   ├── explain.ts                # trace 수집 (관리자 UI용)
│   └── types.ts
└── tests/
    ├── rrf.test.ts               # qmd test/ 케이스 이식
    ├── expand.test.ts
    └── pipeline.test.ts
```

### 4.3 "왜 이 결과?" Explain 트레이스 (qmd --explain 패턴)

관리자 전용 UI에서 각 결과의 점수 기여도 시각화:
- BM25 점수
- Vector 유사도
- Graph hop 거리
- RRF 기여도
- Rerank y/n + 이유 (LLM 응답 일부)
- 최종 blend score

→ 검색 품질 디버깅 필수. Phase-7 W4에서 구현.

---

## 5. 4-Surface 스키마 확장 (Jarvis × llm-wiki-agent)

### 5.1 현재 4-surface vs llm-wiki-agent 4-layer 매핑

| Jarvis 현재 (4-surface) | llm-wiki-agent (4-layer) | 통합 결정 |
|------------------------|-------------------------|-----------|
| `canonical` (정본) | `sources/` + `concepts/` | canonical 유지, sources_refs 필드 추가 |
| `directory` (디렉터리) | `entities/` | directory 유지, entity_kind 필드 확장 |
| `case` (사례/판례) | `sources/` (원본) + `syntheses/` (정리) | case 유지, synthesized_refs 필드 추가 |
| `synthesized` (파생) | `syntheses/` | synthesized 유지, question/answer 필드화 |

### 5.2 신규 스키마 변경 (비파괴 ALTER + 신규 테이블)

**공통 확장**: 모든 4-surface 테이블에 추가될 필드
```ts
// packages/db/src/schema/_common.ts (helper)
export const surfaceCommonColumns = {
  contentHash: text('content_hash').notNull(),
  sourceRefs: text('source_refs').array().notNull().default([]),
  confidence: pgEnum('confidence', ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'])('confidence').notNull().default('EXTRACTED'),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }).notNull().default('1.00'),
  promptVersion: text('prompt_version'),  // 어떤 프롬프트로 생성됐는지
};
```

**wiki_sources 신규** (원본 미팅록·문서):
```ts
export const wikiSources = pgTable('wiki_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  kind: pgEnum('source_kind', ['meeting', 'doc', 'ticket', 'email', 'chat', 'url'])('kind').notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body').notNull(),
  contentHash: text('content_hash').notNull(),
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  origin: jsonb('origin'),  // {url, author, date, source_system}
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  wsSlugUnique: unique().on(t.workspaceId, t.slug),
  hashIdx: index('wiki_sources_hash_idx').on(t.contentHash),
}));
```

**wiki_entities 확장** (directory 확장):
```ts
// 기존 directory 테이블에 ALTER
ALTER TABLE directory ADD COLUMN canonical_id TEXT;
ALTER TABLE directory ADD COLUMN entity_kind TEXT;  -- 'person' | 'product' | ...
ALTER TABLE directory ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX directory_canonical_id_idx ON directory(canonical_id);
```

**wiki_concepts 신규**:
```ts
export const wikiConcepts = pgTable('wiki_concepts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  term: text('term').notNull(),
  definition: text('definition').notNull(),
  synonyms: text('synonyms').array().notNull().default([]),
  examples: jsonb('examples'),
  sourceRefs: text('source_refs').array().notNull().default([]),
  contentHash: text('content_hash').notNull(),
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  confidence: pgEnum('confidence_enum_concepts', ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'])('confidence').notNull().default('EXTRACTED'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  wsTermUnique: unique().on(t.workspaceId, t.term),
}));
```

**wiki_syntheses 신규** (자기강화 Q&A 루프 대상):
```ts
export const wikiSyntheses = pgTable('wiki_syntheses', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  citations: text('citations').array().notNull().default([]),  // wiki_sources/case/etc ids
  askedByUserId: uuid('asked_by_user_id'),
  answeredAt: timestamp('answered_at').defaultNow().notNull(),
  upvotes: integer('upvotes').notNull().default(0),
  downvotes: integer('downvotes').notNull().default(0),
  correctionsJson: jsonb('corrections'),
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  contentHash: text('content_hash').notNull(),
}, (t) => ({
  wsIdx: index('wiki_syntheses_ws_idx').on(t.workspaceId),
  questionGinIdx: index('wiki_syntheses_q_gin_idx').using('gin', sql`to_tsvector('korean', ${t.question})`),
}));
```

### 5.3 3단 신뢰도 엣지 (graphify 차용)

**wiki_edges 신규** (단, graphify가 이중 운영이므로 **Jarvis 네이티브 엣지는 별도 용도**):
```ts
export const wikiEdges = pgTable('wiki_edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  sourceType: text('source_type').notNull(),  // 'wiki_sources' | 'directory' | ...
  sourceId: uuid('source_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  relation: text('relation').notNull(),  // 'mentions' | 'defines' | 'contradicts' | ...
  confidence: pgEnum('edge_confidence', ['EXTRACTED', 'INFERRED', 'AMBIGUOUS'])('confidence').notNull(),
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }).notNull(),
  evidence: jsonb('evidence'),  // { snippet, file, line, ... }
  sensitivity: sensitivityEnum('sensitivity').notNull().default('internal'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  srcIdx: index('wiki_edges_src_idx').on(t.sourceType, t.sourceId),
  tgtIdx: index('wiki_edges_tgt_idx').on(t.targetType, t.targetId),
  relIdx: index('wiki_edges_rel_idx').on(t.relation),
}));
```

**용도 분리**:
- `wiki_edges` = Jarvis 네이티브 (위키 페이지 간 [[wikilink]], mentions, contradicts)
- graphify graph = 코드/저장소 분석 (이중 운영 유지)
- Ask AI는 **둘 다 쿼리** (lane 추가)

---

## 6. 에디터: Tiptap 도입

### 6.1 선택 근거

- **Milkdown vs Tiptap**: 둘 다 ProseMirror. Tiptap이 생태계·문서·extension 수 압도적.
- **Lexical**: Meta 작, React 1급이지만 마크다운 호환에 손이 많이 감
- **BlockNote**: Notion 스타일 매력적이지만 신생, 장기 유지 리스크

**결정**: **Tiptap + `@tiptap/extension-link` + custom wikilink extension**.

### 6.2 구현 파일

```
apps/web/src/components/editor/
├── WikiEditor.tsx           # 'use client' 최상위 컴포넌트
├── extensions/
│   ├── wikilink.ts          # [[slug]] 파서 (llm_wiki enrich-wikilinks 이식)
│   ├── mention.ts           # @user, @team
│   ├── paste-image.ts       # 드래그·붙여넣기 → presigned upload
│   └── slash-menu.ts        # '/' 커맨드 팔레트
├── toolbar/
│   └── WikiToolbar.tsx
└── markdown-io/
    ├── from-markdown.ts     # MD → Tiptap JSON
    └── to-markdown.ts       # Tiptap JSON → MD (저장용)
```

### 6.3 저장 모델

- **primary**: 마크다운 본문 (`wiki_pages.body TEXT`) — 인덱싱·검색·버전관리 용이
- **보조**: Tiptap JSON은 에디터 세션 캐시로만 (localStorage), 저장 시 MD로 변환
- **이유**: 마크다운이 grep/diff/export 다 됨. JSON-only는 락-인.

### 6.4 [[wikilink]] 처리

**입력 시**:
- 사용자가 `[[` 타이핑 → Tiptap suggestion 메뉴 → 기존 페이지 검색
- 선택 시 `[[slug]]` 또는 `[[slug|display]]` 삽입

**저장 후** (`apps/worker/src/jobs/enrich-wikilinks.ts` — llm_wiki 패턴):
1. 페이지 저장 → 본문에서 `[[slug]]` 추출
2. slug → wiki_page.id 매핑
3. `wiki_edges` 테이블에 `relation='wikilink'` INSERT
4. broken link (slug에 해당하는 페이지 없음) → lint 큐 등록

### 6.5 렌더링

`apps/web/src/components/wiki-renderer/WikiRenderer.tsx`:
- `react-markdown` + `remark-gfm` (기존 유지)
- `rehype-plugins` 추가:
  - `rehypeWikilink` — `[[slug]]` → `<Link href="/wiki/slug">` (server-resolved)
  - `rehypeBacklinks` — 페이지 하단에 역참조 섹션 자동 렌더

---

## 7. Ingest 파이프라인 재설계 (Two-Step CoT + JSON Schema)

### 7.1 현재 AS-IS

문서 업로드 → 페이지 생성 → 동기 임베딩 → 끝. Entity/concept 추출 없음.

### 7.2 TO-BE 흐름

```
사용자 업로드
  │
  ├─▶ raw_source 저장 (S3 또는 DB blob)
  │
  ├─▶ apps/worker 큐 enqueue (BullMQ)
  │
  ├─▶ [Step 0] Content hash 계산 + 중복 체크
  │     • 같은 hash 존재 시 skip (content-addressable)
  │
  ├─▶ [Step 1] Analyze (gpt-4.1-mini)
  │     • JSON Schema: { summary, topics, language, key_entities_candidates }
  │     • LLM cache (ttl=null, content_hash 키)
  │
  ├─▶ [Step 2] Generate (gpt-4.1)
  │     • 입력: Step 1 결과 + 원본 + 기존 위키 context (top-k 관련 페이지)
  │     • JSON Schema: ingestResultSchema (surface/entities/concepts/syntheses/contradictions)
  │     • LLM cache (ttl=null)
  │
  ├─▶ [Step 3] Merge strategy (핵심 품질 결정)
  │     • Entity: name + kind 키로 upsert, aliases 병합, contradictions 기록
  │     • Concept: term 키로 upsert, synonyms 병합
  │     • Synthesis: 신규 INSERT only
  │     • Source: 신규 INSERT only (content_hash unique)
  │
  ├─▶ [Step 4] Chunking + Embedding (증분)
  │     • smart chunking (qmd 이식)
  │     • dirty chunks만 OpenAI embeddings batch API
  │
  ├─▶ [Step 5] Graph edges 업데이트
  │     • wikilinks 파싱 → wiki_edges INSERT (EXTRACTED)
  │     • LLM inference: "이 문서에서 추론 가능한 관계" → wiki_edges INSERT (INFERRED/AMBIGUOUS)
  │     • AMBIGUOUS는 리뷰 큐로
  │
  └─▶ [Step 6] graphify subprocess 호출 (코드 repo인 경우만)
        • 기존 이중 운영 패턴 유지
```

### 7.3 Contradictions 처리 (llm-wiki-agent 패턴)

Step 2에서 contradictions 배열이 비어있지 않으면:
1. `review_queue` 테이블에 INSERT (kind='contradiction')
2. 관리자 Slack/이메일 알림 (P2, W4)
3. 관리자 UI에서 "무시 / 신규로 분기 / 기존 수정" 3지선다

---

## 8. Lint / Heal / Eval 루프

### 8.1 주간 Lint Job (llm-wiki-agent + llm_wiki 차용)

`apps/worker/src/jobs/weekly-lint.ts`:
- **Orphan 페이지**: 들어오는 wiki_edges 없음 → 리뷰 큐
- **Broken wikilink**: `[[slug]]` 중 실제 없는 slug → 리뷰 큐
- **Missing entity**: 3회 이상 언급되는 이름 but directory에 없음 → 자동 entity 제안
- **Stale content**: 관련 source 업데이트됐는데 syntheses가 오래됨
- **Data gaps**: concept 중 examples/definition이 ""

### 8.2 자가 치유 Heal Job

`apps/worker/src/jobs/weekly-heal.ts`:
- Missing entity → LLM으로 자동 directory 엔트리 생성 (confidence=INFERRED)
- Stale syntheses → 재생성 (기존 upvote 유지)
- 관리자 리뷰 후 승급 (INFERRED → EXTRACTED)

### 8.3 Eval Harness

`apps/worker/src/eval/`:
- `fixtures/` — 질문-정답 쌍 (사내 QA 대조군)
- `runners/` — 파이프라인 버전별 벤치 (Precision@k, MRR, F1)
- `cron/` — 주 1회 실행 → 회귀 탐지

**metrics**:
- Retrieval: Recall@10, Precision@10, MRR
- Answer: citation 정확도, faithfulness (자동 entailment 체크)
- Cost: 평균 호출 $, 캐시 hit rate
- Latency: p50/p95/p99

**리포트**: Slack channel #jarvis-eval 주간 푸시.

---

## 9. 관측 / 운영 (레퍼런스 밖)

5개 레퍼런스 모두 관측이 없으므로 **자체 구축**:

### 9.1 구조화 로깅

`packages/logger/`:
- pino + pino-pretty (dev)
- level: debug/info/warn/error
- 모든 server action/route에 request_id middleware
- 5000명 동시 추적 가능

### 9.2 Sentry 연동

- `@sentry/nextjs` 도입
- LLM 호출 실패 / 타임아웃 / rate-limit 자동 캡처
- PR 기반 release tracking

### 9.3 OpenAI 비용 대시보드

`apps/web/src/app/(admin)/observability/cost/page.tsx`:
- `llm_cache` + `llm_call_log` 테이블 조인
- 일별 토큰 / 모델별 / op별 집계
- 사용자별 상위 N
- 캐시 hit rate 시계열
- 이상 감지 (전일 대비 200% 초과)

### 9.4 CI/CD (GitHub Actions)

`.github/workflows/ci.yml`:
- push → `pnpm --filter @jarvis/web type-check | lint | test`
- main 머지 → `node scripts/check-schema-drift.mjs` 필수
- tag → 배포 파이프라인 (사용자가 환경 결정)

---

## 10. Phase-7 4주 스프린트 계획

### 10.1 Week 1: 기반 (Foundation)

**목표**: 이후 모든 기능의 공통 기반을 깐다.

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| D1 | `packages/core/src/cache/content-hash.ts` 구현 | contentHash 유틸 + 테스트 | graphify `cache.py:10-33` |
| D1 | `packages/db/src/schema/llm-cache.ts` 마이그레이션 | 0010_llm_cache.sql | qmd 패턴 |
| D2 | `packages/core/src/llm/cached-call.ts` | cachedLLMCall 래퍼 + TTL | qmd + 본 문서 §2.5 |
| D2 | `packages/prompts/` 신규 패키지 스캐폴딩 | 디렉토리 구조 + zod 스키마 | 본 문서 §2.3 |
| D3 | `packages/chunker/` 신규 패키지 + smart chunking 이식 | regex + AST 함수 + 테스트 | qmd `src/store.ts:97-307` |
| D3 | `packages/db/src/schema/embeddings.ts` (document_chunks) | 0011_document_chunks.sql | 본 문서 §3.3 |
| D4 | `apps/worker/src/jobs/reembed-chunks.ts` (증분 재임베딩) | BullMQ job + 테스트 | 본 문서 §3.3 |
| D4 | `packages/search/src/rrf.ts` + position-aware blend | RRF + blend 순수 함수 + 테스트 | qmd `src/store.ts:3346-3389` |
| D5 | `packages/search/src/pipeline/` 5-stage 오케스트레이션 스캐폴딩 | pipeline/index.ts | 본 문서 §4 |
| D5 | 기존 `knowledge_claim`·`precedent_case` 임베딩을 `document_chunks`로 마이그레이션 스크립트 | scripts/migrate-embeddings.ts | - |

**통과 기준**:
- `pnpm test` 전부 통과
- Drift 훅 clean
- `docs/analysis/` 커밋 + README.md 업데이트

### 10.2 Week 2: Ingest 재설계 + 4-Surface 확장

**목표**: 새 문서 업로드 시 Two-Step CoT + 4-surface 생성 동작.

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| D1 | `packages/db/src/schema/wiki-sources.ts` + 마이그 | 0012_wiki_sources.sql | 본 §5.2 |
| D1 | `packages/db/src/schema/wiki-concepts.ts` + 마이그 | 0013_wiki_concepts.sql | 본 §5.2 |
| D2 | `packages/db/src/schema/wiki-syntheses.ts` + 마이그 | 0014_wiki_syntheses.sql | 본 §5.2 |
| D2 | `directory` 테이블 ALTER (canonical_id, kind, aliases) | 0015_directory_ext.sql | 본 §5.2 |
| D3 | `packages/prompts/src/ingest/{analyze,generate}.ts` | prompts + zod 스키마 | llm_wiki + llm-wiki-agent |
| D3 | `apps/worker/src/jobs/ingest-document.ts` (Two-Step CoT) | BullMQ job + 테스트 | 본 §7.2 |
| D4 | Merge strategy 구현 (entity upsert, concept upsert, syn insert) | src/jobs/ingest/merge.ts | 본 §7.2 Step 3 |
| D4 | Contradictions 리뷰 큐 (`review_queue` 확장) | 0016_review_queue_kind.sql | llm-wiki-agent |
| D5 | Integration 테스트: 실제 MD 업로드 → 4-surface 전부 생성 확인 | e2e test | - |

**통과 기준**:
- 10개 샘플 사내 문서로 ingest 테스트 통과
- LLM 비용: 샘플당 < $0.01 (mini + 4.1 라우팅 효과)
- 캐시 hit rate: 재실행 시 > 80%

### 10.3 Week 3: 검색 파이프라인 + 에디터

**목표**: Ask AI가 5-stage 파이프라인을 쓰고, 위키 페이지가 Tiptap으로 편집 가능.

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| D1 | `packages/search/src/pipeline/expand.ts` + strong-signal bypass | Stage 2 구현 | qmd `src/store.ts:4024-4034` + 본 §4 |
| D1 | `packages/search/src/pipeline/intent.ts` | Stage 1 구현 | qmd |
| D2 | `packages/search/src/retrieve/{bm25,vector,graph}.ts` | Stage 3 병렬 검색 | 본 §4.1 |
| D2 | CJK 토크나이저 PG FTS 설정 업데이트 | SQL migration | mindvault `index.py:13-40` |
| D3 | `packages/search/src/rerank.ts` (chunk-based) + LLM cache | Stage 5 | qmd |
| D3 | Ask AI route 기존 로직 교체 | apps/web/src/app/api/ask/route.ts | - |
| D4 | Tiptap 에디터 컴포넌트 (`apps/web/src/components/editor/`) | WikiEditor + extensions | 본 §6 |
| D4 | Wikilink extension + paste-image + slash-menu | editor/extensions/ | llm_wiki enrich-wikilinks |
| D5 | 위키 편집 페이지 통합 (`apps/web/src/app/(app)/wiki/[slug]/edit/page.tsx`) | 페이지 + ko.json 키 | - |
| D5 | Backlinks 렌더링 (페이지 하단) | WikiRenderer.tsx 확장 | - |

**통과 기준**:
- Ask AI 응답 시간 p95 < 3초 (캐시 warm 시)
- 위키 에디터로 실제 페이지 편집 + 저장 + wikilink 작동
- 스크린리더 기본 접근성 통과 (Axe-core)

### 10.4 Week 4: Lint / Eval / Observability

**목표**: 운영 안정성 확보, 회귀 방지.

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| D1 | `apps/worker/src/jobs/weekly-lint.ts` | orphan/broken/missing/stale 탐지 | llm-wiki-agent + llm_wiki |
| D1 | `apps/worker/src/jobs/weekly-heal.ts` | missing entity 자동 생성 | llm-wiki-agent heal.py |
| D2 | `apps/worker/src/eval/{fixtures,runners}/` | eval 하네스 + 사내 QA 100쌍 | qmd finetune eval 구조 |
| D2 | `apps/web/src/app/(admin)/observability/cost/page.tsx` | 비용 대시보드 | 본 §9.3 |
| D3 | `packages/logger/` (pino) + request-id middleware | 구조화 로그 전반 | 본 §9.1 |
| D3 | Sentry 연동 (`@sentry/nextjs`) | 에러 추적 | 본 §9.2 |
| D4 | `.github/workflows/ci.yml` (type-check + lint + test + drift) | GitHub Actions | 본 §9.4 |
| D4 | Explain trace UI (관리자 전용) | `apps/web/src/app/(admin)/search/explain/page.tsx` | qmd `--explain` |
| D5 | QA 전체 시나리오 + 최종 README 업데이트 | CHANGELOG.md | - |
| D5 | 회고 + Phase-8 백로그 작성 | `docs/plan/2026-05-W1-phase-8.md` | - |

**통과 기준**:
- Eval Recall@10 > 기존 대비 +15%
- 비용 대시보드로 일별 $ 확인
- CI green on main
- Sentry 첫 에러 정상 수집

---

## 11. 위험 & 완화책

| 위험 | 가능성 | 영향 | 완화책 |
|------|--------|------|--------|
| Drizzle 스키마 drift 훅 경고 누적 | 중 | 중 | 매 PR에 `pnpm db:generate` 강제 (builder 체크리스트) |
| LLM 캐시 테이블 폭발 | 중 | 낮 | 월 1회 만료 데이터 VACUUM + 전체 8GB 초과 시 알림 |
| Tiptap 번들 크기 증가 | 중 | 중 | `next/dynamic` SSR skip, 에디터 페이지에서만 로드 |
| pgvector IVFFlat 튜닝 | 중 | 높 | 10GB 이전에 probes 조정, HNSW 전환 옵션 문서화 |
| OpenAI 가격 인상 / 모델 deprecation | 낮 | 중 | 모델 ID는 env var. `gpt-4.1` deprecation 시 하루 내 스왑 |
| Contradictions 오탐 | 중 | 낮 | 관리자 리뷰 큐 필수, 자동 적용 금지 |
| 5000명 동시 Ask AI spike | 낮 | 높 | Rate limit (사용자당 10 req/min), BullMQ priority queue |
| i18n 변수 보간 버그 재발 | 중 | 낮 | integrator 체크리스트에 "ko.json ↔ UI 교차검증" 반드시 |
| graphify subprocess 실패 | 중 | 중 | Ask AI는 graph lane 실패 시 BM25+Vector로 degrade (fail-soft) |
| Sentry 비용 | 낮 | 낮 | 환경별 sample rate (prod 10%, staging 100%) |

---

## 12. 버릴 것 (Anti-Patterns)

레퍼런스에서 발견된 것 중 **의도적으로 가져오지 않을 것**:

| 버릴 것 | 출처 | 이유 |
|---------|------|------|
| Tauri/Rust crate | llm_wiki | 웹 서버 환경 불일치 |
| LanceDB | llm_wiki | 이미 pgvector 운영. 전환 비용 > 이득 |
| node-llama-cpp on-device | qmd | 5000명 서버에 VRAM 부족 + 동시성 문제 |
| 파일시스템 DB | mindvault, graphify, llm-wiki-agent | PG ACID 포기 불가 |
| GBNF grammar | qmd | OpenAI 미지원, JSON schema로 대체 |
| Fine-tuning 하네스 | qmd | OpenAI API로 충분. 수년간 불필요 |
| Obsidian vault export | graphify, mindvault | 사내 사용자 Obsidian 쓸 이유 없음 |
| 9개 플랫폼 설치자 | graphify | 무관 |
| launchd / systemd 데몬 | mindvault | 이미 worker 있음 |
| 단일 사용자 가정 (모든) | all | RBAC + workspaceId + sensitivity 필수 |
| Claude Code 중심 런타임 | graphify, llm-wiki-agent | 프로덕션은 BullMQ worker |
| `.llm-wiki/review.json` 등 파일 상태 | llm_wiki | 전부 DB 테이블로 |
| CLI 중심 UX | qmd, mindvault, graphify | Jarvis는 웹 포털 |
| Anthropic SDK (현재 dead) | Jarvis | `package.json`에서 제거 (graphify subprocess는 유지) |

---

## 13. 즉시 실행 체크리스트 (Phase-7 D1 시작 전)

- [ ] 이 문서 + 비교 매트릭스 + 6개 분석 MD를 메인 브랜치에 머지
- [ ] `docs/plan/2026-04-W1-phase-7.md` 신규 (이 문서 요약 링크)
- [ ] `AGENTS.md` 변경 이력 섹션에 Phase-7 항목 추가
- [ ] jarvis-planner 에이전트에게 Week 1 D1 작업 생성 요청
- [ ] `.env.example`에 신규 키 예약: `OPENAI_MODEL_SYNTHESIS=gpt-4.1`, `OPENAI_MODEL_UTILITY=gpt-4.1-mini`, `LLM_CACHE_TTL_DEFAULT_SECONDS=2592000`
- [ ] `package.json` dependencies 클린업: `@anthropic-ai/sdk` 제거 검토 (graphify subprocess와 무관한지 확인)
- [ ] Phase-6의 knowledge debt radar와 Phase-7 Lint를 어떻게 통합할지 planner와 논의

---

## 14. 부록: 레퍼런스 기여 요약

각 레퍼런스가 Jarvis Phase-7에 남기는 "유산":

### graphify
- 3단 신뢰도 엣지 (EXTRACTED/INFERRED/AMBIGUOUS)
- SHA256 per-file 캐시 (YAML frontmatter strip)
- god nodes / surprising connections / suggested questions 분석 레이어
- 자기강화 Q&A → graph 재흡수 루프
- 7개 MCP 쿼리 도구 (HTTP API로 재포장)
- **이중 운영 유지** (이미 결정)

### llm_wiki
- Two-Step CoT Ingest 패턴
- Source Traceability (`sources: []` + 4-신호 relevance)
- 하이브리드 검색 4-phase (참조 → qmd 5-stage로 확장)
- Knowledge Graph Insights
- **Milkdown 대신 Tiptap** (ProseMirror 같은 계열, 생태계 큰 쪽 선택)
- Web Clipper 아이디어 (P2, 외부 수집)
- Review Queue + LLM 검색 쿼리 생성

### llm-wiki-agent
- **4-layer 스키마 (sources/entities/concepts/syntheses) = Jarvis 4-surface 검증**
- 한 방에 JSON 출력 프롬프트 + JSON Schema 강제
- 2-pass 그래프 빌더 (deterministic + LLM inferred)
- Contradictions & Lint / Heal 시스템
- CLAUDE.md = System Prompt 일체화 (`.claude/` 하네스 활용)

### mindvault
- Canonical ID 체계 (`path::kind::local`)
- 한국어 CJK BM25 토크나이저
- Auto-context 강제 주입 철학
- User notes 공존 마커 (자동 생성 vs 수동 편집 영역)
- SHA256 dirty 파일 incremental 패턴
- 3-Layer 질의 (Search + Graph + Wiki — Jarvis 6-lane에 편입)

### qmd
- **RRF + Position-Aware Blend** (검색 품질 최대 기여)
- **Strong-Signal BM25 Bypass** (비용 절감)
- Smart chunking (regex + AST + 거리 감쇠)
- Intent 스티어링 (사내 용어 동음이의어)
- LLM 캐시 (SHA256 기반)
- `--explain` 트레이스 (관리자 UI)
- Content-addressable storage (중복 탐지)
- HyDE 쿼리 (P2)

---

## 15. 용어집 (Glossary)

- **4-surface** — Jarvis의 위키 모델 (canonical / directory / case / synthesized)
- **4-layer** — llm-wiki-agent의 위키 모델 (sources / entities / concepts / syntheses). 4-surface와 1:1 매핑.
- **3단 신뢰도** — 엣지·페이지의 신뢰 수준 (EXTRACTED=파싱 / INFERRED=LLM 추론 / AMBIGUOUS=수동 검토 필요)
- **RRF** — Reciprocal Rank Fusion. 여러 랭킹을 조합하는 표준 알고리즘.
- **Position-Aware Blend** — 순위별로 RRF vs Rerank 가중치를 다르게 (top3=0.75/0.25, 11+=0.40/0.60)
- **Strong-Signal Bypass** — BM25 top score가 매우 높고 gap도 크면 LLM expansion skip
- **Two-Step CoT** — Analyze → Generate 2번 호출, 사이에 Step 1 결과를 context로 주입
- **Ingest** — 문서 업로드 → surface별 엔티티 추출 → 임베딩 → 그래프 엣지 → 저장 전체 파이프라인
- **Heal** — 주간 배치로 누락된 엔티티 자동 생성 + 오래된 syntheses 재생성
- **Lint** — orphan / broken / stale / gap 탐지
- **Eval** — 사내 QA 100쌍으로 파이프라인 버전별 Recall@k, MRR, Precision 측정
- **Self-reinforcing loop** — Ask AI 답변을 wiki_syntheses에 저장 → 다음 주 heal에서 source_refs 강화 → 점점 정확

---

**이 문서 + `99-comparison-matrix.md`가 Phase-7의 모든 의사결정의 근거.**
**실행은 jarvis-planner가 주 단위로 작업을 쪼개서 jarvis-builder에게 dispatch, jarvis-integrator가 교차 검증.**
