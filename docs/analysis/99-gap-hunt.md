# Gap Hunt Report — Phase-7 통합 계획 적대적 리뷰

> **작성일**: 2026-04-14
> **리뷰 대상**: `99-integration-plan.md`, `99-comparison-matrix.md`, `00-jarvis-current-state.md`
> **리뷰 원칙**: 적대적, 저자 열정의 맹점 추적. 무엇이 누락/모순/과신되었는가.
> **Top-5 요약**: 맨 마지막 절.

---

## Critical Gaps (실행 전 반드시 해결)

### GAP-01: `knowledge_claim` → `document_chunks` 마이그레이션 경로 완전 부재
**Location**: §3.3, §10.1 W1 D5 한 줄(`scripts/migrate-embeddings.ts`)로 축약  
**Description**: 기존 `knowledge_claim` 테이블에는 이미 74,342건 `precedent_case` + 95 canonical 가이드북 기반 chunk embeddings 가 IVFFlat lists=100으로 적재되어 있고, 동일 customType이 `knowledge.ts` / `case.ts` 양쪽에 중복 정의되어 있다(`current-state.md:520`). 새 `document_chunks`로 옮길 때:
  - (a) `documentType` polymorphic 컬럼이 `precedent_case.isDigest=true` / `digestPageId`의 이중 참조를 어떻게 표현?
  - (b) `precedent_case.embedding`은 **TF-IDF+SVD 1536d(API 비용 0원)** 이므로 OpenAI 임베딩과 **벡터 공간이 다르다**. 합치면 cosine 의미 붕괴.
  - (c) 신구 테이블 병행 기간 동안 Ask 경로(`ask.ts:74-84`, `case-context.ts:141`)가 어느 쪽을 읽을지 결정 부재.
  - (d) 기존 IVFFlat 인덱스는 lists=100. `document_chunks`는 lists 값 명시 없음 → 74k+ 샘플에서 recall/latency 퇴행 가능.
**Risk**: **검색 품질 리그레션 + 74k 사례 재임베딩 시 비용/시간 폭주**. TF-IDF 사례를 OpenAI로 올리려면 DATA_REFRESH_GUIDE에 언급된 $2-3/월 + 74k × 배치 시간.
**Proposed fix**:
1. W1 D5 작업을 **2개**로 분할: `scripts/migrate-embeddings-dry-run.ts` + `...apply.ts`.
2. `precedent_case` TF-IDF는 **유지하고 `document_chunks`에 편입하지 않는다** (벡터 공간 불일치). 사례는 별도 lane으로 존속 선언.
3. `knowledge_claim`만 신규 테이블로 재임베딩, **cutover 플래그**(env `USE_CHUNKS=true`) + dual-read 2주.
4. lists 파라미터를 문서화 (`lists = rows/1000`).

### GAP-02: §7.2 Step 3 "Merge strategy"의 AMBIGUOUS 케이스 결정 규칙 없음
**Location**: §7.2 Ingest Step 3  
**Description**: Plan은 "Entity: name + kind 키로 upsert, aliases 병합, contradictions 기록"만 말한다. 실제 발생하는 5가지 케이스가 전부 누락:
  - (i) 같은 `name`, 다른 `kind` (예: 'Jarvis' = product + project)
  - (ii) 같은 `name`, 같은 `kind`, 다른 `canonicalId`
  - (iii) alias가 기존 entity 이름과 충돌 ('KMS'가 entity A의 alias이자 entity B의 name)
  - (iv) Concept `synonyms` 병합 시 동일 synonym이 서로 다른 term에 매핑
  - (v) `confidence=AMBIGUOUS` 결과가 왔을 때 바로 쓸지, 리뷰 큐로 보낼지, 기존과 머지할지
**Risk**: LLM 출력이 누적될수록 **entity/concept 테이블 silent corruption**. 사내 5000명 규모에서 "KMS"가 누구인지 모델이 흔들리기 시작.
**Proposed fix**: Merge resolution matrix를 문서 §7.2 아래에 표로 추가:
| 케이스 | 액션 |
|--------|------|
| name+kind 일치, canonicalId 동일 | aliases 합집합 upsert |
| name+kind 일치, canonicalId 다름 | `review_queue` INSERT, 기존 유지 |
| name 같음, kind 다름 | 별도 row (join key = name+kind) |
| alias 충돌 | 충돌 양측을 `review_queue`에 기록 |
| confidence=AMBIGUOUS | 항상 `review_queue` 먼저, DB 쓰기 금지 |

### GAP-03: SHA256 LLM 캐시는 **프롬프트 버전 변경에 대해 무효화되지 않는다**
**Location**: §2.5 `cachedLLMCall`  
**Description**: 캐시 키는 `SHA256(JSON.stringify({op, model, prompt, extra}))`. `prompt_version`은 저장 컬럼으로만 있고 **키 구성 요소가 아니다**. 프롬프트 문자열이 바뀌면 자연히 키가 바뀌지만, **구조는 같고 version 상수만 올린 경우** (예: "2026-04-14" → "2026-04-20") 캐시 히트가 계속 나와 **stale 출력이 서빙된다**. §2.3 규칙이 "version 상수"이기 때문에 실제 프롬프트 문자열은 변하지 않을 수 있다.
**Risk**: 품질 회귀가 **조용히** 누적. eval harness가 회귀를 잡기 전까지 최대 TTL(30일) 동안 전파.
**Proposed fix**:
- 캐시 키 구성에 `promptVersion` 반드시 포함: `SHA256({op, model, prompt, extra, promptVersion})`.
- 또는 `llm_cache` INSERT 시 기존 같은 `(op, model, prompt_hash)` 엔트리를 **다른 promptVersion** 이면 soft-invalidate (invalidated_at 타임스탬프).
- 관리자용 "prompt version 업그레이드 시 일괄 invalidate" CLI 제공.

### GAP-04: `wiki_edges` vs `graphify.graph_edge` 이중 운영의 **쿼리 시 merge/priority 정책 부재**
**Location**: §5.3 "용도 분리" + §4.1 Stage 3 Graph lane  
**Description**: Plan은 "wiki_edges = Jarvis 네이티브 / graphify graph = 코드 분석" 이라고 선언하고 "Ask AI는 둘 다 쿼리"라고 끝낸다. 그러나:
  - 두 저장소는 **엣지 confidence enum이 다르다** (`wiki_edges.confidence` pgEnum vs `graph_edge.confidence` string(20)).
  - 같은 노드 (예: product 'Jarvis')에 대해 양쪽에 엣지가 동시에 존재하면 어떻게 통합?
  - BFS 3-depth 실행 시 한쪽만 할지, 둘을 union 할지, 각각 lane 분리할지?
  - RRF는 "검색 결과 랭킹 fusion"이지 "엣지 merge" 알고리즘이 아니다 — graph에 적용 불가.
**Risk**: Ask AI가 **답변을 만들 때 어느 edge를 정답으로 취급하는지 비결정적**이 되어, 같은 질문에도 다른 인용이 나올 수 있음.
**Proposed fix**:
- §4 Stage 3 graph lane을 **두 sub-lane** (code-graph / wiki-graph) 으로 명시 분리, RRF 이전에 각자 rank 생성.
- §5.3에 "동일 노드 엣지 중복 허용, 우선순위 = wiki(EXTRACTED) > code(EXTRACTED) > wiki(INFERRED) > code(INFERRED) > *AMBIGUOUS" 규칙 추가.
- `AnswerCard`에 graph sub-source 표기 (`graph:code`, `graph:wiki`).

### GAP-05: Transaction boundaries / 재시도 / DLQ 설계 전무
**Location**: §7.2 Ingest 6-step 파이프라인, §10.2 W2  
**Description**: Step 0~6은 각각 DB 쓰기 + 외부 API 호출(OpenAI) + MinIO + 다른 job enqueue를 섞는다. 실패 시나리오:
  - Step 3(DB merge 완료) → Step 4(embedding) 중 OpenAI 429/timeout → 부분 상태 (surface row 있는데 chunk 없음). **기존 `embed.ts:69` 은 transaction swap을 쓰는데**(`current-state.md:115-116`), 새 플로우는 이 보호가 언급되지 않음.
  - Step 5(graph edges) 실패 시 Step 3 롤백? 불가능 (이미 commit).
  - Step 6(graphify subprocess) 는 300000ms timeout. 실패 시 앞 단계 보존? 재시도는 graphify만?
  - BullMQ retry 전략, backoff, DLQ 테이블 명시 없음.
**Risk**: 5000명 규모에서 한 번 장애가 나면 **partial state가 DB에 남아 다음 ingest부터 hash 충돌 → skip** (Step 0 체크) → 영구 누락.
**Proposed fix**:
- §7.2 아래에 "트랜잭션 경계" 절 신설.
- Step 3~4를 **한 Postgres transaction**으로 묶되 Step 4는 placeholder commit 후 worker에서 비동기 재임베딩 (2-phase).
- `ingest_run` 테이블 신설: `status=(pending|step1|step2|...|done|failed)`, `error`, `attempts` — 진행 상태 체크포인트.
- BullMQ: 기본 3회 재시도 + exponential backoff 10s → 60s → 600s, 이후 DLQ(`ingest_dlq` 테이블).
- Step 6 graphify 실패는 fail-soft: wiki 부분은 유지하고 graphify만 재큐.

### GAP-06: Model routing — `gpt-4.1` rate-limit / deprecation 폴백 없음
**Location**: §2.2 모델 라우팅 테이블, §11 위험 완화책 ("OpenAI 가격 인상 / 모델 deprecation — env var로 swap")  
**Description**: 완화책은 "env var 바꾸면 된다"로 끝나는데, 런타임에 `gpt-4.1`이 429/500을 뱉으면 즉시 어떻게 할지 명세 없음. 5000명 spike 시나리오에서 `gpt-4.1`(합성용)만 rate limited 상태가 되면, 답변 생성 lane이 막혀 Ask AI 전체가 지연. §11은 "5000명 동시 Ask AI spike"를 낮은 가능성으로 봤으나, 동시 50명만 되어도 `gpt-4.1` RPM 한계에 쉽게 걸린다.
**Risk**: **품질 fallback ladder 없음** — 장애 시 전면 중단.
**Proposed fix**:
- `packages/core/src/llm/router.ts` 신설: task → primary + fallback 모델 pair.
- Synthesis: `gpt-4.1` 실패 → `gpt-4.1-mini` with "degraded mode" 표시 → `cached synthesis if any`.
- Rate limit 카운터 Redis (`llm:rl:{model}:{minute}`), 90% 초과 시 pre-emptive fallback.
- Sentry breadcrumb에 모델 선택 기록.

### GAP-07: Eval fixture 100쌍 — 출처/큐레이터/시간 완전 미지정
**Location**: §10.4 W4 D2 "eval 하네스 + 사내 QA 100쌍"  
**Description**: 한 줄에 "사내 QA 100쌍"이라고만 적혀있다. 현실:
  - 누가 100쌍을 작성? jarvis-planner? 사내 직원? 외부?
  - 정답 레이블(golden answer / expected citations)의 **작성자 + 검수자** 분리 없음.
  - 개인정보/보안 이슈가 있는 사내 질문을 eval에 포함할 수 있는지 정책 결정 부재 (사내 위키 답변은 sensitivity=INTERNAL 이상이 다수).
  - **큐레이션 시간** 완전 누락 — 실제로는 1주 이상 필요한 작업이 1일(D2)에 배정.
  - 라이센스: TSVD999 74k 사례 중에서 뽑을 수 있는지, 원본 데이터 제공자와의 계약 확인 필요.
**Risk**: W4 D2에 eval 하네스 코드만 생기고 실제 평가 데이터가 없어 **Recall@10 +15% 검증 자체 불가**. Phase-7 종료 기준 불충족.
**Proposed fix**:
- W1부터 **백그라운드 트랙**으로 "Eval fixture 큐레이션"을 별도 작업 스트림에 배정.
- 100쌍 출처 분배 예시: guidebook 30 / TSVD999 30 / directory FAQ 20 / 실제 search_log top queries 20.
- 각 쌍에 `curator_user_id` + `reviewed_by_user_id` 컬럼 의무. 사내 personally-identifiable 질문은 anonymize.
- 라이센스: TSVD999 제공자 승인 명시 필요 (DATA_REFRESH_GUIDE 확장).

### GAP-08: JSON Schema 출력의 sanitization / SQL injection / DoS 방어 없음
**Location**: §2.4, §5.2(wiki_sources/entities/concepts)  
**Description**: LLM이 반환한 JSON을 zod로 파싱해서 DB INSERT 한다. 하지만:
  - zod가 타입만 보장하지 **길이 제한 / 이상치**는 검증 안 함 (entity name이 10000자여도 string 맞음).
  - `entity.canonicalId`는 사용자가 URL 패스에 쓸 수 있는데, 악성 LLM 출력(경로 traversal `../admin`)을 차단하는 로직 없음.
  - `description` 내 HTML/스크립트 이스케이프 — renderer는 react-markdown이라 기본 안전하지만, **slash command / wikilink 커스텀 extension이 추가되면 리스크**.
  - Step 5 "LLM inference: 이 문서에서 추론 가능한 관계"에서 프롬프트 인젝션이 들어오면 edge 가 의도치 않은 곳을 가리킬 수 있음.
**Risk**: **프롬프트 인젝션 → DB 폴루션 → UI 렌더링 리스크**. 사내 포털이라 exploit 유인은 낮지만, 외부 Web Clipper로 들어온 문서라면 유효.
**Proposed fix**:
- zod 스키마에 `.max(length)` 강제, `canonicalId`에 `.regex(/^[a-z0-9:_-]+$/)`.
- Tiptap wikilink extension은 slug만 받고, renderer에서 `/wiki/[slug]` 링크로만 렌더링 (javascript: URL 방지).
- §2.3 `packages/prompts/` 에 "입력 sanitization 규칙" 절 추가.
- review_queue에 kind='security_suspect' 추가, 길이/패턴 이상치 자동 플래그.

---

## Medium Gaps

### GAP-09: Tiptap 도입 후 **기존 textarea wiki 페이지 마이그레이션 전략 없음**
**Location**: §6 (에디터 도입), §10.3 W3 D4-5  
**Description**: 현재 `knowledge_page_version.mdxContent`는 plain markdown 텍스트. Plan §6.3은 "primary=마크다운, Tiptap JSON은 세션 캐시만"이라고 결정 — 이건 좋다. 그러나:
  - MD → Tiptap JSON 왕복 변환이 정말 **lossless 인가**? `remark-gfm` 표·체크박스·콜아웃, `[[wikilink]]` 커스텀 extension 등은 어떻게?
  - 기존 95 canonical 가이드북 + 스태프 작성 페이지들이 에디터 오픈 시 깨지지 않는지 테스트 없음.
  - `from-markdown.ts` / `to-markdown.ts`의 round-trip 테스트는 W3 D4 1일에 하기엔 볼륨이 큼.
**Risk**: 에디터 도입 직후 "저장했더니 서식이 깨졌다" 대규모 불만.
**Proposed fix**: W3 D3 말에 "기존 95개 canonical 페이지 round-trip 테스트" 전용 작업 추가. 실패 케이스를 수집해 `WikiEditor`에 "migration warning" 배너.

### GAP-10: Chunking 재설계 시 **기존 embeddings의 migration** 미정의
**Location**: §3.3 smart chunking + `document_chunks`  
**Description**: Plan은 "증분 재임베딩 — dirty chunks만 재생성"이라고 하지만, **기존 페이지는 전체가 dirty**다(chunking 알고리즘 바뀌었으므로). 즉 처음 한 번은 전부 재임베딩. 예산/시간 계산 없음.
**Risk**: 첫 cutover 날 OpenAI 비용 spike. 가이드북만 95 × ~10 chunks = 950 호출 + TSVD999는 제외(GAP-01). 감당 가능하지만 **명시되어야 관리자 승인 가능**.
**Proposed fix**: §3.3에 "초기 마이그레이션 예상 비용" 추가: "가이드북 95 페이지 = 약 $X, 총 소요 Y시간". W1 D5 작업 확장.

### GAP-11: Multi-workspace isolation — IVFFlat global index 하에서 workspace 필터 성능
**Location**: §3.3 `document_chunks.workspaceIdx`  
**Description**: IVFFlat은 **k-means cluster based**, workspace 필터는 post-filter 형태로 작동. 5000명이 같은 cluster에 있으면 top-k가 다른 workspace에 몰리고 노이즈 증가. 실제로 `current-state.md:292`도 "code-ready, not enforced"라고 이미 인정.
**Risk**: 검색 recall 저하 + workspace 간 **정보 누출 가능성**(cross-workspace top-k가 필터링 전에 rank 결정). RBAC 필터는 `sensitivity`는 걸러도 workspace cross-leak은 별도 걱정.
**Proposed fix**:
- IVFFlat 대신 **HNSW + workspace partition index** 또는 workspace별 독립 IVF 분리.
- 최소한 "Stage 3 vector lane 쿼리 시 TOP_K_VECTOR를 크게(×3) 뽑고 workspace filter 후 top-k" 로직 문서화.

### GAP-12: `workspaceId` 컬럼의 **실제 런타임 인젝션 경로** 명세 없음
**Location**: §5.2 모든 wiki_* 테이블  
**Description**: 새 테이블 4개(`wiki_sources`, `wiki_concepts`, `wiki_syntheses`, `wiki_edges`)에 `workspaceId`가 있다. 그런데 **현재 Jarvis가 workspace를 어떻게 주입하는지** plan에 언급 전무. `current-state.md:291-292`: "모든 테이블에 workspaceId, 실전 검증 안 됨". 새 테이블 추가하면 기존 문제가 곱해짐.
**Risk**: Ingest worker / server action 중 하나라도 workspaceId 주입 누락하면 **전사 공유 상태**가 됨.
**Proposed fix**:
- W2 D1에 앞서 "workspaceId 주입 경로 감사"를 **선행 작업**으로 추가.
- `packages/shared/validation/workspace.ts` 가드 헬퍼 + lint 룰("INSERT INTO wiki_* 시 workspaceId 필수").

### GAP-13: CJK 토크나이저 업그레이드 — 기존 FTS `search_vector` 재계산 필요
**Location**: §10.3 W3 D2 "CJK 토크나이저 PG FTS 설정 업데이트"  
**Description**: PG FTS config 를 `korean` → custom CJK bigram 으로 바꾸면 기존 `knowledge_page.searchVector` GIN 인덱스의 값이 전부 stale. 재계산 / re-index 해야 하는데 W3 D2 한 줄에 포함.
**Risk**: migration apply 시 대형 테이블 lock / downtime. 39테이블 중 FTS 영향 = knowledge_page + audit_log.
**Proposed fix**: `CREATE INDEX CONCURRENTLY` 패턴 + 야간 배치, 또는 shadow column 로 dual-run 2주. W3 D2에 "zero-downtime re-index 절차" 하위작업 추가.

### GAP-14: Phase-6 기능과 Phase-7 Lint/Heal 의 **관계 재정비 없음**
**Location**: §13 체크리스트 마지막 "planner와 논의"로 deferred  
**Description**: Phase-6 에는 **knowledge debt radar** + **drift detection**이 이미 있다(`current-state.md:306`). Phase-7은 **weekly-lint (orphan/broken/missing/stale)** + **weekly-heal** 을 새로 만든다. 거의 같은 영역이지만:
  - 중복 기능인지, 대체인지, 확장인지 미결정.
  - 기존 `drift-detection.ts`(207줄)를 유지? 신규가 삼킴? Data shape 충돌?
  - `review_queue` 테이블 kind 컬럼 확장은 W2 D4에 잡혔지만, Phase-6 과 이미 써온 shape과 호환 확인 없음.
**Risk**: 기존 UI(Knowledge Debt Radar 대시보드 위젯)가 갑자기 빈값 / 오작동. Phase-6 투자 낭비.
**Proposed fix**: Pre-W1 작업으로 "Phase-6 vs Phase-7 Lint 매핑 문서" 필수. §13 체크리스트의 "논의" → **planner 산출물로 스펙화** 필수.

### GAP-15: `@anthropic-ai/sdk` 제거 vs Phase-6 튜터 / graphify subprocess 의존성 교차검증 부족
**Location**: §2.2 ("Anthropic SDK 처리"), §12 Anti-Patterns  
**Description**: Plan은 "dead dependency 제거"라고 말한다. `current-state.md:214`는 "현재 ts 파일 어디에서도 import되지 않음 — 제거 가능"이라고 확인했다. 하지만:
  - graphify subprocess는 `ANTHROPIC_API_KEY` 환경변수를 **읽는다** (`graphify-build.ts:160` allowlist). 이건 keep.
  - `.env.example`, `docker/secrets/anthropic_api_key`, `AGENTS.md` 등 여러 곳에 참조. 단순 제거하면 setup이 부서짐.
  - `§11 위험` 테이블에 "graphify subprocess 실패 — fail-soft" 있지만, 키 제거로 발생하는 "API_KEY missing" 실패 시나리오 언급 없음.
**Risk**: SDK 제거 PR이 subprocess 경로를 동시에 망침.
**Proposed fix**: §2.2에 "제거 범위는 **package.json 의존성만**. env var + secret file + docker secret은 유지" 문구. W1 D1 체크리스트에 두 개 별개 체크박스.

### GAP-16: PII redaction / sensitivity 승급 자동화 부재
**Location**: §3.3 document_chunks.sensitivity default 'internal', §7.2 Step 2  
**Description**: 사내 문서에 개인정보(주민번호, 계좌, 이메일 외부 공유, HR 평가 등)가 섞일 수 있다. 특히 TSVD999 74k 사례와 HR 튜터 대상 페이지는 PII heavy. Plan §5.2는 전부 `sensitivity='internal'` default 인데:
  - LLM에게 **그대로 전달** 시 (Step 1 analyze, Step 2 generate) OpenAI API 로 PII 송출.
  - Embedding에 PII 포함 — 벡터 공간에 누출(복구 가능한 형태로).
  - 검색 결과에 그대로 노출.
**Risk**: 사내 보안 정책 위반 가능성. 특히 EU/KR 개인정보법 관점에서 "사내 LLM 보안 감사" 시 문제.
**Proposed fix**:
- W2 D1 이전에 "PII detector 라이브러리 결정" 작업 선행 (간단한 regex + `presidio` 등).
- Ingest Step 0에서 `redactPII()` pre-pass → masked body를 LLM에 보냄, 원본은 DB만.
- 자동 `sensitivity` upgrade: "PII 감지 시 INTERNAL → RESTRICTED".

### GAP-17: "$0.01/sample" 비용 목표 / "60~80% 절감" 수치의 근거 불명
**Location**: §2.5, §3.3, §10.2 W2 D5 통과 기준  
**Description**: "예상 비용 절감 20~60%" (캐시), "60~80% 절감" (증분 임베딩), "샘플당 < $0.01" (ingest) 다수. 출처는 "qmd 근거" / 자체 산정. 실제:
  - 어떤 문서 크기/청크 수 기준?
  - 캐시 hit rate는 "사내 같은 질문 반복 빈도" 에 의존하는데 Jarvis에 해당 데이터 없음 (검증 불가).
  - Ingest 비용은 문서 길이에 선형, 샘플당 $0.01 고정 가정은 **평균 1500자 수준 가정**이지 명시 안 됨.
**Risk**: 통과 기준이 **검증 불가능한 목표**. W2 D5 에 "통과"라고 체크해도 실제 운영 비용 예측 불능.
**Proposed fix**: 각 수치 옆에 "가정" 명시. 예: "샘플당 < $0.01 (문서 평균 2000자, 2-step CoT, 캐시 warm)". W4 D2 eval 리포트에 "실측 vs 가정 편차" 섹션 의무.

---

## Contradictions

### CON-01: §3.3은 chunk 단위 임베딩만 권장하는데 §5.2 스키마에는 page-level embedding 컬럼 제거 명시가 없음
**Locations**: §3.3 "page 전체 임베딩 폐기 + chunk 단위" vs §5.2 모든 wiki_* 테이블(embedding 컬럼 없음 — 암묵적) vs `knowledge_claim`(유지? 제거?)  
**Contradiction**: Plan은 page-level 임베딩 폐기를 선언하지만, **기존 `knowledge_claim` / `precedent_case` 테이블의 embedding 컬럼을 제거한다는 명시가 없다**. 새 테이블에는 chunk embedding만 있음. 결국 두 축 병렬 존재하게 되는데 §3.3 문구와 불일치.
**Resolution**: §3.3에 "기존 `knowledge_claim.embedding`은 maintenance-only로 deprecation, `precedent_case.embedding`은 별도 TF-IDF lane 으로 유지" 명시.

### CON-02: §4.2 Stage 3 병렬 검색 — graphify subprocess는 **비동기 호출 불가**
**Locations**: §4.1 "Graph (graphify BFS 3-depth from keyword-matched seed nodes)" + `current-state.md:154` "execFileAsync 300s timeout" + §4 "Stage 2-3 병렬"  
**Contradiction**: graphify는 Python subprocess, 300초 timeout, 일반적으로 **build-time에만 호출**되어 graph_* 테이블에 materialize 됨. Plan §4는 retrieval 시점에 "graphify BFS"를 호출하는 것처럼 읽히는데, 이건 요청당 300s 레이턴시 가능. 실제 의도는 "이미 materialize된 graph_node/edge를 쿼리" 여야 하지만 문구가 모호.
**Resolution**: §4.1 그래프 lane 설명을 "이미 materialize된 wiki_edges + graph_edge 테이블을 SQL BFS로 쿼리 (graphify subprocess 호출 없음)" 으로 수정. graphify subprocess는 ingest 경로에서만 사용.

### CON-03: §2.2 테이블은 "Ask AI 라우터 분류 = `gpt-4.1-mini`"라고 적는데 §4 Stage 1은 intent 분류 를 별도 동일 모델로 중복 정의
**Locations**: §2.2 "Ask AI 라우터 분류" + §4.1 "Stage 1 Intent Classification" + `router.ts` 현재는 정규식 (`current-state.md:320` "LLM 호출 없음")  
**Contradiction**: 현재 Jarvis 라우터는 **정규식만**. §2.2는 LLM 추가를 암시, §4.1은 optional 이라 썼다. 두 곳이 같은 것인지 다른 것인지 불명.
**Resolution**: "Lane 라우터"(6-lane, text/graph/case/...)와 "Intent 분류"(동음이의어 disambiguation)를 **이름 분리**. §4.1 Stage 1은 후자라고 명시, 전자는 정규식 유지.

### CON-04: §6.3 "primary = 마크다운 본문" vs §6.4 wikilink extension의 **구조화 데이터**
**Locations**: §6.3 "primary 마크다운, Tiptap JSON은 세션 캐시만" + §6.4 "`[[slug]]` 또는 `[[slug|display]]` 삽입"  
**Contradiction**: 마크다운이 primary이면 Tiptap에서 wikilink custom node는 MD 직렬화/역직렬화 왕복에서 **자체 metadata** (예: page_id, resolved_title) 가 손실됨. §6.4 에선 backlinks 저장을 `wiki_edges` 테이블로 분리하지만, editor 컨텍스트에서는 "이미 해결된 링크인가 brokenlink인가" 구분 표시 (색상, 괄호)가 round-trip 때 마다 다시 계산되어야 함 (비용↑ + 일관성 리스크).
**Resolution**: §6.3에 "MD ↔ JSON 왕복에서 손실되는 context는 on-demand 렌더 시 복원 (Tiptap JSON 는 절대 저장 안 함)" 명시. Round-trip 규약 테이블을 §6.4 위에 삽입: 무엇이 lossless, 무엇이 regeneration 대상인지.

### CON-05: §11 "rate limit 사용자당 10 req/min" vs 현재 `ask/route.ts` "20 req/hour"
**Locations**: §11 위험 완화책 + `current-state.md:329` "20 req/hour"  
**Contradiction**: Plan §11이 기존 값을 **침묵 upgrade** 하려는 건지, 오기인지 불명.  
**Resolution**: 값 선택 근거를 §11에 명시. 10/min = 600/hour는 현재보다 30× 완화. Phase-7 신규 기능 반영 시 정당한지 검토.

### CON-06: Anti-patterns §12에 "Anthropic SDK 제거" — 그러나 §14 부록 graphify 유산은 "Anthropic 기반 Haiku+Sonnet" 전제
**Locations**: §12, §14 graphify 섹션  
**Contradiction**: 부록이 묘사하는 graphify의 장점(`Haiku/Sonnet 라우팅`)은 Anthropic API 기반. subprocess 유지 결정과 맞지만, SDK 제거 맥락을 읽은 독자는 모순으로 이해.
**Resolution**: §2.2에 "Anthropic SDK 제거는 Jarvis main 코드만. graphify subprocess 가 쓰는 `ANTHROPIC_API_KEY` 는 유지" 1줄.

---

## Scope / Scheduling Risks

### SCOPE-01: W3 D4 1일에 Tiptap 에디터 전체
**Location**: §10.3 W3 D4  
**Description**: SSR/CSR 전환, wikilink extension, paste-image presigned upload, slash-menu, suggestion — 전부 하루. 각각 1개 스프린트 나올 규모.
**Fix**: Tiptap 범위 축소 (Phase-7은 wikilink + bold/italic/link/image 까지, paste-image presigned upload 와 slash-menu 는 Phase-8 로). W3 D4~D5 합쳐서 2일 확보.

### SCOPE-02: W4 D2 "eval harness + 100쌍 데이터" 동시 (GAP-07 참조)
**Fix**: fixture 큐레이션을 W1 부터 병행 트랙. D2는 harness 코드만.

### SCOPE-03: W1 D4 RRF 테스트는 **통합 테스트 불가** (Stage 3 retrieval이 W3에 있음)
**Location**: §10.1 W1 D4  
**Description**: W1 단계에서는 BM25/Vector/Graph lane 구현체가 없어 RRF는 **고정 더미 입력 unit test** 만 가능. "통합 테스트 완료"로 오해 소지.
**Fix**: W1 통과 기준에서 "RRF 단위 테스트만 합격, 통합 검증은 W3 D3 에" 명시.

### SCOPE-04: W2 D5 "10 샘플 ingest 테스트" — 샘플 문서 준비 일정 없음
**Location**: §10.2 W2 D5  
**Description**: 10개 샘플 마크다운/PDF/DOCX 파일은 어디서 오는지 불명. 가이드북에서 고르는지, 합성하는지.
**Fix**: W1 D5 에 "샘플 코퍼스 curate + S3 업로드" 추가 (10개). 종류 분배: MD 3 / PDF 3 / DOCX 2 / text 2.

### SCOPE-05: i18n 키 신규 기능 전반에 걸쳐 누락
**Location**: §10.3 W3 D5 "ko.json 키"  
**Description**: plan 전체에서 "ko.json에 키 추가"는 W3 D5 한 줄. 그러나 Phase-7 신규 UI (에디터, cost 대시보드, explain 트레이스, lint 리뷰 큐, contradictions 리뷰) 모두 **번역 키 필요**. 누락 시 integrator 게이트에서 밀림.
**Fix**: 각 주차에 "ko.json 키 리스트" 를 산출물로 명시. Phase-7 총 예상 신규 키 개수 제시 (대략 60~80개 추정).

### SCOPE-06: 4주 안에 **5000명 communication plan** 없음
**Location**: 부재  
**Description**: Tiptap 도입, 검색 파이프라인 전환, 비용 대시보드 등은 사용자에게 체감되는 변화. 5000명에게 공지/FAQ/튜토리얼 없이 배포 시 혼란.
**Fix**: W4 D5 "회고" 옆에 "사용자 공지 draft + 스태프용 FAQ" 추가.

### SCOPE-07: Phase-7 롤백 플랜 부재
**Location**: 부재  
**Description**: §11 위험 테이블에 "스키마 drift" 정도만 있음. 실제 롤백 시나리오(예: W2 배포 후 ingest 가 프로덕션에서 실패하면) 스크립트 없음.
**Fix**: §11 옆에 "§11.5 Phase-7 롤백 플랜" 추가: feature flag (`FEATURE_TWO_STEP_INGEST=false`), 스키마 down migration, 캐시 invalidation, 모델 라우팅 downgrade 스위치.

### SCOPE-08: Worker 용량 튜닝 불명
**Location**: §11 fail-soft graphify만  
**Description**: BullMQ / pg-boss concurrency 목표 명시 없음. 5000명 ingest 동시 제출 시 worker pool 크기 / memory / OpenAI rate limit 와의 관계 미정.
**Fix**: W4 D3 전에 "worker capacity planning" 작업 추가. concurrency per job type 기본값 제안.

---

## Missing Considerations (checklist)

다음 항목은 plan 본문에 **한 번도 언급되지 않음** — 최소 체크리스트 수준으로 추가 필요:

- [ ] **Migration**: 기존 `knowledge_claim` → `document_chunks` 이관 정책 (GAP-01)
- [ ] **Cutover**: 신구 pipeline dual-run 기간 (최소 2주) 및 feature flag
- [ ] **Rollback**: 각 주별 독립 rollback 스크립트 + DB down migration 작성
- [ ] **Transaction / DLQ**: Ingest step별 트랜잭션 경계 + 재시도 정책 + DLQ 테이블 (GAP-05)
- [ ] **PII redaction**: Ingest 전 PII 마스킹 (GAP-16)
- [ ] **Worker capacity**: BullMQ/pg-boss concurrency 튜닝 (SCOPE-08)
- [ ] **User-facing communication**: 5000명 변경 공지 + 튜토리얼 (SCOPE-06)
- [ ] **Observability new metrics**: Phase-7 기능별 (ingest 성공률, cache hit rate, step별 지연, OpenAI 모델별 에러율) 구체 지정 없음
- [ ] **Cost kill switch**: 일 한도 초과 시 자동 차단 정책 (§11에 한도/알람 기준만 암시)
- [ ] **PII / 보안 감사 문서**: OpenAI API에 PII 보내는 정책에 대한 법무/보안 승인
- [ ] **Eval license / 데이터 출처**: TSVD999 원본 제공자 승인 확인 (GAP-07)
- [ ] **Tiptap bundle impact**: 에디터 진입 시 lazy load 검증 (첫 paint 시간)
- [ ] **i18n scope**: 신규 기능별 ko.json 키 리스트 (SCOPE-05)
- [ ] **Accessibility**: 통과 기준은 "Axe-core" 1줄인데 구체 범위/항목 없음
- [ ] **Sensitivity 자동 승급**: PII 감지 시 `INTERNAL → RESTRICTED` 규칙
- [ ] **Merge conflict resolution matrix**: entity/concept 중복 시 (GAP-02)
- [ ] **Edge priority matrix**: wiki_edges vs graph_edge (GAP-04)
- [ ] **Prompt version invalidation**: cache 키 구성 요소 (GAP-03)
- [ ] **Fallback ladder**: 모델 rate-limit 시 (GAP-06)
- [ ] **CJK FTS migration**: zero-downtime re-index (GAP-13)
- [ ] **Phase-6 vs Phase-7 Lint**: 기능 매핑 (GAP-14)
- [ ] **workspaceId injection guard**: lint/검증 헬퍼 (GAP-12)

---

## Over-confident Claims

### OC-01: "Recall@10 +15%" (§10.4 W4 통과 기준)
- **Baseline?**: 현재 Jarvis의 baseline Recall@10은 **측정된 적 없다**. eval harness가 W4 D2에 처음 만들어진다.
- **측정 방법?**: 어떤 질문 셋으로 ground truth 대비 평가할지 정의 없음.
- **Fix**: "Recall@10 +15% vs baseline(W4 D2 최초 측정)" 으로 명시. 수치 자체는 "first run 대비 후속 버전 +15%"로 의미 이동, 또는 "qmd 페이퍼 수치에 기반한 목표치" 라고 솔직히 표기.

### OC-02: "Tiptap 번들 크기 ~500KB gzipped" (§6.1 근거 표현)
- **버전/extensions?**: Tiptap 2.x + StarterKit + link + 커스텀 wikilink + mention + paste-image + slash-menu 일 때 실측 없음.
- **Fix**: "실측은 W3 D5 확정. 500KB는 StarterKit 기준, 추가 extension마다 +50~100KB".

### OC-03: "60~80% cost savings" (§3.3 증분 재임베딩)
- **가정**: "사내 위키의 경우 페이지당 몇 chunk만 변경" — 실증 데이터 없음. 실제로는 페이지 하나를 편집할 때 리팩토링 수준 전면 수정이 흔함.
- **Fix**: "가이드북 95 페이지 샘플에서 측정한 편집 패턴에 근거 (측정 TBD)". 또는 "최악의 경우 0%, 평균 기대치 60%" 로 레인지 표기.

### OC-04: "20~60% 호출 절감 (LLM 캐시)"
- **의존성**: 사용자 쿼리 분포 (Zipf 롱테일 심하면 캐시 효과 낮음). 사내 서치 로그에서 Top-N 반복률 측정 후 추정 가능.
- **Fix**: `search_log` 기반 "지난 30일 동일 쿼리 반복률" 수치 먼저 산출 후 범위 보정.

### OC-05: "4-surface (Jarvis) = 4-layer (llm-wiki-agent) 1:1 매핑"
- **검증**: `case` surface는 llm-wiki-agent 4-layer 에 **정확히 대응물이 없다** (sources와 syntheses 에 분할). plan §5.1 표는 이 분할을 정확히 묘사하지만 "1:1" 수사 자체는 과장.
- **Fix**: "거의 매핑" → "매핑 가능한 4축 구조. case = sources + syntheses 복합" 으로 엄밀화.

### OC-06: "Anthropic SDK는 dead dependency — 제거 가능"
- **교차검증**: `packages/ai/package.json`에만 있는지, monorepo 다른 곳 import 있는지, devDependency 인지 확인 필요. `current-state.md:56`은 "grep 결과 없음"으로 확인했지만 plan은 "제거 검토"라고 조심스러움. 그래서 OC 로 기재하지 않아도 되지만, §12 "Anti-patterns" 에 "제거"를 이미 넣었다.
- **Fix**: §13 체크리스트의 "`@anthropic-ai/sdk` 제거 검토 (graphify subprocess와 무관한지 확인)" 는 좋은 표현. §12 확정 어투를 완화.

### OC-07: "Stage 2 Strong-signal bypass 가 cost 절감"
- **가정**: BM25 top score ≥ 0.85 + gap ≥ 0.15 에 해당하는 쿼리가 **어느 정도 비율** 인지 미측정. 비율이 낮으면 bypass 효과 제한.
- **Fix**: W3 D1 에 "search_log 샘플링해 bypass 조건 충족률 측정" 작업 추가.

---

## "감독 모드" 관련 체크

- **jarvis-planner 수용성**: planner 에이전트는 "영향도 체크리스트 9계층" 강제 (`current-state.md:649`). Phase-7 주차 단위 작업은 대부분 9계층 중 DB/validation/권한/AI/서버액션/UI/i18n/테스트/워커 **전 계층을 건드림**. planner가 한 작업을 쪼개면 **planner 출력이 폭주**할 가능성. 각 D를 2~3개 sub-task로 분해하는 메타 룰이 필요하다. (예: "W2 D3 = 3 sub-tasks: prompts 스펙, worker job, 단위 테스트")
- **builder/integrator 정합**: builder는 "의존성 순서" 강제 (`current-state.md:650`), integrator는 수정 안 함 (빌더 되돌림). W2처럼 builder 가 DB+prompts+worker+merge strategy 를 동시에 손봐야 하는 주차는 builder 본인이 "11단계 순서"로 나눠야 하는데, plan은 이걸 지원하지 않음. **builder 전용 "Phase-7 주차 템플릿" 필요**.
- **integrator 자동화**: W1~W4 통과 기준 중 "type-check/lint/test/drift" 는 integrator 자동 실행이지만, "LLM 비용 $0.01/sample", "캐시 hit rate > 80%", "Axe-core 통과" 같은 비기술적 지표는 **integrator 커버리지 밖**. 누가 이 지표를 검증?
  - **Fix**: 별도 "harness: qa" 또는 "harness: bench" 에이전트 추가, 또는 기존 integrator 역할 확장 + 스크립트 제공.

---

## 레퍼런스 ↔ MEMORY 컨텍스트 정합

### CTX-01: "정본 위키 + 판례 + 그래프 + 튜터" 4축 전략 (MEMORY) — plan에서 **튜터**만 약함
**Description**: Phase-6의 HR 튜터(`tutor.ts`)는 Phase-7 plan 에서 한 번도 언급되지 않는다. 새 `document_chunks`, `wiki_syntheses`, `wiki_edges` 는 튜터 guide/quiz/simulation 에 영향. 튜터는 `ASK_AI_MODEL` env(기본 `gpt-5.4-mini`) 참조로 이미 동일 모델을 쓰지만 §2.2 synthesis 전용 모델(`ASK_AI_SYNTHESIS_MODEL=gpt-5.4`) 승급 정책과의 관계가 불명.
**Fix**: §2.2 테이블에 "HR 튜터 답변 생성" 행 추가. 튜터 retrieval 이 새 파이프라인을 쓸지, 자체 경로 유지할지 결정.

### CTX-02: 2단 UI (Simple/Expert) — Phase-7 신규 기능 지원?
**Description**: MEMORY + `current-state.md:327` 의 Simple/Expert 모드는 ask.ts 에 internal. Phase-7 신규 UI (cost 대시보드, explain 트레이스, 에디터) 도 Simple/Expert 분기 있는지 없는지 plan 에 기재 없음.
**Fix**: §6, §9.3 에 "신규 UI 는 Expert 모드 default, Simple 모드는 접근 제한 또는 읽기 전용" 정책 명시.

### CTX-03: Phase-6 "안정화" 기조 vs Phase-7 대규모 리팩토링 타이밍
**Description**: MEMORY + `current-state.md:61`은 "기능 완성, 운영 미완성" 이라 했다. CURRENT_STATE도 다음 우선순위를 "Extended test coverage, CI/CD pipeline, Production observability" 라 명시 (`current-state.md:34-38`). Phase-7 은 이 3축을 **일부만** (W4에 몰아서) 처리하고, 나머지 3주는 **신규 리팩토링**. Phase-6 이 실제로 안정화 덜 되었는데 Phase-7을 중첩하면 **기술 부채 가속**.
**Recommendation (scope challenge)**: Phase-7 을 **2개로 쪼갠다**:
  - **Phase-7A (2주)**: 기반(W1) + 관측/CI/테스트 강화 (W4 이동). 즉 "안정화 마무리".
  - **Phase-7B (3주)**: Ingest 재설계 + 검색 파이프라인 + 에디터. Phase-7A 통과 후 진입.
  이렇게 하면 안정화-리팩토링 순서 깨지지 않음. 

---

## Recommendations (apply to 99-integration-plan.md)

순번은 우선순위 (1 = 가장 시급).

1. **§7.2 Step 3 아래에 "Merge Resolution Matrix" 표 추가** (GAP-02). AMBIGUOUS 케이스 5종 결정 룰 명문화.
2. **§2.5 Cache Key 구성에 `promptVersion` 필수 포함** (GAP-03). `cachedLLMCall` 시그니처 수정.
3. **§3.3 + §10.1 W1 D5 `knowledge_claim → document_chunks` 마이그레이션 플랜 분리 상세화** (GAP-01). precedent_case TF-IDF 별도 lane 선언.
4. **§7.2 아래 "Transaction / Retry / DLQ 설계" 신설** (GAP-05). `ingest_run`, `ingest_dlq` 테이블 추가.
5. **§2.2 아래 "Fallback Ladder" 테이블 추가** (GAP-06). 각 모델 primary + fallback pair.
6. **§10.4 W4 D2 를 W1 부터 병행 트랙으로 분리** (GAP-07, SCOPE-02). Eval fixture 100쌍 큐레이션 오너 + 스케줄.
7. **§5.2 와 §6 에 "입력 sanitization + PII redaction" 절 추가** (GAP-08, GAP-16).
8. **§11 위험 테이블 아래 "롤백 플랜 + 기능 플래그 매트릭스" 신설** (SCOPE-07).
9. **§13 체크리스트의 "Phase-6 knowledge debt vs Phase-7 Lint 통합" 을 Pre-W1 문서화 작업으로 승격** (GAP-14).
10. **§10.1 W1 D5 에 "샘플 corpus 10개 + eval fixture 30쌍 초벌 curate" 선행 작업 추가** (SCOPE-04 + GAP-07).
11. **§10.3 W3 D4 Tiptap 범위 축소 선언 + D5 와 병합 2일 재배분** (SCOPE-01).
12. **§4.1 Stage 3 graph lane 설명을 "이미 materialize된 DB 쿼리, graphify subprocess 호출 없음" 명시** (CON-02).
13. **§2.2 Anthropic SDK 범위를 "package.json deps 만" 로 명확화 + env/secret 유지 명시** (GAP-15, CON-06).
14. **§3.3 `document_chunks` IVFFlat vs HNSW + workspace partition 결정 근거 추가** (GAP-11).
15. **§10 각 주차 말미에 "ko.json 신규 키 리스트 산출물" 명시** (SCOPE-05).
16. **§11 "5000명 communication plan" 행 추가 + W4 D5 에 공지/FAQ 초안 task** (SCOPE-06).
17. **§10.3 W3 D2 CJK FTS 업그레이드에 "zero-downtime re-index 절차" 하위작업 추가** (GAP-13).
18. **각 수치 claim (§2.5, §3.3, §10.2 통과 기준) 옆에 "가정 / 측정 기준" 1-2줄 부기** (OC-01~04, 07).
19. **§2.2 HR 튜터 라우팅 행 추가, 튜터 retrieval 신규 파이프라인 편입 결정** (CTX-01).
20. **(옵션) Phase-7 을 7A(안정화 마무리 2주) + 7B(리팩토링 3주) 로 재구조화 검토** (CTX-03). 이건 저자 의사 결정.

---

## Top-5 Summary (< 200 words)

1. **GAP-01 (Migration)**: 기존 `knowledge_claim` + `precedent_case` (74k TF-IDF 벡터) 을 신규 `document_chunks` 로 옮기는 경로가 한 줄로 축약. TF-IDF와 OpenAI 임베딩은 **벡터 공간이 다르므로 합칠 수 없다** — 별도 lane 선언 + cutover 절차 필수.
2. **GAP-02 (Merge AMBIGUOUS)**: Ingest Step 3의 entity/concept 병합 규칙이 happy path만 있음. 이름충돌·kind충돌·alias충돌·AMBIGUOUS 처리를 표로 확정하지 않으면 **DB silent corruption**.
3. **GAP-03 (Cache Invalidation)**: LLM 캐시 키에 `promptVersion` 이 **빠짐** — 프롬프트 version을 올려도 캐시가 hit해서 stale 출력 서빙. 키 구성에 version 포함 필수.
4. **GAP-05 / GAP-07 (Transactions + Eval)**: Ingest 6-step은 트랜잭션/DLQ/재시도 전무 + W4 D2 "eval 100쌍" 은 **큐레이션 시간 완전 누락**. 전자는 partial state bug, 후자는 Phase-7 통과 기준 검증 자체 불능.
5. **CON-02 / SCOPE-01 (Graph + Tiptap)**: §4 Stage 3 "graphify BFS" 는 subprocess 호출처럼 읽혀 300s 지연 리스크 + W3 D4 단 하루에 Tiptap 전체는 비현실적. 전자는 문구 수정, 후자는 Phase-8 분할 필요.

**Meta**: Phase-6 안정화 미완 상태(기능 완성/운영 미완)에서 Phase-7 대규모 리팩토링은 **기술부채 가속 리스크**. 7A(2주 안정화) + 7B(3주 리팩토링) 분할 검토 권고.
