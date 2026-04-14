# Jarvis LLM Wiki 통합 계획 v2 (Phase-7A + 7B + 8)

> **생성일**: 2026-04-14 (v1), 같은 날 3-way review 후 **v2 전면 재작성**
> **근거**: `00-jarvis-current-state.md` + `01-graphify.md` + `02-llm_wiki.md` + `03-llm-wiki-agent.md` + `04-mindvault.md` + `05-qmd.md` + `99-comparison-matrix.md` + `99-fact-check.md` + `99-gap-hunt.md` + `99-codex-review-raw.txt` + `99-review-summary.md`
> **상태**: **v2 (current)**. v1은 Codex(gpt-5.4), Fact-check(경로·타입 대조), Gap-hunt(적대적 리뷰) 3-way 검증에서 P0 10개·P1 7개·critical gap 8개 지적 → 전면 재작성.

---

## 0. v1 → v2 핵심 변경 요약

| 축 | v1 (폐기) | v2 (최종) | 근거 |
|----|-----------|-----------|------|
| **스코프** | Phase-7 단일 4주 (ingest+검색+에디터+관측+스키마+그래프+lint+CI 동시) | **Phase-7A(2주 안정화) + 7B(3주 검색/ingest) + Phase-8(에디터·그래프 고도화)** | Codex P0 #1, Gap CTX-03 |
| **모델** | `gpt-4.1-mini` / `gpt-4.1` 혼용 (구버전 문서 가정) | **`gpt-5.4-mini`(utility) + `gpt-5.4`(synthesis)**. env var 추상화. ✅ main 코드는 이미 `gpt-5.4-mini` 기본값 — 스왑 작업 불요 | 사용자 지시 + main 코드 확인 |
| **캐시 키** | `SHA256({op, model, prompt, extra})` | `SHA256({op, model, prompt, extra, promptVersion, workspaceId, sensitivityScope})` | Codex P0 #2·#5, Gap GAP-03 |
| **FK 전략** | `sourceRefs: text[]`, polymorphic text column | 모든 참조는 **junction table** + typed FK. polymorphic 최소화 | Codex P0 #4, Fact P1 #1 |
| **Heal** | 자동 INFERRED 생성 후 바로 RAG 후보 | **`*_draft` 테이블에 격리**, 검색·답변 후보 제외, 관리자 승인 후 승급 | Codex P0 #3 |
| **검색 파이프라인** | 5-stage 전부 동시 구현 (Intent+Expand+HyDE+BM25+CJK+Vector+Graph+RRF+Blend+Rerank) | **MVP: BM25 + chunk vector + RRF + eval** 만. Intent/HyDE/Rerank는 eval 실효 증명 후 추가 | Codex P1 #6 |
| **한국어 FTS** | "PG FTS korean + CJK bigram" 한 줄 | **`pg_bigm` 확장 가능성 조사 + trigram + bigram materialized column** 병행. Zero-downtime re-index (`CREATE INDEX CONCURRENTLY`) | Codex P1 #7, Gap GAP-13 |
| **에디터 (Tiptap)** | W3 D4 1일에 전부 | **Phase-8로 이동**. 7B에는 **기존 textarea에 `[[wikilink]]` 파싱만** | Codex P1 #8, Gap SCOPE-01 |
| **graphify** | "Python subprocess"+Claude Haiku 가정 | **native binary subprocess via `execFile`, LLM 호출 없음** (graphify 바이너리 자체가 tree-sitter + NetworkX + Leiden의 결정론적 파이프라인). retrieval 시점 호출 금지 — materialize된 `graph_node`/`graph_edge` 테이블 SQL BFS만. 의미 보강이 필요하면 @jarvis/ai 별도 단계 | reference_only/graphify 원본 분석(2026-04-14) |
| **관측 순서** | W4에 몰려있음 | **W1 D1부터** `llm_call_log` + pino + request-id + OpenAI cost tracking | Codex P2 #10 |
| **Eval fixture** | W4 D2에 100쌍 한 번에 | **W1부터 백그라운드 큐레이션 트랙** (30→60→100쌍) + `curator_user_id`·`reviewed_by_user_id` 필드 | Gap GAP-07 |
| **경로 오류** | `packages/db/src/schema/`, `apps/web/src/...` 전반 | **`packages/db/schema/`, `apps/web/components/`, `apps/web/app/`** (no `/src`). Worker만 `apps/worker/src/` | Fact P0 #1·#2 |
| **스키마 타입** | `sensitivityEnum`, `vector(...)` 표준 API | `varchar("sensitivity", { length: 30 })` UPPERCASE + `customType<vector>` Jarvis 기존 패턴 | Fact P0 #3·#4 |
| **Migration 번호** | `0010_llm_cache.sql` | **`0009_llm_cache.sql`** (`_journal.json` idx 0-8 = 9 entries) | Fact P0 #5 |
| **precedent_case** | `document_chunks`로 통합 | **별도 lane 유지** (TF-IDF vs OpenAI 1536d는 벡터 공간 불일치) | Gap GAP-01 |
| **Ingest 트랜잭션** | 없음 | `ingest_run` + `ingest_dlq` + BullMQ 3-retry + exponential backoff | Gap GAP-05 |
| **PII** | 고려 없음 | Ingest Step 0 앞에 `redactPII()` + 자동 sensitivity 승급 | Gap GAP-16 |
| **롤백** | 없음 | Feature flag (`FEATURE_*`) 매트릭스 + down migration 스크립트 + 모델 downgrade 스위치 | Gap SCOPE-07 |

---

## 1. 모델 정책 ⭐ (v2에서 가장 중요한 재정립)

### 1.1 기본 원칙

1. **모든 OpenAI 호출은 최신 세대 모델 사용.** 현재 기준 `gpt-5.4-mini` (utility) + `gpt-5.4` (synthesis).
2. **모델 이름은 코드에 박지 않는다.** env var로 추상화. 새 모델 나오면 env 한 줄 바꾸면 됨.
3. **Anthropic 사용 금지 (OpenAI 단일 제공자).** graphify 바이너리도 결정론적이라 Anthropic SDK 불필요. 의미 보강이 필요하면 `@jarvis/ai` (OpenAI) 경유.
4. **모든 LLM 호출은 fallback ladder 명시.** primary 429/500 시 fallback 경로 정의.
5. **모델 스왑 상태:** ✅ main 코드는 이미 `gpt-5.4-mini`가 기본값(`packages/ai/ask.ts:42`, `tutor.ts:10`, `.env.example`). Phase-7A에서 synthesis 모델(`ASK_AI_SYNTHESIS_MODEL=gpt-5.4`) 신규 env만 추가하면 됨.

### 1.2 모델 라우팅 테이블 (v2)

| 호출 지점 | Primary | Fallback (rate-limit/error) | Env var | 이유 |
|----------|---------|---------------------------|---------|------|
| Ask AI lane 라우터 (기존 정규식) | — | — | — | 정규식 유지, LLM 호출 없음 |
| Intent 분류 (신규, 동음이의어 해결, 옵션) | `gpt-5.4-mini` | cached(last known) → regex fallback | `ASK_AI_MODEL` | 짧은 키워드, 속도 중요 |
| Query expansion (lex/vec/hyde 3-way JSON) | `gpt-5.4-mini` | cached → skip expansion | `ASK_AI_MODEL` | 비용 절감, 캐시 적중률 높음 |
| Chunk rerank (y/n 배치) | `gpt-5.4-mini` | cached → RRF-only (no rerank) | `ASK_AI_MODEL` | 배치 속도 |
| Answer 합성 (citation + 한국어 품질) | `gpt-5.4` | `gpt-5.4-mini` degraded + 경고 → cached synthesis | `ASK_AI_SYNTHESIS_MODEL` | 장문·정밀 |
| 4-surface syntheses 생성 (ingest) | `gpt-5.4` | `gpt-5.4-mini` + quality-flag | `ASK_AI_SYNTHESIS_MODEL` | 구조 일관성 |
| Contradictions 감지 (ingest Step 2) | `gpt-5.4` | `gpt-5.4-mini` + confidence 자동 하향 | `ASK_AI_SYNTHESIS_MODEL` | 정밀 추론 |
| Entity/Concept 추출 (ingest Step 2, JSON Schema) | `gpt-5.4` | `gpt-5.4-mini` + review_queue 플래그 | `ASK_AI_SYNTHESIS_MODEL` | 구조 출력 정확성 |
| Lint semantic 체크 (주간 job) | `gpt-5.4-mini` | skip with warning | `ASK_AI_MODEL` | 배치 저비용 |
| HR 튜터 답변 생성 (Phase-6 기존) | `gpt-5.4-mini` | cached tutor response | `ASK_AI_MODEL` | 이미 운영 중, Phase-7 파이프라인 편입 여부는 별도 결정 |

### 1.3 Env var 체계 (Jarvis 기존 컨벤션 존중)

기존 (main 코드 기준, 2026-04-14):
```env
OPENAI_API_KEY=...                 # 단일 제공자
ASK_AI_MODEL=gpt-5.4-mini          # 이미 기본값 — 스왑 불요
```

v2 신규:
```env
ASK_AI_MODEL=gpt-5.4-mini              # 유지
ASK_AI_SYNTHESIS_MODEL=gpt-5.4         # 신규 — synthesis/ingest/contradictions
LLM_CACHE_TTL_DEFAULT_SECONDS=2592000  # 30일 (영구 캐시 금지)
LLM_CACHE_TTL_SYNTHESIS_SECONDS=604800 # 7일 (syntheses는 짧게)
LLM_FALLBACK_ENABLED=true              # fallback ladder 켜기
LLM_DAILY_BUDGET_USD=50                # 일일 비용 상한 (kill switch)
PROMPT_VERSION=2026-04-14              # 프롬프트 패키지 배포 시 버전
FEATURE_TWO_STEP_INGEST=false          # 롤백용 feature flag (기본 off → 7B에 켜기)
FEATURE_DOCUMENT_CHUNKS=false          # 롤백용
FEATURE_LLM_CACHE=false                # 롤백용
FEATURE_HYBRID_SEARCH_MVP=false        # 롤백용
```

### 1.4 Anthropic SDK 정책 (명확화)

- **`packages/ai/package.json:16`의 `@anthropic-ai/sdk` dependency는 제거**. 애플리케이션 코드 어디에서도 import 하지 않음 (fact-check 확인됨).
- **`ANTHROPIC_API_KEY` 환경변수와 `docker/secrets/anthropic_api_key`는 유지**. `graphify` subprocess(`graphify-build.ts:20-22`의 `execFile`)가 이 키로 Claude Haiku를 호출하기 때문.
- **`.env.example:37-40`의 Anthropic 섹션 주석 유지** + "graphify subprocess 전용" 명시 추가.
- **v1에서 잘못 표현된 "Python subprocess"는 "native binary subprocess"**로 모든 문서에서 정정.

---

## 2. Phase 분할 전략 (v2 핵심)

### 2.1 Phase-7A: 안정화 기반 (2주) — "관측·마이그레이션 먼저"

**목표**: 신규 기능 도입 전에 **비용·품질·롤백** 계측 가능 상태로 만든다. Phase-6의 knowledge debt radar와 drift detection이 제대로 돌고 있는지 확인하고, 기존 임베딩의 벡터 공간 분리를 먼저 결정.

**통과 기준**:
- `llm_call_log` 테이블 운영, 일별 비용 대시보드 가시
- `gpt-5.4-mini` 스왑 완료 (env 추상화)
- Eval fixture 30쌍 (초벌) 큐레이션 완료
- `document_chunks` 테이블 생성만 완료 (데이터 migration은 W2 이후)
- `precedent_case` TF-IDF는 그대로 유지, 신규 파이프라인과 분리 선언 문서화

### 2.2 Phase-7B: Ingest 재설계 + 검색 MVP + Lint (3주)

**목표**: 신규 ingest 파이프라인이 feature flag 뒤에서 동작. 검색은 **`BM25 + chunk vector + RRF`** MVP만. Lint/Heal은 draft namespace에 격리.

**통과 기준**:
- `FEATURE_TWO_STEP_INGEST=true` 로 10개 샘플 ingest 성공
- Eval Recall@10 — **최초 baseline 측정** + 두 번째 측정이 baseline 대비 ±N% 범위 내 (+15% 아닌 "회귀 없음")
- Merge resolution matrix 5 케이스 전부 단위 테스트
- Lint/Heal draft 테이블에 쌓이고 관리자 UI에서 승급/폐기 가능
- Contradictions 감지 후 `review_queue`에 kind='contradiction' 들어감
- 모든 새 테이블 workspace FK + varchar sensitivity UPPERCASE

### 2.3 Phase-8: 에디터·그래프 고도화 (Phase-7B 완료 후 별도 plan)

**이 계획서 범위 밖. 개요만 명시.**
- Tiptap/BlockNote 리치 에디터 도입 (wikilink·paste·slash-menu 등)
- 검색 파이프라인 추가 stage (Intent·HyDE·Rerank) — eval 실효 증명 후
- graphify graph lane을 Ask AI에 완전 편입 (현재는 별도 UI)
- god nodes / surprising connections / Louvain 재클러스터링
- 외부 데이터 커넥터 (Notion/Confluence/Web Clipper)
- Simple/Expert UI 차별화 (관리자 전용 기능 분리)

---

## 3. Phase-7A 상세 (2주)

### 3.1 Week 1 — 관측·비용·마이그레이션 기반

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| **D1** | `llm_call_log` 테이블 + 구조화 로깅 패키지 | `packages/db/schema/llm-call-log.ts`, `packages/logger/` 스캐폴딩, `0009_llm_call_log.sql` | Codex P2 #10 |
| **D1** | ✅ (완료) `gpt-5.4-mini` 스왑 — main 코드는 이미 기본값. 스왑 불요 | 확인만 | 2026-04-14 검증 |
| **D1** | `ASK_AI_SYNTHESIS_MODEL=gpt-5.4` 신규 env 도입 | `.env.example`, `packages/ai/config.ts` | v2 §1.3 |
| **D2** | `llm_cache` 테이블 (promptVersion 포함 key) + `cachedLLMCall` 래퍼 | `packages/db/schema/llm-cache.ts`, `packages/ai/cached-call.ts`, `0010_llm_cache.sql` | Gap GAP-03, v2 §7.1 |
| **D2** | LLM fallback ladder 구현 | `packages/ai/router.ts` (primary/fallback pair) | Gap GAP-06 |
| **D3** | `document_chunks` 테이블 스키마 + customType vector + workspace FK | `packages/db/schema/document-chunks.ts`, `0011_document_chunks.sql` (IVFFlat은 raw SQL로) | Fact P0 #4, P1 #1 |
| **D3** | `packages/chunker/` 신규 — smart chunking (regex + AST) | `packages/chunker/regex.ts`, `ast.ts` + unit tests | qmd `src/store.ts:97-307` |
| **D3** | Eval fixture 큐레이션 시작 (guidebook 10쌍 초벌) | `apps/worker/eval/fixtures/2026-04/` | Gap GAP-07 |
| **D4** | `packages/prompts/` 신규 패키지 + Zod 스키마 + version 상수 | `packages/prompts/` flat 레이아웃 | v2 §1.1, §4.2 |
| **D4** | RRF 순수 함수 + position-aware blend (unit test only) | `packages/search/rrf.ts` (기존 flat 레이아웃 준수) | qmd, Gap SCOPE-03 |
| **D5** | 일일 비용 대시보드 MVP (`/admin/cost`) | `apps/web/app/(admin)/observability/cost/page.tsx` (no `/src`) | Fact P0 #2 |
| **D5** | 10개 샘플 corpus 업로드 (MD 3·PDF 3·DOCX 2·text 2) | `docs/eval/sample-corpus.md` 인덱스 | Gap SCOPE-04 |
| **D5** | Phase-6 knowledge-debt vs Phase-7 lint 매핑 문서 | `docs/plan/2026-04-W1-phase6-lint-mapping.md` | Gap GAP-14 |

### 3.2 Week 2 — precedent_case 분리 선언 + 관측 정교화 + 샘플 ingest

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| **D1** | `precedent_case` TF-IDF lane 분리 문서화 | `docs/data/precedent-case-separate-lane.md` (벡터 공간 불일치 설명) | Gap GAP-01 |
| **D1** | workspaceId injection 가드 헬퍼 + lint 룰 | `packages/shared/validation/workspace-guard.ts` | Gap GAP-12 |
| **D2** | PII redactor 1차 (regex 기반) | `packages/shared/pii/redactor.ts` + 테스트 | Gap GAP-16 |
| **D2** | Eval fixture 30쌍 누적 (TSVD999 10 + directory 5 + search_log 5) | `apps/worker/eval/fixtures/2026-04/` | Gap GAP-07 |
| **D3** | Sentry 연동 + OpenAI 에러/타임아웃 자동 캡처 | `sentry.client.config.ts`, `sentry.server.config.ts` | v2 §11 |
| **D3** | Cost kill-switch (`LLM_DAILY_BUDGET_USD` 초과 시 자동 차단) | `packages/ai/budget-guard.ts` | Gap 누락 (신규 추가) |
| **D4** | CI/CD GitHub Actions — `turbo type-check lint test` + drift hook | `.github/workflows/ci.yml` | Fact P1 #7 |
| **D4** | 롤백 plan 문서 + feature flag 매트릭스 | `docs/plan/2026-04-W2-rollback-matrix.md` | Gap SCOPE-07 |
| **D5** | 통합 테스트: 기존 ask.ts가 `llm_cache` miss 시 `llm_call_log` 기록 | 통합 테스트 파일 | - |
| **D5** | 5000명 변경 공지 초안 + staff FAQ 초안 | `docs/communication/phase-7-announce-draft.md` | Gap SCOPE-06 |
| **D5** | **Phase-7A 통과 체크** (아래 §3.3) | `docs/plan/2026-04-W2-phase-7a-passed.md` | - |

### 3.3 Phase-7A 통과 게이트 (엄격)

다음이 **모두** 참이어야 Phase-7B 진입:
- [ ] `llm_call_log`에 하루치 이상 실제 프로덕션 호출 기록됨
- [ ] `ASK_AI_MODEL=gpt-5.4-mini`, `ASK_AI_SYNTHESIS_MODEL=gpt-5.4` 운영 중
- [ ] `/admin/cost` 대시보드에서 일별·모델별·op별 비용 가시
- [ ] Eval fixture 30쌍 이상 `curator_user_id`·`reviewed_by_user_id` 있는 상태로 존재
- [ ] Phase-6 drift detection 살아있음 (최근 7일 내 알림 1건 이상 혹은 정상 체크)
- [ ] `document_chunks` 테이블 존재 but `FEATURE_DOCUMENT_CHUNKS=false` (데이터는 아직 없음)
- [ ] `.env.example` 전 항목 확정 + staff rollback 문서 공유
- [ ] `packages/shared/pii/redactor.ts`에 기본 패턴(주민번호·계좌·이메일) 대응
- [ ] 코드리뷰 + schema-drift hook clean

---

## 4. Phase-7B 상세 (3주)

### 4.1 Week 3 — Ingest 재설계 (Two-Step CoT + JSON Schema + DLQ)

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| **D1** | `wiki_sources` 테이블 + `0012_wiki_sources.sql` (workspace FK + varchar sensitivity + withTimezone) | `packages/db/schema/wiki-sources.ts` | Fact P0 #1·#3, P1 #1 |
| **D1** | `wiki_concepts` + `0013_wiki_concepts.sql` | `packages/db/schema/wiki-concepts.ts` | 위와 동일 |
| **D2** | `wiki_syntheses` + `0014_wiki_syntheses.sql` | `packages/db/schema/wiki-syntheses.ts` | 위와 동일 |
| **D2** | `directory` ALTER (canonical_id, entity_kind, aliases) + `0015_directory_ext.sql` | SQL migration | - |
| **D2** | **Junction tables** `wiki_source_refs`, `wiki_citations` — polymorphic text[] 대체 | `packages/db/schema/wiki-junction.ts` + `0016_wiki_junction.sql` | Codex P0 #4 |
| **D3** | `wiki_edges` + Draft 네임스페이스 (`*_draft`) 신규 | `packages/db/schema/wiki-edges.ts`, `packages/db/schema/wiki-draft.ts` | Codex P0 #3 |
| **D3** | `packages/prompts/ingest/{analyze,generate}.ts` + Zod 스키마 완성 | `ingestResultSchema` 100% | llm-wiki-agent `tools/ingest.py:141-157` |
| **D4** | `apps/worker/src/jobs/ingest-document.ts` Two-Step CoT + `ingest_run` + `ingest_dlq` | `ingest-run.ts`, `ingest-dlq.ts`, `0017_ingest_run.sql` | Gap GAP-05 |
| **D4** | Merge strategy 구현 (entity upsert / concept upsert / contradictions 리뷰 큐) | `apps/worker/src/jobs/ingest/merge.ts` + 5 케이스 unit test | Gap GAP-02 |
| **D5** | 10개 샘플 ingest 통합 테스트 + 비용 측정 | `apps/worker/__tests__/ingest-integration.test.ts` | v2 §4.4 |
| **D5** | `review_queue.kind` 확장 (contradiction·security_suspect·missing_entity·alias_conflict) | `0018_review_queue_kind.sql` + UI에 배지 | Gap GAP-02 |

### 4.2 Week 4 — 검색 MVP + 리뷰 큐 UI + Lint 1차

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| **D1** | `packages/search/retrieve/bm25.ts` — PG FTS + `pg_bigm`/`pg_trgm` | 함수 + 테스트 | Codex P1 #7 |
| **D1** | `packages/search/retrieve/vector.ts` — pgvector cosine + workspace post-filter × 3 확대 | 함수 + 테스트 | Gap GAP-11 |
| **D2** | `packages/search/pipeline/mvp.ts` = BM25 + vector + RRF (Intent/HyDE/Rerank 없음) | 함수 + e2e 테스트 | Codex P1 #6 |
| **D2** | Ask API 라우트 교체 (`apps/web/app/api/ask/route.ts`) + feature flag | feature flag ON/OFF로 전환 가능 | v2 §1.3 |
| **D3** | Eval fixture 60쌍까지 확대 + Recall@10 baseline 측정 | `apps/worker/eval/runners/baseline.ts` + 측정 결과 MD | Gap GAP-07 |
| **D3** | `zero-downtime re-index` 절차 문서 + `knowledge_page.searchVector` `CREATE INDEX CONCURRENTLY` | `docs/ops/zero-downtime-reindex.md` | Gap GAP-13 |
| **D4** | Lint 1차 job (orphan / broken wikilink / missing entity) — **결과는 `*_draft`에만** | `apps/worker/src/jobs/weekly-lint.ts` | Codex P0 #3 |
| **D4** | Review queue UI — contradictions·missing entity 승급/폐기 | `apps/web/app/(admin)/review/page.tsx` + ko.json 키 | - |
| **D5** | Citation 링크 클릭 시 원문 하이라이팅 POC | `apps/web/components/citation/highlight.tsx` | - |
| **D5** | **W4 통과 체크**: MVP 동작 + eval baseline 측정 + review queue 사용 가능 | `docs/plan/2026-04-W4-phase-7b-midpoint.md` | - |

### 4.3 Week 5 — wikilink 파싱 + Heal draft + Eval 확장 + 회고

| 일 | 작업 | 산출물 | 근거 |
|----|------|--------|------|
| **D1** | 기존 textarea 에디터에 `[[wikilink]]` 파싱만 추가 (Tiptap 아님) | `apps/web/components/editor/wiki-preview.tsx` + remark plugin | Codex P1 #8 |
| **D1** | Wikilink 서버 사이드 resolver + broken link 감지 → lint draft | - | llm_wiki `enrich-wikilinks.ts` |
| **D2** | Heal 1차 (missing entity → LLM 자동 생성) — **결과는 `wiki_entities_draft`에만** | `apps/worker/src/jobs/weekly-heal.ts` | Codex P0 #3 |
| **D2** | 관리자 Heal 승급 워크플로우 | `apps/web/app/(admin)/heal/page.tsx` | - |
| **D3** | Eval fixture 100쌍 완성 + **두 번째 측정**: 회귀 없음 확인 | 측정 리포트 MD | Gap GAP-07 |
| **D3** | Strong-signal BM25 bypass 조건 충족률 측정 (`search_log` 샘플) | 측정 리포트 | Gap OC-07 |
| **D4** | Backlinks 렌더링 (페이지 하단 자동) | `apps/web/components/wiki/backlinks.tsx` | - |
| **D4** | i18n 감사 + ko.json 신규 키 통합 (예상 60~80개) | `apps/web/messages/ko.json` diff | Gap SCOPE-05 |
| **D5** | 최종 QA + 5000명 공지 확정 + staff FAQ 배포 | `docs/communication/phase-7-announce-final.md` | Gap SCOPE-06 |
| **D5** | 회고 + Phase-8 백로그 초안 | `docs/plan/2026-04-W5-retro.md`, `docs/plan/2026-05-phase-8-backlog.md` | - |

### 4.4 Phase-7B 통과 게이트

- [ ] `FEATURE_TWO_STEP_INGEST=true`로 10개 샘플 ingest 성공 + 비용 기록
- [ ] Eval Recall@10 baseline 측정 완료 + 두 번째 측정에서 회귀 없음
- [ ] Merge resolution matrix 5 케이스 unit test 모두 green
- [ ] Lint/Heal 결과 `*_draft` 테이블에만 존재 (프로덕션 검색 비대상)
- [ ] Contradictions 관리자 승급/폐기 UI 동작
- [ ] `[[wikilink]]` 파싱 + backlinks 기본 동작
- [ ] `pg_bigm` 또는 `pg_trgm` 결정 완료 + zero-downtime re-index 실전 경험
- [ ] Phase-8 백로그 문서화

---

## 5. 스키마 전체 (Corrected, Jarvis 패턴 준수)

### 5.1 공통 헬퍼 (신규)

```ts
// packages/db/schema/_helpers.ts
import { varchar, customType, timestamp } from "drizzle-orm/pg-core";

// 기존 패턴 그대로 (knowledge.ts:21-25, case.ts:22-27)
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return JSON.parse(value as string);
  },
});

// 기존 컨벤션 그대로 (varchar + UPPERCASE)
export const sensitivity = () =>
  varchar("sensitivity", { length: 30 }).notNull().default("INTERNAL");

// withTimezone 강제
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
```

### 5.2 `llm_call_log` (Phase-7A W1 D1) — 관측의 근간

```ts
// packages/db/schema/llm-call-log.ts
import { pgTable, uuid, text, timestamp, integer, decimal, index } from "drizzle-orm/pg-core";
import { workspace } from "./system";
import { sensitivity, createdAt } from "./_helpers";

export const llmCallLog = pgTable("llm_call_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  userId: uuid("user_id"), // nullable (system calls)
  requestId: text("request_id").notNull(),           // pino middleware
  op: text("op").notNull(),                          // 'ask' | 'ingest.analyze' | 'rerank' | 'synthesis' | ...
  model: text("model").notNull(),
  promptVersion: text("prompt_version"),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
  durationMs: integer("duration_ms"),
  statusCode: integer("status_code"),                // 200 / 429 / 500 / ...
  errorKind: text("error_kind"),                     // 'rate_limit' | 'timeout' | 'bad_request' | ...
  fallbackModel: text("fallback_model"),             // null if primary succeeded
  cacheHit: text("cache_hit"),                       // 'hit' | 'miss' | 'skip'
  sensitivity: sensitivity(),                         // 요청 컨텍스트의 최고 sensitivity
  createdAt: createdAt(),
}, (t) => ({
  wsIdx: index("llm_call_log_ws_idx").on(t.workspaceId, t.createdAt),
  opModelIdx: index("llm_call_log_op_model_idx").on(t.op, t.model, t.createdAt),
  requestIdx: index("llm_call_log_req_idx").on(t.requestId),
}));
```

### 5.3 `llm_cache` — promptVersion/workspaceId/sensitivityScope가 key 구성 요소

```ts
// packages/db/schema/llm-cache.ts
import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createdAt } from "./_helpers";

export const llmCache = pgTable("llm_cache", {
  cacheKey: text("cache_key").primaryKey(),
  // cacheKey = SHA256(JSON.stringify({
  //   op, model, prompt, extra,
  //   promptVersion,        // Codex P0 #5, Gap GAP-03
  //   workspaceId,          // Codex P0 #2
  //   sensitivityScope,     // 최고 sensitivity 레벨
  // }))
  op: text("op").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version"),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  result: text("result").notNull(),                   // JSON-as-text
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = 30일 default, 영구 금지
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }), // 관리자 CLI 또는 prompt version bump 시
}, (t) => ({
  opIdx: index("llm_cache_op_idx").on(t.op),
  expiresIdx: index("llm_cache_expires_idx").on(t.expiresAt),
  promptVersionIdx: index("llm_cache_prompt_version_idx").on(t.promptVersion),
}));
```

### 5.4 `document_chunks` — 청크 단위 임베딩 (workspace FK + customType)

```ts
// packages/db/schema/document-chunks.ts
import { pgTable, uuid, text, integer, index, unique } from "drizzle-orm/pg-core";
import { workspace } from "./system";
import { vector, sensitivity, createdAt, updatedAt } from "./_helpers";

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),

  // Polymorphic ref (Codex P0 #4 타협): documentType + documentId + 별도 junction은 과도
  // → 대신 CHECK constraint으로 documentType 값 한정 + 애플리케이션 레벨 FK guard
  documentType: text("document_type").notNull(), // 'knowledge_page' | 'wiki_sources' | 'wiki_syntheses' | ...
  documentId: uuid("document_id").notNull(),

  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  tokens: integer("tokens").notNull(),
  sensitivity: sensitivity(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  uniq: unique().on(t.documentType, t.documentId, t.chunkIndex),
  docIdx: index("document_chunks_doc_idx").on(t.documentType, t.documentId),
  hashIdx: index("document_chunks_hash_idx").on(t.contentHash),
  // IVFFlat 인덱스는 raw SQL migration에서 (프로젝트 컨벤션)
  // CREATE INDEX document_chunks_vec_idx ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  workspaceIdx: index("document_chunks_ws_idx").on(t.workspaceId),
}));
```

**CHECK constraint** (raw SQL in `0011_document_chunks.sql`):
```sql
ALTER TABLE document_chunks
  ADD CONSTRAINT document_chunks_type_chk
  CHECK (document_type IN ('knowledge_page', 'wiki_sources', 'wiki_syntheses', 'wiki_concepts'));
```

### 5.5 `wiki_sources` / `wiki_concepts` / `wiki_syntheses` / `wiki_edges` / `*_draft`

```ts
// packages/db/schema/wiki-sources.ts
import { pgTable, uuid, text, pgEnum, jsonb, unique, index } from "drizzle-orm/pg-core";
import { workspace } from "./system";
import { sensitivity, createdAt } from "./_helpers";

export const sourceKindEnum = pgEnum("source_kind", ["meeting", "doc", "ticket", "email", "chat", "url"]);

export const wikiSources = pgTable("wiki_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  kind: sourceKindEnum("kind").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body").notNull(),
  contentHash: text("content_hash").notNull(),
  sensitivity: sensitivity(),
  origin: jsonb("origin"),  // { url, author, date, source_system }
  createdAt: createdAt(),
}, (t) => ({
  wsSlugUnique: unique().on(t.workspaceId, t.slug),
  hashIdx: index("wiki_sources_hash_idx").on(t.contentHash),
}));

// wiki_sources_draft — Heal/LLM 자동 생성물은 여기 먼저
export const wikiSourcesDraft = pgTable("wiki_sources_draft", {
  // 동일 구조 + originatingRun uuid + reviewStatus enum
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  originatingRunId: uuid("originating_run_id"),      // ingest_run 또는 heal_run 참조
  proposedData: jsonb("proposed_data").notNull(),    // 동일 구조 JSON
  reviewStatus: pgEnum("review_status", ["pending", "approved", "rejected", "expired"])("review_status").notNull().default("pending"),
  reviewedByUserId: uuid("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
});
```

`wiki_concepts`, `wiki_syntheses`, `wiki_edges`도 동일 패턴. 모두 `*_draft` 변형 존재.

### 5.6 Junction table — polymorphic text[] 대체

```ts
// packages/db/schema/wiki-junction.ts
import { pgTable, uuid, text, pgEnum, index, unique } from "drizzle-orm/pg-core";
import { workspace } from "./system";
import { createdAt } from "./_helpers";

// wiki_source_refs: wiki_entities / wiki_concepts / wiki_syntheses가 어느 wiki_sources를 참조하는지
export const wikiSourceRefs = pgTable("wiki_source_refs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  refererType: pgEnum("referer_type", ["wiki_entity", "wiki_concept", "wiki_synthesis", "case"])("referer_type").notNull(),
  refererId: uuid("referer_id").notNull(),
  sourceId: uuid("source_id").notNull(),  // wiki_sources.id (FK 강제 어려움 — trigger로 보정 또는 nullable)
  relation: text("relation"),              // 'mentions' | 'defines' | 'cites' | ...
  createdAt: createdAt(),
}, (t) => ({
  refererIdx: index("wiki_source_refs_referer_idx").on(t.refererType, t.refererId),
  sourceIdx: index("wiki_source_refs_source_idx").on(t.sourceId),
  uniq: unique().on(t.refererType, t.refererId, t.sourceId, t.relation),
}));

// wiki_citations: wiki_syntheses.answer 안에서 참조한 문서들 (citation은 UI에서 [1][2] 클릭 지원)
export const wikiCitations = pgTable("wiki_citations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  synthesisId: uuid("synthesis_id").notNull(),       // FK → wiki_syntheses.id
  citationIndex: integer("citation_index").notNull(), // [1], [2], [3]
  citedType: pgEnum("cited_type", ["wiki_sources", "knowledge_page", "case", "directory", "wiki_concept"])("cited_type").notNull(),
  citedId: uuid("cited_id").notNull(),
  snippet: text("snippet"),
  createdAt: createdAt(),
}, (t) => ({
  synIdx: index("wiki_citations_syn_idx").on(t.synthesisId),
  citedIdx: index("wiki_citations_cited_idx").on(t.citedType, t.citedId),
}));
```

### 5.7 `ingest_run` / `ingest_dlq` — 트랜잭션·재시도·DLQ

```ts
// packages/db/schema/ingest-run.ts
import { pgTable, uuid, text, jsonb, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { workspace } from "./system";
import { createdAt, updatedAt } from "./_helpers";

export const ingestStatusEnum = pgEnum("ingest_status", [
  "pending", "step1_analyze", "step2_generate", "step3_merge",
  "step4_embed", "step5_edges", "step6_graphify", "done", "failed", "dlq",
]);

export const ingestRun = pgTable("ingest_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  sourceHash: text("source_hash").notNull(),         // content hash of input
  status: ingestStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  stepOutputs: jsonb("step_outputs").notNull().default({}),  // 각 step 결과 캐시
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  statusIdx: index("ingest_run_status_idx").on(t.status),
  hashIdx: index("ingest_run_hash_idx").on(t.sourceHash),
}));

export const ingestDlq = pgTable("ingest_dlq", {
  id: uuid("id").defaultRandom().primaryKey(),
  ingestRunId: uuid("ingest_run_id").notNull(),
  finalError: text("final_error").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
});
```

---

## 6. Cache + Transaction + Fallback 설계

### 6.1 Cache key 구성 (최종)

```ts
// packages/ai/cache-key.ts
import { createHash } from "node:crypto";

export function buildCacheKey(params: {
  op: string;
  model: string;
  prompt: string;
  extra?: unknown;
  promptVersion: string;     // 필수
  workspaceId: string;       // 필수 (테넌트 격리)
  sensitivityScope: string;  // 요청 컨텍스트의 최고 sensitivity
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      op: params.op,
      model: params.model,
      prompt: params.prompt,
      extra: params.extra ?? null,
      promptVersion: params.promptVersion,
      workspaceId: params.workspaceId,
      sensitivityScope: params.sensitivityScope,
    }))
    .digest("hex");
}
```

**key 구성 요소 근거**:
- `promptVersion`: 프롬프트 템플릿 변경 시 자동 miss (Gap GAP-03)
- `workspaceId`: 테넌트 간 격리 (Codex P0 #2)
- `sensitivityScope`: 권한 경계 간 격리

### 6.2 Cache TTL 정책

- **기본 30일** (`LLM_CACHE_TTL_DEFAULT_SECONDS=2592000`)
- **Synthesis 7일** (`LLM_CACHE_TTL_SYNTHESIS_SECONDS=604800`) — 답변 품질 정정 빠르게 반영
- **영구 캐시(ttl=null) 금지** — Codex P0 #5
- **수동 invalidation CLI**: `pnpm cli llm-cache invalidate --op=synthesis --older-than=7d`
- **Prompt version bump** → 배포 시 이전 version 키 자동 `invalidated_at` 스탬프

### 6.3 Fallback Ladder (LLM_FALLBACK_ENABLED=true 시)

```ts
// packages/ai/router.ts
export async function callWithFallback<T>(params: {
  op: string;
  executor: (model: string) => Promise<T>;
  primary: string;    // gpt-5.4 or gpt-5.4-mini
  fallback?: string;  // gpt-5.4-mini or null
  cacheKey: string;
}): Promise<{ result: T; modelUsed: string; degraded: boolean }> {
  try {
    const result = await params.executor(params.primary);
    return { result, modelUsed: params.primary, degraded: false };
  } catch (err) {
    if (isRateLimited(err) || isTimeout(err)) {
      // 1차: fallback 모델
      if (params.fallback) {
        try {
          const result = await params.executor(params.fallback);
          logger.warn({ op: params.op, primary: params.primary, fallback: params.fallback }, "llm_fallback_used");
          return { result, modelUsed: params.fallback, degraded: true };
        } catch (fallbackErr) {
          // 2차: 기존 캐시 (stale OK)
          const cached = await getCachedResult(params.cacheKey, { allowStale: true });
          if (cached) {
            logger.warn({ op: params.op }, "llm_stale_cache_served");
            return { result: cached as T, modelUsed: "cache-stale", degraded: true };
          }
          throw fallbackErr;
        }
      }
    }
    throw err;
  }
}
```

### 6.4 Ingest 트랜잭션 / 재시도 / DLQ

```
Ingest Pipeline (Phase-7B)
  │
  ├─▶ Step 0: Content hash + 중복 체크 + redactPII()
  │       (같은 hash 존재 시 skip, ingest_run.status='done' 기록)
  │
  ├─▶ Step 1: Analyze (gpt-5.4-mini)
  │       → llm_cache 우선. miss 시 호출. 결과 ingest_run.step_outputs.step1 저장.
  │
  ├─▶ Step 2: Generate (gpt-5.4, JSON Schema)
  │       → llm_cache 우선. miss 시 호출.
  │
  ├─▶ Step 3: Merge (DB Transaction START)
  │       → Merge Resolution Matrix 적용 (§8)
  │       → entity/concept upsert, syntheses INSERT, sources INSERT
  │       → contradictions → review_queue INSERT
  │       → Transaction COMMIT만 Step 3 끝내고 즉시. 임베딩은 async.
  │
  ├─▶ Step 4: Chunking + Embedding (async worker)
  │       → smart chunking (qmd 이식)
  │       → dirty chunks만 OpenAI embeddings batch API
  │       → 실패 시 BullMQ retry 3회 (exponential 10s/60s/600s)
  │       → 3회 실패 → ingest_dlq INSERT
  │
  ├─▶ Step 5: Graph edges 업데이트 (wiki_edges)
  │       → wikilinks 파싱 + LLM inference (gpt-5.4)
  │       → INFERRED/AMBIGUOUS → wiki_edges_draft
  │       → EXTRACTED (regex) → wiki_edges 직접
  │
  └─▶ Step 6: graphify subprocess (코드 repo일 때만)
        → execFile timeout 300s, fail-soft (앞 단계 보존)
        → 실패 시 재큐만 (본 ingest는 성공 처리)
```

**BullMQ retry 전략**:
- 기본 3회, exponential backoff `10s → 60s → 600s`
- DLQ 진입 후 관리자 수동 재시도 가능
- `ingest_run.status='dlq'` + Slack 알림

---

## 7. Merge Resolution Matrix (§4.1 Step 3 상세)

Ingest Step 3에서 entity/concept merge 시 반드시 다음 매트릭스 적용:

| # | 케이스 | 입력 | 동작 |
|---|--------|------|------|
| 1 | 신규 entity | `name+kind` 키로 DB에 없음 | 새 row INSERT, `confidence=EXTRACTED` |
| 2 | 완전 일치 (canonicalId 동일) | 같은 `name+kind`, 같은 `canonicalId` | `aliases` 합집합 upsert, `updatedAt` 갱신 |
| 3 | 동명이의 (canonicalId 다름) | 같은 `name+kind`, 다른 `canonicalId` | **양쪽 모두 유지**, `review_queue` INSERT (`kind='entity_conflict'`), 관리자가 병합/분리 결정 |
| 4 | 다른 kind | 같은 `name`, 다른 `kind` | 별도 row (join key = `name+kind`), 정상 처리 |
| 5 | Alias 충돌 | 새 entity의 alias가 기존 entity의 name과 중복 | **양측을 review_queue 에 기록** (`kind='alias_conflict'`), 새 entity는 해당 alias 제외한 채 INSERT |
| 6 | Concept synonym 충돌 | 동일 synonym이 서로 다른 term에 매핑 | 우선순위: 가장 최근 `updatedAt`. 나머지는 `review_queue` (`kind='synonym_conflict'`) |
| 7 | `confidence=AMBIGUOUS` 출력 | LLM이 AMBIGUOUS 내뱉음 | **DB 쓰기 금지**. `wiki_*_draft` + `review_queue` (`kind='ambiguous_ingest'`) 먼저 |

---

## 8. 검색 파이프라인 MVP (v2, 단순화)

### 8.1 MVP 흐름 (Phase-7B W4)

```
Query
  │
  ├─▶ Lane 라우터 (기존 정규식, 그대로 유지, LLM 호출 X)
  │
  ├─▶ Parallel Retrieval (2 lanes only)
  │     ├─ BM25 (PG FTS + pg_bigm if available + pg_trgm)
  │     └─ Vector (pgvector cosine on document_chunks, workspace filter × 3 over-fetch)
  │
  ├─▶ RRF Fusion (k=60) + top-rank bonus
  │
  └─▶ Final Result
        • [1][2] 인용 (wiki_citations 테이블 기록)
        • 답변 합성은 gpt-5.4 + fallback ladder
```

**Phase-7B에 포함 안 되는 것** (Phase-8로 이동):
- Intent classification
- Query expansion (lex/vec/hyde)
- Graph lane
- Chunk rerank
- Strong-signal bypass (먼저 실측 후 결정)
- HyDE

### 8.2 실효 증명 후 단계 추가 (Phase-8)

Eval harness로 실제 Recall@10 측정:
- **Step A**: BM25 + vector + RRF baseline
- **Step B** (+Intent): baseline 대비 Recall 상승? → yes면 추가
- **Step C** (+Query expansion): 상승? → yes면 추가
- **Step D** (+Graph lane): 상승? → yes면 추가
- **Step E** (+Chunk rerank): 상승? → yes면 추가

**매 단계에 Strong-signal bypass 조건** (0.85 / 0.15) **실측으로 튜닝**. 매직넘버 금지.

### 8.3 한국어 FTS 전략

**Phase-7B W4 D1에 결정**:
- 옵션 A: `pg_bigm` 확장 설치 가능 → bigram GIN index + `=%` 연산자
- 옵션 B: `pg_trgm` 유지 + 한국어 bigram은 materialized column으로 수동 저장 (`tsvector_update_trigger`)
- 옵션 C: OpenSearch 재도입 (Phase-8 이후 검토, 현재는 과도)

**Zero-downtime re-index**: 기존 `knowledge_page.searchVector` GIN 인덱스 재생성 시 `CREATE INDEX CONCURRENTLY` + shadow column dual-run 2주.

---

## 9. PII Redaction + Security

### 9.1 redactPII() 1차 (Phase-7A W2)

```ts
// packages/shared/pii/redactor.ts
const PATTERNS = [
  { kind: "ssn_kr",   re: /\b\d{6}-\d{7}\b/g,                     mask: "[SSN]" },
  { kind: "phone_kr", re: /\b01[016-9]-?\d{3,4}-?\d{4}\b/g,       mask: "[PHONE]" },
  { kind: "email",    re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,        mask: "[EMAIL]" },
  { kind: "card",     re: /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g,         mask: "[CARD]" },
  { kind: "account",  re: /\b\d{3}-\d{2,6}-\d{6,}\b/g,            mask: "[ACCOUNT]" },
];

export function redactPII(input: string): { masked: string; hits: Array<{ kind: string; count: number }> } {
  let masked = input;
  const hits: Array<{ kind: string; count: number }> = [];
  for (const { kind, re, mask } of PATTERNS) {
    const matches = masked.match(re);
    if (matches?.length) {
      hits.push({ kind, count: matches.length });
      masked = masked.replace(re, mask);
    }
  }
  return { masked, hits };
}
```

**Phase-8에서 `presidio-analyzer` 또는 유사 프로덕션 라이브러리로 업그레이드.**

### 9.2 자동 Sensitivity 승급

Ingest Step 0에서:
- PII hits 수 ≥ 3 → `sensitivity = "RESTRICTED"`
- PII hits 중 `ssn_kr` 포함 → `sensitivity = "SECRET_REF_ONLY"`
- `review_queue` (`kind='sensitivity_promotion'`) 기록

### 9.3 Input Sanitization (Zod 강화)

```ts
// packages/prompts/ingest/schema.ts
export const entitySchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["person", "product", "project", "customer", "team"]),
  canonicalId: z.string().regex(/^[a-z0-9:_-]+$/).max(200), // path traversal 차단
});
```

### 9.4 Prompt Injection 완화

- Step 2 LLM 호출 시 원본 문서를 **`<user_content>...</user_content>` 태그로 감싸기** (모델이 user content와 system instruction 구분).
- Ingest 결과 JSON의 `relation` 필드가 특정 whitelist 외 값이면 `review_queue`.
- UI 렌더 시 `react-markdown`의 `rehype-sanitize` 적용 (javascript: URL 차단).

---

## 10. Phase-6 ↔ Phase-7 Lint 매핑

| Phase-6 기능 | Phase-7 신규 | 관계 | 결정 |
|-------------|-------------|------|------|
| Knowledge Debt Radar (`apps/web/components/knowledge/KnowledgeDebtRadar.tsx`) | weekly-lint (orphan/broken/missing/stale) | **확장** | 기존 대시보드 유지. Phase-7 lint 결과를 동일 위젯이 소비하도록 데이터 레이어 추가 |
| Drift Detection (`apps/web/app/actions/drift-detection.ts`) | contradictions 감지 (ingest Step 2) | **보완** | drift는 문서 간 시간 기반. contradictions는 semantic 기반. 둘 다 유지. UI는 탭 분리 |
| HR Tutor (`packages/ai/tutor.ts`) | 새 검색 파이프라인 | **보완** | Phase-7B에서는 튜터는 기존 경로 유지. Phase-8에 검색 MVP로 통합 검토 |
| 기존 `review_queue` | contradictions, missing_entity, alias_conflict, sensitivity_promotion | **확장** | `kind` 컬럼 enum 확장. 기존 UI는 kind 필터 탭 추가로 호환 |

---

## 11. 관측 / 비용 / 롤백

### 11.1 관측 (W1 D1부터)

- **pino** + request-id middleware (`packages/logger/`)
- **Sentry** (`@sentry/nextjs`) — LLM 호출 실패/타임아웃/rate-limit 자동 캡처
- **OpenAI cost tracking** — `llm_call_log` 테이블 + 일별 집계
- **Key metrics** (dashboards):
  - 일별·op별·model별 비용
  - Cache hit rate (op별)
  - LLM fallback 발생률
  - Ingest 성공률 / DLQ 진입률
  - Embedding batch 실패율
  - Review queue 미처리 건수
  - p50/p95/p99 latency by op

### 11.2 Cost kill-switch (W2 D3)

```ts
// packages/ai/budget-guard.ts
export async function assertWithinBudget(workspaceId: string, op: string) {
  const dailySpend = await db.select({ sum: sql`sum(cost_usd)` })
    .from(llmCallLog)
    .where(and(
      eq(llmCallLog.workspaceId, workspaceId),
      gte(llmCallLog.createdAt, sql`now() - interval '1 day'`),
    ));
  const cap = Number(process.env.LLM_DAILY_BUDGET_USD ?? "50");
  if (Number(dailySpend[0].sum ?? 0) > cap) {
    logger.error({ workspaceId, op, spend: dailySpend[0].sum, cap }, "llm_budget_exceeded");
    throw new LlmBudgetExceededError(`Daily budget $${cap} exceeded for workspace ${workspaceId}`);
  }
}
```

### 11.3 Feature Flag 매트릭스 + 롤백 (W2 D4)

| Flag | Default | Phase-7B ON 시 | 롤백 동작 |
|------|---------|----------------|-----------|
| `FEATURE_LLM_CACHE` | `false` (W1 D2 이후 `true`) | `true` | `false`로 되돌리면 매 호출이 직접 OpenAI, 비용↑ but 안전 |
| `FEATURE_TWO_STEP_INGEST` | `false` | `true` (W3) | `false`면 기존 단순 ingest 경로 |
| `FEATURE_DOCUMENT_CHUNKS` | `false` | `true` (W3 말) | `false`면 기존 `knowledge_claim.embedding` 경로 |
| `FEATURE_HYBRID_SEARCH_MVP` | `false` | `true` (W4 D2) | `false`면 기존 검색 (bm25 only 또는 현행) |
| `FEATURE_WIKILINK_PARSE` | `false` | `true` (W5 D1) | 꺼도 기존 textarea 동작 유지 |
| `FEATURE_LINT_DRAFT` | `false` | `true` (W4 D4) | 끄면 lint job skip |
| `FEATURE_HEAL_DRAFT` | `false` | `true` (W5 D2) | 끄면 heal job skip |

**롤백 시나리오**:
- **L1 (Soft)**: feature flag off → 즉시 기존 경로 복귀
- **L2 (Medium)**: 스키마 down migration (`scripts/rollback/2026-04-phase-7b.sql`) — new 테이블만 DROP, 기존 데이터 무손실
- **L3 (Hard)**: git revert + 서버 재배포 (최악의 시나리오)

### 11.4 5000명 사용자 Communication (W5 D5)

- **사전 공지** (W5 D2): 관리자 → 사용자 메일, "Ask AI 응답이 조금 달라질 수 있습니다" 수준
- **Phase-7B 완료 공지** (W5 D5): 실제 변경점 + 사용법 변경 없음 강조
- **Staff FAQ** (W5 D5): 내부 운영팀용, 에러 리포팅 가이드

---

## 12. 위험 & 완화책 (v2 — v1보다 상세)

| 위험 | 가능성 | 영향 | 완화책 |
|------|--------|------|--------|
| Phase-7A가 2주 내 끝나지 못함 | 중 | 중 | Phase-7B 착수 보류. 게이트 엄격 적용. |
| `gpt-5.4-mini` 가 가격 급등 / deprecation | 낮 | 중 | env var 추상화 → 1시간 내 swap. fallback ladder 활성화. |
| OpenAI API 전체 장애 | 낮 | 높 | `LLM_FALLBACK_ENABLED=true` + stale cache 서빙. Sentry 경보. |
| Drizzle schema drift 훅 경고 누적 | 중 | 중 | 매 PR에 `pnpm db:generate` 강제. integrator 체크. |
| `llm_cache` 테이블 폭발 | 중 | 낮 | 주 1회 expired 정리 cron. 모니터링 경보. |
| IVFFlat 인덱스가 5000명 scale에서 느려짐 | 중 | 중 | 미리 HNSW 전환 옵션 벤치. `lists` 파라미터 조정 문서 |
| pgvector workspace cross-leak | 중 | **높** | Over-fetch × 3 + post-filter. W4 D3에 실측 + 보강 |
| Contradictions 오탐 | 중 | 낮 | 관리자 review_queue 필수, 자동 적용 금지 |
| 5000명 Ask AI spike | 낮 | 높 | Rate limit (10 req/min per user, 현재 20/hour 대비 대폭 완화 명시), BullMQ priority queue |
| i18n 변수 보간 버그 재발 | 중 | 낮 | integrator "ko.json ↔ UI 교차검증" 필수 |
| graphify subprocess 실패 | 중 | 중 | Ask AI graph lane 없음 (Phase-8 이전). fail-soft |
| TF-IDF precedent_case → OpenAI 재임베딩 시 $ spike | 중 | 중 | Phase-7에서 이관 금지. Phase-8에서 배치 야간 + 예산 승인 |
| `pg_bigm` 확장 설치 불가 | 중 | 중 | `pg_trgm` + bigram materialized column fallback |
| Eval fixture 큐레이션 지연 | 중 | 높 | W1부터 병행. 30→60→100 마일스톤 | 
| PII 누출 | 낮 | **매우 높** | redactPII() Step 0 + 자동 sensitivity 승급 + 법무 검토 (Phase-7A W1 병행) |
| Review queue 폭주 | 중 | 중 | 하루 N건 초과 시 알림. 관리자 배치 처리 UI |
| Heal draft 승급 지연 | 중 | 낮 | 승급 대기 N일 이상 페이지는 자동 archive → 재발견 로직 |
| Phase-6 drift detection 중단 | 낮 | 중 | Phase-7A W1 D5에 매핑 문서 확정 + drift 유지 보장 |
| Sentry 비용 폭주 | 낮 | 낮 | 환경별 sample rate (prod 10%, staging 100%) |
| 5000명 공지가 UX 혼란 유발 | 중 | 낮 | W5 D2 사전 공지 + W5 D5 확정. A/B 없음 |

---

## 13. 버릴 것 (v1 유지 + 추가)

| 버릴 것 | 이유 |
|---------|------|
| Tauri / Rust crate | Jarvis는 웹 서버 |
| LanceDB | 이미 pgvector 운영 |
| node-llama-cpp on-device | 5000명 서버 부적합 |
| 파일시스템 DB | PG ACID 포기 불가 |
| GBNF grammar | OpenAI 미지원, JSON Schema로 대체 |
| Fine-tuning 하네스 | OpenAI API 로 충분 |
| Obsidian vault export | 사내 포털 맥락 무관 |
| 9개 플랫폼 설치자 (graphify) | 무관 |
| launchd / systemd 데몬 | worker 있음 |
| 단일 사용자 가정 | RBAC + workspaceId + sensitivity 필수 |
| Claude Code 중심 런타임 | 프로덕션은 BullMQ worker |
| 파일시스템 상태 (llm_wiki `review.json`) | 전부 DB |
| CLI 중심 UX | 웹 포털 |
| **Anthropic SDK (packages/ai)** | dead dependency — 제거 ✅ BUT env/secret/graphify는 유지 |
| **`gpt-4.1*` 모델 이름** | 모두 `gpt-5.4-mini` / `gpt-5.4`로 | 
| **영구 캐시 (ttl=null)** | 정정 반영 불가 — 금지 |
| **polymorphic text[] 참조** | FK 포기 — junction table 로 |
| **자동 Heal 결과 바로 검색 후보** | 지식베이스 오염 — draft 격리 |
| **retrieval 시점 graphify subprocess 호출** | 300s 지연 위험 — materialize된 DB만 쿼리 |
| **Tiptap 대규모 도입 (Phase-7)** | 핵심 목표 무관 — Phase-8 |
| **검색 5-stage 동시 구현** | 품질 원인 분석 불가 — MVP만 |
| **"60~80% 절감" 근거 없는 수치** | 가정·측정기준 명시 |

---

## 14. 통과 기준 (수정)

### 14.1 Phase-7A (2주)
- [ ] `llm_call_log` 운영 + 일별 대시보드
- [ ] `gpt-5.4-mini` 스왑 완료
- [ ] `llm_cache` (버전 포함 key) + fallback ladder
- [ ] `document_chunks` 테이블 + customType vector + workspace FK + withTimezone (`FEATURE_DOCUMENT_CHUNKS=false`)
- [ ] `precedent_case` 분리 lane 문서화
- [ ] Eval fixture 30쌍 (curator/reviewer 분리)
- [ ] Phase-6 lint 매핑 문서
- [ ] pino + Sentry + request-id
- [ ] Cost kill-switch 동작
- [ ] CI/CD actions 완성 (type-check + lint + test + drift)
- [ ] 롤백 플랜 + feature flag 매트릭스

### 14.2 Phase-7B (3주)
- [ ] Ingest pipeline + ingest_run + ingest_dlq + Two-Step CoT
- [ ] Merge Resolution Matrix 5 케이스 단위 테스트
- [ ] `wiki_sources/concepts/syntheses/edges` + `*_draft` 테이블
- [ ] junction: `wiki_source_refs` + `wiki_citations`
- [ ] PII redactor Step 0 통합
- [ ] 10 샘플 ingest 성공
- [ ] `FEATURE_TWO_STEP_INGEST=true` 실전
- [ ] 검색 MVP (BM25 + vector + RRF) 운영
- [ ] Eval Recall@10 baseline 측정 + 회귀 없음 확인
- [ ] Review queue UI + contradictions/entity_conflict/alias_conflict 승급/폐기
- [ ] Lint draft + Heal draft 동작 + 관리자 승급 워크플로우
- [ ] `[[wikilink]]` 파싱 + backlinks 기본
- [ ] `pg_bigm` 또는 `pg_trgm` 결정 + zero-downtime re-index 실전
- [ ] i18n ko.json 신규 키 전부 추가 (60~80개)
- [ ] 5000명 공지 + staff FAQ 배포
- [ ] Phase-8 백로그 초안

### 14.3 Phase-8 (별도 plan — 이번 스코프 밖)
- Tiptap (또는 BlockNote) 리치 에디터 전면 도입
- 검색 파이프라인 Intent / HyDE / Rerank / Graph lane 추가 (eval 증명 후)
- 외부 데이터 커넥터 (Notion/Confluence/Google Drive/Web Clipper)
- precedent_case TF-IDF → OpenAI 재임베딩 (배치 야간 + 예산 승인)
- graphify graph lane을 Ask AI UI에 완전 편입
- god nodes / surprising connections / Louvain 재클러스터링
- Simple/Expert UI 차별화

---

## 15. 즉시 실행 체크리스트 (Phase-7A W1 D1 시작 전)

- [ ] 이 문서 + 비교 매트릭스 + 6개 분석 + 3개 review 아티팩트를 main에 merge
- [ ] `docs/plan/2026-04-W1-phase-7a.md` 신규 (이 문서 §3.1 복사)
- [ ] `AGENTS.md` 변경 이력 섹션에 Phase-7A 항목 추가 (v2 분할 명시)
- [ ] jarvis-planner에게 Week 1 D1~D5 작업 생성 요청 (각 D를 2~3 sub-task로 분해)
- [ ] `.env.example` 신규 키 추가: `ASK_AI_SYNTHESIS_MODEL`, `LLM_CACHE_TTL_*`, `LLM_FALLBACK_ENABLED`, `LLM_DAILY_BUDGET_USD`, `PROMPT_VERSION`, 모든 `FEATURE_*`
- [ ] `package.json` 정리: `@anthropic-ai/sdk` 제거는 **W1 D1 체크리스트 항목으로** (graphify subprocess env/secret 유지 검증 후 삭제)
- [ ] Phase-6 knowledge debt radar + drift detection 현재 동작 확인 (Phase-7 lint 매핑 전)
- [ ] `docs/eval/DATA_LICENSE.md` 신설 — TSVD999 데이터의 eval fixture 사용 승인 확인

---

## 16. 부록 — 용어집 (v2 업데이트)

- **gpt-5.4-mini / gpt-5.4**: 2026-04 기준 최신 세대 OpenAI 모델. 새 모델 나오면 env var 한 줄 교체로 전환.
- **Phase-7A / 7B**: v2에서 분할. A=안정화, B=ingest+검색 MVP. 에디터는 Phase-8.
- **4-surface**: Jarvis 위키 모델 (canonical/directory/case/derived). `derived`는 코드에서 이 이름, `synthesized`는 사용자 언어 — 둘이 같은 개념. 테이블은 `wiki_syntheses`로 통일.
- **4-layer**: llm-wiki-agent 모델 (sources/entities/concepts/syntheses). 4-surface와 거의 매핑 but `case` = sources + syntheses 복합.
- **3단 신뢰도**: EXTRACTED(regex/structure) / INFERRED(LLM) / AMBIGUOUS(수동 검토 필요)
- **RRF**: Reciprocal Rank Fusion. k=60 기본.
- **Position-Aware Blend**: RRF 결과 순위별 가중치 (Phase-8에서 도입)
- **Strong-Signal Bypass**: BM25 top-score ≥ threshold + gap ≥ threshold 시 expansion skip (Phase-8, 실측 후)
- **Two-Step CoT**: Analyze → Generate 2번 호출
- **Ingest**: 문서 → surface 엔티티 → 임베딩 → 엣지 → 저장 전체 파이프라인
- **Heal**: 주간 배치로 누락 엔티티 자동 생성 → **draft 격리** → 관리자 승급
- **Lint**: orphan / broken / stale / gap 탐지 → **draft 격리**
- **Eval**: fixture 기반 Recall@k, MRR, Precision 측정
- **Draft namespace**: `wiki_*_draft` 테이블. 자동 생성물을 관리자 승급 전까지 격리
- **Junction table**: polymorphic text[] 대신 FK 가능한 관계 테이블 (`wiki_source_refs`, `wiki_citations`)
- **Feature flag**: `FEATURE_*` env var로 on/off. 롤백용
- **Cost kill-switch**: `LLM_DAILY_BUDGET_USD` 초과 시 자동 차단
- **`ASK_AI_MODEL`**: 기존 env var (이미 `gpt-5.4-mini` 기본값 — main 코드 확인 완료)
- **`ASK_AI_SYNTHESIS_MODEL`**: v2 신규 env var (`gpt-5.4`)

---

**이 문서 + `99-comparison-matrix.md` + `99-review-summary.md`가 Phase-7A/7B 모든 의사결정의 근거.**
**v1에서 지적된 10 P0 + 7 P1 + 8 critical gap + 10 Codex findings 모두 반영됨.**
**실행은 jarvis-planner가 Phase-7A W1 D1부터 작업을 쪼개서 jarvis-builder에게 dispatch, jarvis-integrator가 교차 검증 + PII/workspace guard 검사.**
