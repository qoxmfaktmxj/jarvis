---
title: Phase-7 v3 Design — Infrastructure Gate for Safe LLM Expansion
date: 2026-04-14
status: design (awaiting user review)
supersedes: docs/analysis/99-integration-plan.md (as execution spec)
source_of_truth_order: main code > 99-review-summary > 99-integration-plan > matrix/references
---

# Phase-7 v3 Design

## 0. 목적과 배경

Phase-7 v3는 Jarvis를 **LLM 의존 기능을 안전하게 확장 가능한 상태**로 만들기 위한 **인프라 게이트 작업**이다. 실제 retrieval/ingest 품질 개선은 7B·Phase-8에서 다루며, 7A는 "그걸 안전하게 얹을 수 있는 그릇"만 만든다.

v2 (`docs/analysis/99-integration-plan.md` + 검토 3종)가 **rationale pack**이라면, 이 문서는 **실행 spec**이다. v2의 전략 방향은 유지하되, 다음 5개 리스크를 게이트 조건으로 내재화한다:

1. source-of-truth 분열 (`document_chunks` vs `knowledge_claim` dual-read/cutover 불명)
2. tenant boundary = 측정 문제 (cross-workspace leakage 테스트 필수)
3. PII는 선결조건 (redactor + 자동 sensitivity 승급 + review_queue, ingest Step 0)
4. Phase-6 ↔ Phase-7 매핑 문서 부재
5. v2 spec-level Drizzle 스타일 불일치 (vector customType, sensitivity varchar, pgEnum 위치)

---

## 1. Scope & Non-goals

### 1.1 In scope — 7A (GO, 2주 타겟)

- 관측: `llm_call_log` 테이블 + 구조화 로깅 (pino + request-id + Sentry)
- 비용: 일일 예산 + kill-switch (`LLM_DAILY_BUDGET_USD`) + 비용 대시보드
- 캐시: `promptVersion + workspaceId + sensitivityScope` 포함 캐시 키
- PII: redactor + 자동 sensitivity 승급 + `review_queue` (ingest Step 0)
- Tenant: cross-workspace leakage integration 테스트 계층
- Eval: markdown 기반 fixture 30쌍 (`apps/worker/eval/fixtures/2026-04/*.md`)
- Schema: `document_chunks` DDL **생성만** (write path flag off)
- 문서 2종: Phase-6↔7 매핑, precedent_case separate-lane 경고
- CI/CD: schema-drift hook 재발 차단 + 위 전부 자동 검증
- **PR#0 (선행)**: v2 spec의 Drizzle 스타일 불일치 정정 단독 PR

### 1.2 In scope — 7B (조건부 GO, 7A 게이트 통과 후에만)

- `FEATURE_TWO_STEP_INGEST=true` (llm_wiki 2-step ingest)
- `FEATURE_HYBRID_SEARCH_MVP=true` (4-signal relevance + RRF)
- `wiki_*` 실전 write path

### 1.3 Non-goals — Phase-8 (보류)

- editor 교체
- query-time graph lane
- precedent_case 재임베딩 (vector space 통일)

**Phase-8 해제 조건**: "7A 모든 게이트 통과 + 7B 완료"만으로 충분 (§6 참조).

### 1.4 명시적으로 안 하는 것 (v3 전반)

- 새 LLM 공급자 추가 (OpenAI `gpt-5.4-mini` 고정, Anthropic 불사용)
- graphify에 LLM 얹기 (결정론적 AST+그래프 파이프라인 유지)
- `knowledge_claim` → `document_chunks` 즉시 cutover (7A는 DDL만, dual-read/cutover는 7B 이후 별도 판단)
- 7A/7B 기간 중 Phase-8 항목 사전 작업 (PoC 포함 금지)
- 숫자 품질 바(recall@k 등)로 Phase-8 해제 블로킹

---

## 2. PR 시퀀스 & 게이트 구조 (접근 B — 숫자 게이트)

### 2.1 PR 순서

```
PR#0  spec 정정 (Drizzle customType vector / sensitivity varchar / pgEnum 위치)
       ↓ (선행 필수)

Week 1
 PR#1  observability: llm_call_log 테이블 + pino + request-id + Sentry
 PR#2  cost kill-switch: LLM_DAILY_BUDGET_USD + 비용 대시보드 + 자동 차단
 PR#3  PII redactor + review_queue + 자동 sensitivity 승급 (ingest Step 0)
 PR#4  schema-drift hook 강화 (의도적 실패 케이스로 블로킹 실증)

Week 2
 PR#5  cache key 확장 (promptVersion + workspaceId + sensitivityScope)
 PR#6  eval fixture 30쌍 (markdown, git-tracked) + 실행 harness
 PR#7  document_chunks DDL (write path flag off)
 PR#8  문서 2종: Phase-6↔7 매핑, precedent_case separate-lane 경고
 PR#9  CI/CD: 위 전부 자동 검증 + cross-workspace leakage integration

PR#G  게이트 판정 PR (코드 없음, G1–G7 체크 결과 기록 + 7B 해제 문서화)
```

### 2.2 롤백 정책

- PR#1–9 각각 독립 롤백 가능 (feature flag 또는 테이블 단위)
- PR#7 DDL은 write path flag off이므로 DDL만 남겨도 무해
- PR#G 통과 후 7B에서 문제 발견 시 7A는 그대로, 7B 플래그만 내림

---

## 3. PR별 상세

### PR#0 — spec 정정 (선행)
- **산출물**: v2 plan의 Drizzle 예시 코드 정정 (실 런타임 코드 아님)
- **변경**: `docs/analysis/99-integration-plan.md` schema 예시 블록
  - `vector("embedding", { dimensions: 1536 })` → `customType<vector>` 패턴 (`packages/db/schema/case.ts:24` 참조)
  - `sensitivityEnum` → `varchar("sensitivity", { length: 30 })`
  - `pgEnum` 선언을 파일 top-level로
- **완료 조건**: schema-drift hook이 예시 코드에 대해 false-positive 없음

### PR#1 — observability
- **산출물**: `llm_call_log` 테이블 + logger 래퍼
- **변경**:
  - `packages/db/schema/llm-call-log.ts` (신규, 기존 schema는 flat 디렉터리)
  - `packages/ai/logger.ts` (pino + request-id 컨텍스트, ai 패키지도 flat)
  - `apps/web/middleware.ts` (request-id 주입, 기존 파일 수정)
  - Sentry 연동: `packages/shared/sentry.ts` (신규) + 각 진입점 초기화
- **완료 조건**: 모든 OpenAI 호출이 `llm_call_log`에 1행씩 기록 (model, tokens_in/out, cost_usd, latency_ms, request_id, workspace_id)

### PR#2 — cost kill-switch
- **산출물**: 일일 예산 초과 시 자동 차단
- **변경**:
  - `packages/ai/budget.ts` (신규): `LLM_DAILY_BUDGET_USD` 체크
  - `packages/ai/ask.ts`, `packages/ai/embed.ts` 진입점에 `assertBudget()` 게이트
  - 비용 대시보드: `apps/web/app/(admin)/admin/llm-cost/page.tsx` (또는 동등 경로)
  - `scripts/eval-budget-test.ts` + `package.json`에 `"eval:budget-test"` 스크립트 (G1 harness)
- **완료 조건**: 예산 초과 시뮬레이션에서 차단 동작, `llm_call_log`에 `blocked_by=budget` 기록

### PR#3 — PII redactor + review_queue
- **산출물**: ingest Step 0에 redactor, 민감도 자동 승급, 수동 리뷰 큐
- **변경**:
  - `apps/worker/src/lib/pii-redactor.ts` (신규, `@jarvis/ingest` 패키지 없음 — worker의 lib로): 주민번호/전화/이메일/카드 패턴
  - `apps/worker/src/lib/pii-redactor.test.ts` (신규, 콜로케이트)
  - `packages/db/schema/review-queue.ts` (신규)
  - `apps/worker/src/jobs/ingest.ts` 최상단에 Step 0 삽입
  - 규칙: PII 탐지 시 `sensitivity` 최소 `INTERNAL`, SECRET 키워드 매치 시 `review_queue` enqueue
- **완료 조건**: unit 100% pass + integration (`apps/worker/src/__tests__/integration/pii-flow.test.ts`) 1건 — PII 문서 → redact → sensitivity 승급 → review_queue 1행

### PR#4 — schema-drift hook 강화
- **산출물**: 의도적 drift 시 실제 블로킹
- **변경**: `scripts/check-schema-drift.mjs` 실패 케이스 테스트 추가
- **완료 조건**: 의도적 drift PR에서 CI 빨간불 실증

### PR#5 — cache key 확장
- **산출물**: LLM 응답 캐시 키에 `promptVersion + workspaceId + sensitivityScope` 포함
- **변경**:
  - `packages/ai/cache.ts` (신규 또는 기존 캐시 위치): `makeCacheKey({ promptVersion, workspaceId, sensitivityScope, input })`
  - `packages/ai/ask.ts`에서 신규 키 적용
- **완료 조건**: workspace A의 캐시가 workspace B에 leak되지 않음 (unit test)

### PR#6 — eval fixture
- **산출물**: 30쌍 markdown fixture + harness
- **변경**:
  - `apps/worker/eval/fixtures/2026-04/*.md` (30개, git-tracked)
  - `apps/worker/eval/run.ts` (harness)
  - fixture 포맷: frontmatter(query, expected_keywords) + 본문(context)
- **완료 조건**: `pnpm eval:run` → 30쌍 error 0건 + cache hit rate 출력

### PR#7 — document_chunks DDL
- **산출물**: 테이블 생성만, write path 없음
- **변경**:
  - `packages/db/schema/document-chunks.ts` (신규, `knowledge.ts:23`의 customType vector 1536d 패턴 재사용)
  - migration 파일
  - `FEATURE_DOCUMENT_CHUNKS_WRITE=false` 기본값
- **완료 조건**: migration 적용 + 테이블 존재 확인, write 시도 시 flag 가드로 no-op

### PR#8 — 문서 2종
- **산출물**:
  - `docs/analysis/06-phase6-phase7-mapping.md` — Phase-6 탐지 ↔ Phase-7 해소 매핑표
  - `packages/search/README.md` — precedent_case separate-lane 경고
- **완료 조건**: 두 파일 머지

### PR#9 — CI/CD + leakage 테스트
- **산출물**:
  - `apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts` (신규)
  - CI 워크플로우(`.github/workflows/`)에서 `pnpm test:integration` 포함
  - `pnpm eval:run` 야간 실행 (권장)
- **완료 조건**: workspace A/B seed → A의 쿼리로 B의 chunk가 top-50에 0건

### PR#G — 게이트 판정
- **산출물**: 코드 변경 없음. §4의 G1–G7 체크 결과 기록 + 7B 해제 문서
- **변경**: `docs/analysis/07-gate-result-2026-04.md` (신규)
- **완료 조건**: 7개 전부 green → 7B 시작 승인

---

## 4. 7A → 7B 숫자 게이트 (G1–G7)

| # | 게이트 | 측정 방법 | 입력 | 합격선 | 기록 |
|---|--------|-----------|------|--------|------|
| G1 | cost kill-switch | `pnpm eval:budget-test` — `LLM_DAILY_BUDGET_USD=0.01` | 인위적 예산 초과 | `blocked_by=budget` row ≥1, 후속 차단 유지 | `llm_call_log` + PR#G |
| G2 | PII redactor | vitest unit (`apps/worker/src/lib/pii-redactor.test.ts`) | 주민번호·전화·이메일·카드 각 5건 | 100% pass | CI artifact |
| G3 | review_queue | vitest integration (`apps/worker/src/__tests__/integration/pii-flow.test.ts`) | SECRET 키워드 문서 1건 | `review_queue` 1행 + sensitivity 승급 | CI artifact |
| G4 | cross-workspace leakage | vitest integration (`apps/worker/src/__tests__/integration/cross-workspace-leakage.test.ts`) | workspace A/B seed, 쿼리 3종 | B chunk 0건 in top-50 | CI artifact |
| G5 | schema-drift hook | 의도적 drift PR 시뮬레이션 | 스키마만 변경, migration 누락 | hook이 PostToolUse에서 빨간불, 커밋 블록 | PR#G 스크린샷 |
| G6 | eval fixture | `pnpm eval:run` | 30쌍 fixture | error 0건 + cache_hit_rate / avg_latency_ms / avg_cost_usd baseline 기록 | `07-gate-result-2026-04.md` |
| G7 | llm_call_log 완전성 | dev 환경 1일 수동 스모크 | 실사용 쿼리 10회+ | log row = 실호출 수 (누락 0) | SQL 확인 결과 |

### 4.1 운영 규칙

- **G1–G7 전부 green** → PR#G 머지 → 7B 플래그 해제 승인
- **1개라도 red** → 해당 항목 hotfix PR → PR#G 재판정. 7B 진입 금지
- **G6 baseline 숫자**는 합격/불합격에 안 씀 — Phase-8 시점 비교 baseline으로만 보관
- **숫자 품질 바(recall@k 등)는 7A 게이트에 넣지 않음** (결정: Phase-8 해제는 (a) 최소안)

---

## 5. 보조 문서 구조 (PR#8)

### 5.1 `docs/analysis/06-phase6-phase7-mapping.md`

목적: Phase-6(Debt Radar + Drift Detection) 탐지 항목이 Phase-7 어디서 해소되는지 추적 가능하게 묶기.

구조 (1–2페이지):
1. 배경 (Phase-6/7 스코프, 매핑 필요성)
2. 매핑표

   | Phase-6 탐지 | 심각도 | Phase-7 해소 | 게이트 |
   |---|---|---|---|
   | schema drift | P0 | PR#4 | G5 |
   | PII leak 가능성 | P0 | PR#3 | G2/G3 |
   | cross-workspace data bleed | P0 | PR#9 | G4 |
   | LLM cost 폭주 | P1 | PR#2 | G1 |
   | 관측 불가 | P1 | PR#1 | G7 |
   | cache poisoning (workspace 혼입) | P1 | PR#5 | — |
   | eval 없는 LLM 회귀 | P2 | PR#6 | G6 |
   | knowledge_claim/document_chunks 분열 | P2 | 7A DDL만, 7B 이후 | — |

3. 7B·Phase-8로 넘기는 항목 + 이유
4. Revision log

### 5.2 `packages/search/README.md`

목적: precedent_case를 실수로 document_chunks와 같은 쿼리 경로에 엮는 것 방지.

구조 (짧게, 1페이지 이내):
- Lane A (`document_chunks`) — OpenAI 임베딩, 위키/지식, hybrid 쿼리
- Lane B (`precedent_case`) — TF-IDF+SVD 임베딩, CS 티켓, precedent 전용 API
- ⚠️ 절대 금지: 두 레인 UNION, 같은 인덱스 투입, 1536차원 같다고 호환 아님
- 통합 판단은 별도 분석 문서 (M1)에서 — 링크만

---

## 6. Phase-8 해제 조건

### 6.1 해제 조건 (둘 다 충족)

**조건 1**: PR#G 머지 (G1–G7 전부 green)
- 증거: `docs/analysis/07-gate-result-2026-04.md` 7개 체크박스 ✅

**조건 2**: 7B 완료
- `FEATURE_TWO_STEP_INGEST`, `FEATURE_HYBRID_SEARCH_MVP` 활성, `wiki_*` write path 작동
- 7B 각 기능이 eval fixture 30쌍 error 0건 유지
- 7B 종료 PR(PR#B-G) 머지

### 6.2 해제 ≠ 자동 착수

| Phase-8 항목 | 착수 전 필요한 것 |
|---|---|
| editor 교체 | `docs/analysis/09-editor-decision.md` |
| query-time graph lane | `docs/analysis/10-graph-lane-decision.md` |
| precedent 재임베딩 | M1 분석 문서 (`08-precedent-reembedding-decision.md`) |

해제는 "착수 가능 상태"일 뿐. 각 항목은 별도 decision doc + 사용자 승인 필요. 안 할 수도 있음.

### 6.3 재봉인

7B 이후 중대 회귀 (P0 Sentry 다발, eval baseline 하락) 시 Phase-8 전면 보류, hotfix 우선.

---

## 7. Future work / Separate track 메모

### M1. Precedent 재임베딩 판단 (Phase-8 또는 이후)
- 전제: 7A eval 인프라 완성 + precedent 검색 baseline 측정
- 산출물: `docs/analysis/08-precedent-reembedding-decision.md` — 교체 vs hybrid(TF-IDF + OpenAI RRF) vs 현상 유지 판단
- 리스크 목록 (결정 시 고려):
  - 자연어 vs 전문용어 강점 차이 (OpenAI는 paraphrase, TF-IDF는 rare term exact match)
  - 구조 필드 뭉개짐 (symptom/cause/action concat 시 축 소실)
  - 기존 `clusterId`/`digestPageId` 파급 (재클러스터링 필요 여부)
  - 평가 데이터 없이 갈아끼우면 회귀 감지 불가
  - "교체"가 아니라 "hybrid 2채널 진화"가 정답일 수도
- 비용·시간은 장애물 아님 (병렬 임베딩 + 배치 API로 $1 수준 / 수 시간)

### M2. TSVD999 지식 구조화 트랙 (병행 가능한 별도 트랙)
- 제안 구조: `higherCategory × requestCompany` 축으로 `knowledge_page` 승격 (예: `급여 → CPN → A사 이력`)
- 결정 사항:
  - **권한**: 전원 공유 (회사별 격리 아님). 회사명 위키 노출 OK, sensitivity 기본 `INTERNAL`
- 선결 작업:
  - **데이터 희소성 측정** (7A 중 가능한 시점에 실행):
    ```sql
    SELECT higher_category, request_company, COUNT(*)
    FROM precedent_case
    GROUP BY 1, 2
    ORDER BY 3 DESC;
    ```
  - 상위/하위 셀 분포로 트리 깊이 결정. 셀당 평균 N건 이하면 트리 펼치지 말고 flat 리스트로
- 용도 분리 (3축 병행):
  - 트리 (행정 분류, 브라우징 UX)
  - 클러스터 (증상 유사도, 이미 존재 — `clusterId`/`case_cluster`)
  - 검색 (쿼리 → 유사 사례)
- 스코프: Phase-7 v3 본체 아님. 별도 트랙 (Phase-7/8 병행 가능)

---

## 8. Execution Strategy (병렬화)

### 8.1 브레인스토밍 + 스펙 작성 — 병렬 불가
사용자와 단일 대화 흐름. 순차.

### 8.2 writing-plans — 부분 병렬 가능
- PR#0 (spec 정정), PR#1 (observability)이 선행 전제
- 나머지 PR#2–#9의 task breakdown은 3–4개씩 묶어 에이전트 병렬 호출로 plan 생성 가능

### 8.3 실제 구현 (7A) — 최대 병렬 이득 (worktree 3–4개)

| Lane | 순차 PR |
|---|---|
| Lane A | PR#1 observability → PR#2 kill-switch |
| Lane B | PR#3 PII redactor → PR#6 eval fixture |
| Lane C | PR#4 schema-drift → PR#7 DDL → PR#8 문서 |
| Lane D | PR#5 cache key, PR#9 CI/CD (독립) |

4개 worktree 동시 실행으로 2주 타겟 현실화.

### 8.4 스펙/plan 리뷰 — 병렬 가능
`superpowers:code-reviewer` 에이전트로 스펙 placeholder/consistency 점검을 백그라운드로 병행.

---

## 9. Revision log

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-04-14 | 초안 작성 | v2 3-way 리뷰 완료 후 실행 spec 분리 |
