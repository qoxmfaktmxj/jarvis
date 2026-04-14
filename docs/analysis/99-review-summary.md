# 통합 계획 리뷰 요약 (3-Way Review)

> **목적**: `99-integration-plan.md` v1의 허점을 3가지 독립 검증으로 찾고, **v2 재작성의 근거를 한 곳에 모은다.**
> **검증 방식**: 3개 병렬 에이전트 + 1개 외부 모델(Codex gpt-5).
> **날짜**: 2026-04-14

---

## 0. 검증 개요

| 검증 | 방식 | 시야 | 결과 파일 | 발견 |
|------|------|------|-----------|------|
| **A. Fact-check** | Claude 서브에이전트 + Bash (`ls`, `grep`) | 통합 계획의 모든 경로·타입·마이그레이션 번호를 **실제 Jarvis 코드**와 대조 | `99-fact-check.md` | **10 P0 + 7 P1 + 18 correct + 2 uncertain** |
| **B. Gap-hunt** | Claude 서브에이전트 (적대적 리뷰) | 논리적 허점·모순·누락·과신·스케줄 리스크 | `99-gap-hunt.md` | **8 critical + 9 medium + 6 contradictions + 8 scope + 22 checklist + 7 OC + 3 supervision** |
| **C. Codex review** | Codex CLI (gpt-5.4, high reasoning, brutal) | 전략적 방향 + 설계 결함 + 스코프 타당성 | `99-codex-review-raw.txt` | **5 P0 + 4 P1 + 1 P2** |

**3개가 공통으로 외친 것** = 거의 확실한 문제. **1개만 지적한 것** = 저자 맹점일 수도, false positive일 수도.

---

## 1. 3-Way Consensus (3개 중 3개가 지적)

### C1. Phase-7 스코프가 너무 크다 — 7A/7B 분할 필수
- **Codex P0 #1**: "안정화 모드와 범위가 정면 충돌. 4주 불가능, 10-16주."
- **Gap-hunt CTX-03 + Meta**: "Phase-6 안정화 미완 + Phase-7 대규모 리팩토링 = 기술부채 가속. 7A(2주 안정화) + 7B(3주 리팩토링) 분할 권고."
- **Fact-check** 직접 지적은 아니지만 "경로 오류 8개 × 2 종류 + 스키마 타입 오류 4개" 규모 자체가 4주 타이트함을 시사.
- **조치**: **v2에서 Phase-7A(기초 + 관측) 2주 + Phase-7B(ingest + 검색) 3주 + Phase-8(에디터 + graphify) 이후**로 분할.

### C2. RBAC / sensitivity / workspaceId가 전체 파이프라인에 깊게 박혀있지 않음
- **Codex P0 #2**: "캐시 키에 `workspaceId`, 권한 컨텍스트, sensitivity scope 없음. 테넌트·권한 경계 밖 재사용 위험."
- **Gap-hunt GAP-11 + GAP-12**: "IVFFlat global index + workspaceId 필터는 post-filter라 cross-workspace leak 가능. workspaceId 주입 경로 런타임 감사 없음."
- **Fact-check P1 #1**: "새 테이블들이 `workspaceId`에 FK 없음. 프로젝트 패턴은 `.references(() => workspace.id, { onDelete: 'cascade' })` 필수."
- **조치**: 
  - Cache key = `SHA256(JSON.stringify({op, model, prompt, extra, promptVersion, workspaceId, sensitivityScope}))`
  - 모든 새 테이블에 workspace FK + sensitivity varchar(30) UPPERCASE
  - `packages/shared` 에 `withWorkspaceGuard()` 헬퍼 + Runtime lint

### C3. 참조 무결성 / FK 누락 / polymorphic text[]
- **Codex P0 #4**: "`sourceRefs: text[]`, `citations: text[]`, polymorphic `documentId/documentType`는 FK 없음. slug 변경·삭제·권한 변경 시 썩음."
- **Gap-hunt GAP-04**: "wiki_edges vs graph_edge 이중 운영의 merge/priority 정책 부재."
- **Fact-check**: (정합성만 확인, 직접 지적 없음)
- **조치**: junction table (`wiki_source_refs`, `wiki_citations`) + typed relation 도입. polymorphic은 최소화, 불가피하면 CHECK constraint로 보정.

### C4. Cache / Heal / Ingest의 contextual invalidation 전무
- **Codex P0 #3 + #5**: "자동 Heal은 지식베이스 오염 경로. content hash 캐시가 권한/시간/맥락 변화 무시. `ttl=null`은 정정 반영 못함."
- **Gap-hunt GAP-03 + GAP-05**: "Cache key에 promptVersion 누락 → stale 출력 서빙. Ingest 6-step 트랜잭션/DLQ/재시도 설계 전무."
- **Fact-check**: (설계 관점에서 직접 다루지 않음)
- **조치**: 
  - `promptVersion` 키 포함 + `llm_cache.invalidated_at` soft-delete + 관리자 invalidation CLI
  - Heal 결과물은 **draft namespace (`wiki_*_draft` 테이블)** 에 격리, 검색·답변 후보에서 제외
  - Ingest `ingest_run` 테이블 + BullMQ retry + DLQ 테이블

---

## 2. 2-Way Overlap (2개가 지적)

### O1. 검색 파이프라인 과설계 / MVP 우선
- **Codex P1 #6**: "Intent+expansion+HyDE+BM25+CJK+vector+graph+RRF+blend+rerank 한 번에 = 품질 원인 분석 불가. MVP는 `BM25+chunk vector+RRF+eval` 만."
- **Gap-hunt SCOPE-03 + OC-07**: "RRF 단위 테스트만 가능, 통합은 W3. Strong-signal bypass 임계값 0.85/0.15 근거 없는 매직넘버."
- **조치**: v2 W1은 `BM25 + vector + RRF + eval fixture 30쌍`까지만. Intent/expand/HyDE/rerank는 eval에서 실효 증명 후 단계적 추가.

### O2. 한국어 FTS 현실 과소평가
- **Codex P1 #7**: "PG FTS korean은 간단하지 않음. nori는 ES 쪽. trigram/bigram materialized + pgvector가 현실적."
- **Gap-hunt GAP-13**: "CJK 토크나이저 업그레이드 시 기존 `search_vector` GIN 인덱스 전부 stale. zero-downtime re-index 절차 필요."
- **조치**: PG 확장(`pg_bigm` / `pg_trgm` 조합) + `CREATE INDEX CONCURRENTLY`. nori 가정 폐기.

### O3. Tiptap은 Phase-7 핵심과 무관
- **Codex P1 #8**: "검색/RAG 품질 개선과 에디터 교체는 별개. Tiptap+MD roundtrip+wikilink+paste+slash-menu는 자체 프로젝트."
- **Gap-hunt SCOPE-01 + GAP-09 + CON-04**: "W3 D4 1일에 전부는 비현실. 기존 95 canonical 페이지 round-trip 테스트 없음. MD↔JSON 왕복 손실."
- **조치**: **Phase-7에서 완전 제외**. 기존 textarea 에디터에 `[[wikilink]]` **파싱만** 추가(Phase-7B W3 하위작업). 리치 에디터는 Phase-8.

### O4. graphify 이중 운영 리스크 숨김
- **Codex P1 #9**: "Python subprocess + TS wrapper 7종 = 장애/배포/timeout/sandbox/CVE/resource limit/observability 전부 추가."
- **Gap-hunt CON-02**: "Stage 3에서 graphify BFS를 retrieval 시점에 호출하면 300s 타임아웃 위험. 실제 의도는 materialize된 graph_node/edge 쿼리."
- **Fact-check P0 #9**: "graphify는 Python subprocess가 아니라 **native binary + Anthropic API 키 사용**. Plan의 'Python subprocess' 표현 오류."
- **조치**: 
  - Ingest 경로(build-time)만 graphify subprocess 호출
  - Retrieval(query-time)은 이미 materialize된 `graph_node`/`graph_edge` 테이블 SQL BFS
  - "binary via execFile with Anthropic" 으로 표현 정정
  - Stage 3 graph lane은 Phase-7B 초기 제외, eval에서 recall 기여 증명 후 포함

### O5. 비용·관측이 W4에 몰려있음 (순서 오류)
- **Codex P2 #10**: "비용 대시보드 W4는 순서 틀림. W1 첫 작업이 `llm_call_log`, budget guardrail, per-workspace quota, per-user rate limit, timeout/retry, cache hit metric."
- **Gap-hunt GAP-06 + OC-01~04**: "Model fallback ladder 없음. $0.01/sample, 60~80% 절감 수치 근거 없음. 비용 측정 W4D2가 첫 지표."
- **조치**: Phase-7A W1 D1에 `llm_call_log` 테이블 + 구조화 로깅 + request_id + OpenAI cost tracking 필수. 대시보드 UI는 W2로.

### O6. Eval fixture 100쌍 큐레이션 시간 0일
- **Codex** 스코프 타당성에 녹아있지만 명시적 지적은 아님
- **Gap-hunt GAP-07**: "누가 100쌍을 작성? 정답/검수자 분리 없음. 개인정보 정책 부재. W4 D2 한 줄에 들어갈 수 없는 작업."
- **Fact-check** (운영 관점 밖)
- **조치**: Phase-7A W1부터 **백그라운드 큐레이션 트랙** 병행. 출처 분배(guidebook 30 / TSVD999 30 / directory 20 / search_log 20) + `curator_user_id` + `reviewed_by_user_id` 필드.

### O7. PII redaction / 보안 검증
- **Codex** (RBAC 맥락에서 일부)
- **Gap-hunt GAP-08 + GAP-16**: "zod는 타입만 보장, 길이/이상치 검증 안 함. canonicalId 경로 traversal. HR 튜터/TSVD999는 PII heavy인데 그대로 OpenAI로 전달."
- **조치**: 
  - zod `.max(length)` + `canonicalId` regex 강제
  - Ingest Step 0 앞에 `redactPII()` pre-pass (간단한 regex → presidio 단계적)
  - 자동 sensitivity 승급: PII 감지 시 `INTERNAL → RESTRICTED`

---

## 3. 1-Way Signal (하나만 지적, but 중요)

### S1. Fact-check 전용: 경로·스키마 오류 (대량)
**모든 v1 code snippet을 재작성해야 함.**

| 오류 | 잘못된 패턴 (v1) | 올바른 패턴 (Jarvis 실제) |
|------|------------------|---------------------------|
| DB schema 경로 | `packages/db/src/schema/` | `packages/db/schema/` (no `src/`) |
| Web 앱 경로 | `apps/web/src/components/`, `apps/web/src/app/` | `apps/web/components/`, `apps/web/app/` (no `src/`) |
| Worker 경로 | `apps/worker/src/jobs/` | `apps/worker/src/jobs/` ✓ (worker는 `src/` 있음) |
| Sensitivity 컬럼 | `sensitivityEnum('sensitivity').default('internal')` | `varchar("sensitivity", { length: 30 }).notNull().default("INTERNAL")` |
| Sensitivity 값 | `'internal'`, `'public'` (lowercase) | `"PUBLIC"`, `"INTERNAL"`, `"RESTRICTED"`, `"SECRET_REF_ONLY"` (UPPERCASE) |
| Vector 컬럼 | `vector('embedding', { dimensions: 1536 })` | `customType<...>` 패턴 (see `knowledge.ts:21-25`) |
| Timestamp | `timestamp('created_at').defaultNow().notNull()` | `timestamp("created_at", { withTimezone: true }).defaultNow().notNull()` |
| pgEnum 선언 | 컬럼 def 내 inline | 파일 top에 `export const enum = pgEnum(...)` 후 사용 |
| 다음 migration | `0010_llm_cache.sql` | `0009_llm_cache.sql` (`_journal.json` idx 0-8) |
| 패키지 레이아웃 | `packages/prompts/src/`, `packages/core/src/` | flat layout — `packages/prompts/ingest/`, `packages/core/llm/` |
| 기존 `packages/search` | 신규 구조 `src/pipeline/` | 이미 flat (`adapter.ts`, `pg-search.ts`). ADD-only sub-dir. |
| Workspace FK | 누락 | `workspaceId: uuid("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" })` |
| Env var 충돌 | `OPENAI_MODEL_UTILITY` (신규) | `ASK_AI_MODEL=gpt-4.1-mini` (기존) 재사용 + `ASK_AI_SYNTHESIS_MODEL` 신규 |
| graphify 표현 | "Python subprocess" | "binary subprocess (`execFile`) using Claude Haiku via `ANTHROPIC_API_KEY`" |
| Anthropic SDK 제거 범위 | 전체 제거 | `packages/ai/package.json` dep만. env var + secret + graphify 유지. |
| CI 커맨드 | `pnpm --filter @jarvis/web ...` | `pnpm -r run ...` 또는 `turbo type-check lint test` (monorepo-wide) |

**조치**: v2 전면 재작성 시 이 표를 체크리스트로 사용.

### S2. Gap-hunt 전용: 부수 설계 결함
- **GAP-01**: `knowledge_claim` + `precedent_case` → `document_chunks` 마이그 경로 부재. **TF-IDF vs OpenAI 벡터 공간 불일치** — 합칠 수 없음. precedent_case는 별도 lane 유지.
- **GAP-09**: 기존 95 canonical 페이지 Tiptap round-trip 테스트 없음.
- **GAP-14**: Phase-6 drift detection + knowledge debt radar와 Phase-7 lint/heal 중복. 매핑 결정 필요.
- **SCOPE-04**: 10 샘플 ingest 테스트용 샘플 문서 준비 일정 없음.
- **SCOPE-05**: Phase-7 신규 UI의 ko.json 키 누락 — 총 60~80개 추정.
- **SCOPE-06**: 5000명 사용자 변경 공지 플랜 없음.
- **SCOPE-07**: Phase-7 롤백 플랜 없음. feature flag 없음.
- **SCOPE-08**: BullMQ concurrency 튜닝 불명.
- **CTX-01**: HR 튜터가 §2.2 모델 라우팅에 없음.
- **CTX-02**: Simple/Expert 모드가 신규 UI에 적용되는지 불명.

### S3. Codex 전용: 전략적 판단
- **P0 #1 (재강조)**: "플랫폼 재작성 수준"이라는 표현이 핵심. "위키 + 검색 + 에디터 + 관측 + 스키마 + 그래프 + CI" 동시 전환은 엔지니어 1인·1주 스프린트 문화와 상극.
- **결정**: 7A(안정화 완료) + 7B(검색 품질 고도화) 2단계로 쪼개는 것이 안전. 에디터는 Phase-8.

---

## 4. Codex와 Claude 의견이 갈리는 지점

- **Model routing 복잡도**:
  - Codex: "mini + 4.1 라우팅도 과설계. MVP는 단일 모델 + eval로 승격 시점 결정."
  - Claude: "라우팅 자체는 비용 구조 이해하면 필수. 그러나 fallback ladder 미비."
  - **사용자 판단 필요**: v2에서는 **라우팅 유지 + fallback ladder 추가**로 타협.
- **LLM 캐시 도입 시기**:
  - Codex: "W1 첫 작업에 넣어야 비용 폭주 막음."
  - Gap-hunt: "promptVersion 키 포함 + invalidation 설계가 필수."
  - **합의**: W1 D1에 `llm_call_log` + `llm_cache`(promptVersion 포함) 동시 도입.

---

## 5. v1 → v2 변경 요약

### 유지할 것 (여전히 좋은 결정)
- 5개 레퍼런스 중 어느 것도 통째로 가져오지 않는다
- SHA256 캐시, RRF, 3단 신뢰도 엣지, JSON Schema 구조화 출력, Smart chunking (P0 후보)
- 4-surface (정본/디렉터리/사례/파생) 유지·확장 원칙
- graphify 이중 운영
- Anti-patterns 목록 (Tauri, LanceDB, node-llama-cpp, GBNF 등)
- Phase-6에서 막 완성한 HR 튜터·Knowledge Debt Radar·Drift Detection

### 수정할 것 (P0 즉시 반영)
1. **Phase-7 → 7A(2주) + 7B(3주) + Phase-8(에디터 등)** 분할
2. 모든 경로 오류 수정 (15개 변경사항 — §3 S1 표)
3. Cache key에 `promptVersion` + `workspaceId` + `sensitivityScope` 강제
4. 모든 새 테이블에 workspace FK + `varchar("sensitivity", { length: 30 }) UPPERCASE`
5. Junction table 도입: `wiki_source_refs`, `wiki_citations` (polymorphic text[] 대체)
6. Heal 결과물은 `*_draft` 테이블에 격리
7. Ingest `ingest_run` + `ingest_dlq` 테이블 + BullMQ retry/DLQ 설계 문서화
8. Merge resolution matrix (5 cases) 문서화
9. Model fallback ladder (`gpt-5.4` → `gpt-5.4-mini` degraded → cached)
10. `precedent_case` TF-IDF는 별도 lane 유지 (벡터 공간 불일치)

### 제거할 것
- Tiptap (Phase-8로 이동)
- 검색 5-stage 전부 동시 구현 (Intent/HyDE/Rerank 등은 eval 증명 후 단계적 추가)
- graphify graph lane을 retrieval 시점에 호출하는 어설션 (이미 materialize된 쿼리만)
- "60~80% 비용 절감" 같은 근거 약한 수치 (레인지 + 가정 명시로 대체)

### 추가할 것
- Phase-7A W1 D1: `llm_call_log` + `llm_cache`(versioned key) + pino request-id + OpenAI cost tracking (관측을 먼저)
- Phase-7A W1 D3: Eval fixture 큐레이션 **백그라운드 트랙** 시작 (30쌍 초벌 → W2 60쌍 → W3 100쌍)
- Phase-7A W1 D5: 10 샘플 corpus 업로드 (MD 3, PDF 3, DOCX 2, text 2)
- Phase-7A 말미: 안정화 완료 체크 통과 후 7B 시작
- Phase-7B: Ingest 재설계 (Merge matrix + DLQ + PII redaction) + 검색 MVP (`BM25 + vector + RRF`만)
- 각 주차 말미: "ko.json 신규 키 리스트", "롤백 절차", "5000명 공지 draft", "worker capacity 조정" 산출물 명시
- 모든 수치 claim 옆 "가정 + 측정 기준" 부기
- HR 튜터가 새 파이프라인 쓰는지 여부 결정 행 추가
- Simple/Expert 모드 정책 명시

---

## 6. Cross-Model Tension (Outside Voice Integration)

| 쟁점 | Codex 입장 | Claude (v1) 입장 | v2 결정 |
|------|-----------|-------------------|---------|
| Phase-7 4주 vs 10-16주 | 4주 불가능, 플랫폼 재작성 수준 | 4주 가능 (과대 추정) | **분할 (7A=2주 + 7B=3주). 에디터는 Phase-8.** |
| Tiptap 도입 | Phase-7에서 빼거나 wikilink만 | Phase-7 W3에 전체 구현 | **Phase-8로 이동. 7B에 wikilink 파싱만.** |
| graphify 이중 운영 | 리스크 숨김. 별도 서비스로 | 이미 결정된 이중 운영 유지 | **이중 운영 유지 (이미 결정). but retrieval 시점 호출 금지 문구 추가.** |
| Heal 자동 LLM 생성 | 지식베이스 오염 경로. 차단 | INFERRED 라벨로 충분 | **draft namespace 격리 + 검색 후보 제외.** |
| 캐시 TTL=null 영구 | 정정 반영 못함. 금지 | syntheses는 영구 캐시 | **영구 캐시 폐기. 기본 30일 + 관리자 invalidation CLI.** |

**Decision rule**: 3개 검증 중 2개 이상이 같은 방향을 가리키면 v2에 반영. Codex 단독 의견은 Completeness vs Simplicity 트레이드오프로 보고, Jarvis 맥락(1주 스프린트, 경량 3인)에 맞는 방향으로 타협.

---

## 7. 행동 계획

1. ✅ 이 문서(`99-review-summary.md`) 작성 완료
2. ⏭ `99-integration-plan.md` **전면 재작성** (v2) — §5의 변경 요약을 모두 반영
3. ⏭ `99-comparison-matrix.md` — 경로·타입 오류만 수정 (minor)
4. ⏭ `README.md` — 리뷰 요약 섹션 + v2 가이드 추가
5. ⏭ 커밋 → main cherry-pick → push

원본 증거 자료 (삭제 금지):
- `99-codex-review-raw.txt` — Codex 원본 출력
- `99-fact-check.md` — 경로/타입 오류 상세
- `99-gap-hunt.md` — 논리·모순·누락 상세
- `99-review-summary.md` — 이 문서 (3-way consolidation)
- `99-integration-plan.md` — v2 (재작성)
- `99-comparison-matrix.md` — 경로 수정판
