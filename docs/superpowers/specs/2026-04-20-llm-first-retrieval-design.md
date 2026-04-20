---
title: "LLM-first Retrieval Design — Karpathy Page-first 교정"
date: 2026-04-20
author: kms + claude-code
status: draft-for-review
related:
  - WIKI-AGENTS.md
  - docs/plan/2026-04-19-cliproxy-todo.md
  - apps/worker/eval/fixtures/2026-04/
  - scripts/wiki-reproject.ts
  - scripts/build-wiki-index.ts
supersedes_partial:
  - docs/plan/2026-04-19-Jarvis_openai연동가이드.md
  - compass_artifact_wf-91854e67-16c1-4e8c-bc8b-882e7642b5fe
---

# LLM-first Retrieval Design — Karpathy Page-first 교정

## 0. TL;DR

Jarvis 현재 `packages/ai/page-first/shortlist.ts`는 SQL ILIKE + pg_trgm으로 페이지 후보를 뽑고, LLM은 마지막 synthesis에서만 호출된다. 이 구조는 Karpathy LLM Wiki 원본의 **"LLM이 index.md를 읽고 탐색을 주도"** 원칙에서 한 발 떨어져 있다 — 사실상 "벡터 RAG → lexical SQL RAG" 교체에 불과하다. 특히 "빙부상 ↔ 처부모상" 같은 용어 매핑은 SQL ILIKE가 구조적으로 풀 수 없다.

본 설계(**C 방향**)는 **탐색 주체를 LLM으로 옮기고 DB는 권한·감사 게이트로 축소**한다. `wiki_page_index`의 RBAC 필터는 유지하되, "어떤 페이지를 읽을지"는 LLM이 catalog를 보고 판단한다. pilot 4~5주 안에 A-20 Recall@5 +10% 이상을 목표로 한다.

---

## 1. 철학

**"LLM이 wiki를 이해하고 탐색한다. DB는 '누가 볼 수 있나'만 답하는 조용한 게이트키퍼다."**

Karpathy 원본(https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)의 인덱싱 4층을 엔터프라이즈(멀티테넌트/RBAC/감사/한국어) 제약 하에 구현한다. Graphify는 별도의 5층(코드 AST)으로 공존한다.

---

## 2. 인덱싱 4층 + Graphify 5층

| 층 | 역할 | Jarvis 구현 | 본 설계의 활용 |
|---|---|---|---|
| **1. index.md 카탈로그** | LLM이 읽는 목차 (페이지 리스트 + 1-line snippet) | `scripts/build-wiki-index.ts` | Step 3의 catalog compact 뼈대 |
| **2. wikilink 그래프** | 페이지 간 명시적 관계 `[[slug]]` | `wiki_page_link` + `wiki-reproject.ts` | Step 4의 hub 힌트 (inbound 많은 페이지 우선 표시) |
| **3. frontmatter aliases** | 용어 동의어 ("빙부상 = 처부모상") | 각 .md의 frontmatter.aliases | Step 2의 SELECT 포함 → Step 4에서 LLM이 매핑 판단 |
| **4. tags/domain** | 계층 분류 | 각 .md frontmatter.tags/domain | Step 1 domain 추론 + Step 2 WHERE 필터 |
| **5. Graphify 코드 AST** | 코드 전용 (tree-sitter + Leiden) | `graph_snapshot` + `graphify-build.ts` + `/api/graphify/snapshots/` | Step 3의 code-intent 감지 시 module summary 주입 |

**Graphify 적용 범위 명시**: 일반 마크다운 문서(Policy, Cases digest, Guidebook)는 Graphify 대상이 **아님** — tree-sitter markdown AST는 "heading/paragraph" 수준이라 관계 정보가 없다. 페이지 간 관계는 `[[wikilink]]`가 생성하는 2층으로 충분. **EHR4/5 Java·SQL 소스만 Graphify 대상.**

---

## 3. Architecture

```
User question
    │
    ▼
[1] Domain infer (optional)            ← cheap keyword / LRU cache / mini-LLM
    "휴가" → domain=policies
    │
    ▼
[2] RBAC catalog pull                  ← DB만 여기서 개입
    SELECT path, title, slug, frontmatter->'aliases',
           frontmatter->'tags', first_120_chars
    FROM wiki_page_index
    WHERE workspace_id = ? AND sensitivity ≤ user_level
      AND (domain = ? OR ? IS NULL)
    → 수백 rows (domain 축소 성공 시)
    │
    ▼
[3] Catalog compact                    ← pure function
    각 row → "`path` [aliases] — snippet(120 char)"
    총 input ≤ 15K tokens (초과 시 top-300 by freshness)
    code-intent 감지 시 → Graphify snapshot의 module summary 추가 주입
    │
    ▼
[4] LLM shortlist — "탐색자 LLM" (NEW)
    input: 질문 + catalog + aliases(3층) + wikilink hub 힌트(2층)
    output: {pages: ["policies/leave-vacation", ...], reasoning: "..."}
    model: ASK_AI_MODEL via CLIProxy (FEATURE_SUBSCRIPTION_QUERY=true 시)
    │
    ▼
[5] Disk read (SSoT)
    wiki/{ws}/{path}.md frontmatter + body (5~8개, ~15-30K tokens)
    │
    ▼
[6] LLM synthesize — "합성자 LLM" (기존 유지)
    [[slug]] 인용, source refs, streaming SSE
    │
    ▼
사용자 응답 (SSE: route / sources / content / done)
```

**역할 재분배**

| 레이어 | 현재 | C 이후 |
|---|---|---|
| **DB** | 탐색자(shortlist 주도) + 권한 필터 + 감사 | **권한 필터 + 감사 only** (탐색 X) |
| **LLM** | 합성자 only | **탐색자 + 합성자** |
| **Disk** | SSoT | SSoT (동일) |

---

## 4. Components (파일별 변경)

| 파일 | 현재 | C 이후 | 변경 유형 |
|---|---|---|---|
| `packages/ai/page-first/shortlist.ts` | SQL ILIKE + pg_trgm + 랭킹 | **`catalog.ts`로 rename**. RBAC + domain 필터 only. tokenize/scoring 제거 | Rename + 기능 축소. 단 **legacy fallback용 별도 export 유지** (`legacyLexicalShortlist()`) |
| `packages/ai/page-first/llm-shortlist.ts` | — | **신규**. `selectPages(catalog, question) → {pages, reasoning}`. Zod schema validation + hallucination slug 필터 | 신규 |
| `packages/ai/page-first/domain-infer.ts` | 일부 `infra-routing.ts` | **신규 or 확장**. 질문 → domain 추정 (keyword table + 모호 시 null) | 신규 |
| `packages/ai/page-first/index.ts` | shortlist → expand → read → synth | **domain-infer → catalog → llm-shortlist → read → synth**. 내부에 `FEATURE_LLM_SHORTLIST` 분기 | 파이프라인 재조립 |
| `packages/ai/page-first/expand.ts` | 1-hop wikilink expansion | **선택 제거**. LLM shortlist가 이미 관련 페이지 포함. 유지하려면 "LLM 선택 후 wikilink 1-hop 보강" | 역할 축소 또는 제거 |
| `packages/ai/page-first/read-pages.ts` | 파일 read | **유지** | — |
| `packages/ai/page-first/synthesize.ts` | LLM synthesis | **유지** | — |
| `packages/ai/provider.ts` | op-level routing | **유지**. `query` op 안에서 shortlist LLM 호출도 gateway로 | — |

**DB 스키마**: 변경 없음. `wiki_page_index`의 frontmatter jsonb에 aliases/tags 이미 저장됨.

**신규 LoC 추정**: ~400 줄 (catalog rename 포함).

---

## 5. Data flow — 상세

### Step 1. Domain inference

입력: `question: string`

로직:
```ts
const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  policies: ["휴가", "빙부상", "비과세", "연말정산", "수당", ...],
  procedures: ["신청", "등록", "예약", ...],
  cases: ["에러", "오류", "문의", "장애", ...],
  code: ["프로시저", "테이블", "I/F", "P_", "T_", ...],  // code-intent 신호
  references: ["조직도", "계정과목", "FAQ", ...],
  ...
};

function inferDomain(q: string): Domain | null {
  // keyword hit 상위 1개 반환. 2개 이상 tie → null
}
```

모호할 때 null → Step 2에서 전체 catalog (성능 저하 허용).

### Step 2. RBAC catalog pull

SQL:
```sql
SELECT path, title, slug,
       frontmatter->'aliases' AS aliases,
       frontmatter->'tags' AS tags,
       left(body, 120) AS snippet,  -- 별도 column 또는 MinIO 조회
       updated_at
FROM wiki_page_index
WHERE workspace_id = $1
  AND sensitivity_passes($2, user_permissions)
  AND ($3::text IS NULL OR frontmatter->>'domain' = $3)
ORDER BY updated_at DESC
LIMIT 500;
```

**주의**: `body`는 `wiki_page_index`에 없다. 선택지:
- (a) 120-char snippet을 frontmatter 옆 컬럼으로 `wiki-reproject` 시 populate (snippet이 stale해질 수 있음)
- (b) Step 3에서 필요 시 disk에서 첫 120 char read
- (c) **권장**: (a) 채택. reproject가 deterministic이라 drift 가능성 낮고, 한 번의 SQL로 끝나 성능 좋음. 마이그레이션: `ALTER TABLE wiki_page_index ADD COLUMN snippet varchar(200);`

### Step 3. Catalog compact

입력: 수백 rows

포맷 (각 page 1 line):
```
`policies/leave-vacation` [휴가, 빙부상, 처부모상, 연차] — 연차/경조사 휴가 규정과 신청 절차. 근속 연수별 연차 부여...
```

총 sum(line length) ≤ 15K tokens. 초과 시:
- Priority: (a) Hub pages (inbound count 상위 30%)
- Then: (b) `updated_at DESC` cap 300

Code-intent 감지 시 (domain=code): 최신 Graphify `graph_snapshot`의 top-10 module summary를 catalog 앞에 추가:
```
== GRAPHIFY CODE GRAPH (top modules) ==
- module: EHR5/procedures/hr
  nodes: 234, top-linked: P_HRI_AFTER_PROC_EXEC, P_SAL_CALC_EXEC, ...
...
```

### Step 4. LLM shortlist

Prompt 템플릿 (version `v1`):
```
You are a Jarvis knowledge navigator. Select 5-8 wiki pages that are
most likely to answer the user's question. Consider aliases (synonyms)
and wikilink hubs.

Question: {question}

Catalog ({N} pages):
{catalog_lines}

{optional_graphify_summary}

Return JSON:
{
  "pages": ["slug1", "slug2", ...],
  "reasoning": "1-2 sentences on why these pages"
}
```

Response validation (Zod):
```ts
const ShortlistResponse = z.object({
  pages: z.array(z.string()).min(2).max(10),
  reasoning: z.string().max(500),
});
```

Post-processing:
1. Filter pages to those present in catalog (hallucination 방어)
2. If filtered count < 2 → fallback to `legacyLexicalShortlist()`
3. Cache key: `sha256(question + catalog_hash + prompt_version)` → LRU 10K

비용 (gpt-5.4-mini via CLIProxy = 구독, 직결 시 ~$0.002/call):
- Input ~10K + Output ~500 tokens

### Step 5-6

기존 `read-pages.ts` + `synthesize.ts` 그대로 재사용. 변경 없음.

---

## 6. Error handling

| # | 시나리오 | Step | 복구 | 관측 |
|---|---|---|---|---|
| 1 | `wiki_page_index` 0 rows (RBAC pass 후) | 2 | "접근 가능 페이지 없음" + admin alert | 운영 이상 신호, wiki-reproject 미실행 경고 |
| 2 | Domain inference 모호 | 1 | silently fallback → domain=null, 전체 catalog | debug log |
| 3 | Catalog > 15K tokens | 3 | top-300 by `updated_at DESC`. `tokenize(question) ∩ (aliases + tags)` 2차 pre-rank | metric: catalog_overflow_count |
| 4 | LLM shortlist JSON 파싱 실패 | 4 | zod strict → 실패 시 `legacyLexicalShortlist()` fallback + `llm_call_log` 기록 + circuit breaker 통합 | metric: llm_shortlist_fallback_rate |
| 5 | LLM이 존재 안 하는 slug 반환 | 4 | catalog 존재 slug만 필터. 남은 게 <2개면 legacy fallback | metric: hallucinated_slug_rate |
| 6 | LLM이 권한 없는 페이지 요청 | 4 | 불가능 (Step 2에서 pre-filter). 방어적 Step 5 second-layer check | assertion log |
| 7 | Disk read 실패 | 5 | 해당 페이지 skip + `wiki_page_index.stale=true` 마킹 | metric: disk_read_miss_rate |
| 8 | Synthesize LLM 실패 | 6 | 기존 SSE error 이벤트 | 기존 로직 |
| 9 | CLIProxy quota exceeded | 4, 6 | `breaker.ts` → `forceDirect=true` → OpenAI 키 폴백 | metric: breaker_open_count |
| 10 | Budget exceeded | pre | 기존 `BudgetExceededError` | 기존 로직 |

**원칙**: Step 4 실패 시 **legacy SQL shortlist가 graceful fallback** — 전면 장애 방지.

---

## 7. Testing

### 7.1 Unit tests

| 파일 | 항목 |
|---|---|
| `catalog.ts` | workspace/sensitivity/requiredPermission/domain 필터 분기 |
| `domain-infer.ts` | 한국어 키워드 매핑, 모호 tie → null |
| `llm-shortlist.ts` | prompt 스냅샷, zod 검증, hallucination 필터, <2개 → legacy fallback, via=gateway vs via=direct mock |
| `page-first/index.ts` | E2E (mocked LLM + DB) |

### 7.2 Regression — A-20 자동 평가

기존 `apps/worker/eval/` 인프라 활용. A-20 질문을 `eval-031.md ~ eval-050.md`로 추가.

실행:
```bash
pnpm eval:run
```

**3-Metric**:

| Metric | 정의 | 목표 |
|---|---|---|
| **Recall@5** | shortlist top-5에 정답 페이지 포함률 | ≥ 80% |
| **Answer quality** | LLM-judge 0-1 스코어 | ≥ 0.7 평균 |
| **Grounding** | 인용된 `[[slug]]`가 실제 읽은 페이지 내 존재 | 100% |

### 7.3 A/B baseline

- **Phase α**: `FEATURE_LLM_SHORTLIST=false` → legacy SQL 결과를 baseline으로 기록
- **Phase γ 종료**: `FEATURE_LLM_SHORTLIST=true` → 동일 fixture로 after 측정
- **승인 게이트**: Recall@5 절대값 +10% 이상 AND Quality 유지 이상

### 7.4 E2E (Playwright)

A-20 중 5개만 실제 브라우저로 (`apps/web/e2e/ask-a20.spec.ts` 신규).

---

## 8. Migration / Rollout

### 8.1 Feature flag 이중 체계

```bash
FEATURE_PAGE_FIRST_QUERY=true              # 이미 true (기존)
FEATURE_LLM_SHORTLIST=false                # 신규 (default off, C 활성 시 true)
FEATURE_SUBSCRIPTION_QUERY=false → true    # CLIProxy 경유 (구독)
FEATURE_GRAPHIFY_DERIVED_PAGES=false → true # Code 도메인 활성 시
```

**매트릭스**:

| `PAGE_FIRST_QUERY` | `LLM_SHORTLIST` | 동작 |
|---|---|---|
| true | false | **Phase α baseline** — legacy SQL shortlist + LLM synthesize |
| true | **true** | **C 최종 상태** — LLM shortlist + LLM synthesize |
| false | — | legacy RAG (deprecated, 사용 안 함) |

### 8.2 단계별 Rollout

| Step | 작업 | 기간 | 롤백 |
|---|---|---|---|
| **0** | wiki-reproject 실행 (1322 rows), `wiki_page_index.snippet` 컬럼 마이그레이션 포함 | 오늘 | 테이블 TRUNCATE |
| **1** | CLIProxy compose up + `FEATURE_SUBSCRIPTION_QUERY=true` | 오늘 | flag off |
| **2** | eval-031~050 추가 + `pnpm eval:run` → legacy baseline | 1일 | - |
| **3** | C 구현 (`catalog.ts`, `domain-infer.ts`, `llm-shortlist.ts`, `index.ts` 수정) + unit test | 2-3일 | flag off |
| **4** | dev에서 `FEATURE_LLM_SHORTLIST=true` → eval 재측정 → delta | 1일 | flag off |
| **5** | Recall@5 +10% 통과 시 → 운영 flag on | 1일 | flag off |

### 8.3 EHR Graphify 활성화 (병렬 트랙)

| Step | 작업 |
|---|---|
| G1 | EHR4/5 소스 zip → raw_source 등록 (UI 업로드 또는 CLI) |
| G2 | `FEATURE_GRAPHIFY_DERIVED_PAGES=true` + graphify-build 큐 publish |
| G3 | `wiki/jarvis/auto/derived/code/**` 생성 확인 + `graph_snapshot` row 확인 |
| G4 | wiki-reproject 재실행 → derived 페이지도 catalog 포함 |
| G5 | `/architecture` 접속 → vis-network 렌더 확인 |
| G6 | A-20 Code형 재측정 (`P_HRI_AFTER_PROC_EXEC` 등) |

### 8.4 WIKI commit 정책

```bash
cd wiki/jarvis
git init
git add .
git commit -m "initial wiki snapshot"
```
- Jarvis 메인 `.gitignore`에 `wiki/jarvis/` 추가 (또는 submodule)
- dev 중엔 자유 ingest, 운영 배포: tag-based (`release-YYYY-MM-DD`)
- 운영 서버: `git pull wiki` + `pnpm exec tsx scripts/wiki-reproject.ts`

### 8.5 전면 롤백 경로

3개 flag 중 하나 끄면 즉시 복귀, DB 변경 없음 (snippet 컬럼은 추가만 해서 backward-compat):
```bash
FEATURE_LLM_SHORTLIST=false
FEATURE_SUBSCRIPTION_QUERY=false
FEATURE_GRAPHIFY_DERIVED_PAGES=false
```

### 8.6 Phase 타임라인

| Phase | 기간 | 마일스톤 |
|---|---|---|
| **α baseline** | 오늘~내일 | Step 0-2 완료, A-20 legacy 수치 |
| **β UI** | 2-3일 | `/wiki/graph` + `/architecture` nav 연결, Ask UI 폴리싱, 빈 상태 안내 |
| **γ C 구현** | 3-5일 | Step 3-4 완료 |
| **δ WIKI 채우기 + EHR Graphify** | 5-7일 (병렬) | Step 5 + G1-G6, A-20 재측정 |
| **ε cleanup** | 2일 | docs/data 정리 (Delete/Move 실행), self-def drift 수정, ask.ts 삭제, compass 문서 disposable 처리 |

**총 3-4주**에 pilot-ready.

---

## 9. A-20 실패 패턴 매핑

A-20은 최소 13개의 실제 실패 사례로부터 출발하며, 30개까지 확장 예정. 아래는 카테고리별 대표 질문과 기대 해결 경로.

| 카테고리 | 대표 질문 | 기대 해결층 | 현재 상태 |
|---|---|---|---|
| Policy (단순) | "빙부상 휴가 며칠?" | 2층 wikilink + 3층 aliases | manual/policies/leave-vacation.md 존재. aliases에 "빙부상" 포함되어 있으면 Step 4 LLM이 매핑 |
| Cases (유사 사례) | "대결자 결재 신청 시 에러, 어디가 문제?" | Cases synthesis (이미 존재, 1322 rows에 포함) | wiki-reproject 돌리면 catalog 진입 |
| Code (identifier) | "P_HRI_AFTER_PROC_EXEC에 뭐 있어?" | 5층 Graphify | Graphify 미실행. G1-G6 후 가능 |
| Process (절차) | "근태 프로세스 알려줘" | 1+2층 (index + wikilink) | manual/procedures/attendance.md 존재 |
| 복합 (cross-domain) | "비과세 추가 시 연말정산 프로시저 수정" | 2+3+5층 모두 | C 구현 + Graphify 모두 필요. A-20의 절반 난이도 |
| Incident/Diagnostic | "급여 계산 틀렸는데 어디 봐야?" | Cases + Code (복합) | 동일 |

**pilot 성공 정의**: A-20에서 Recall@5 ≥ 80% + Quality ≥ 0.7. 단일 카테고리 편중 없이 카테고리별 ≥ 3개 통과.

---

## 10. 연결된 의사결정 (scope 외)

- **CLIProxy 구독 경로**: 본 설계는 구독 사용을 전제하되 세부 활성화는 `docs/plan/2026-04-19-cliproxy-todo.md`에 위임. OAuth 로그인·sops 암호화·breaker 통합 테스트·관측성 메트릭은 해당 문서 P0-P2로 관리
- **docs/data 정리**: Phase ε cleanup에서 `data/canonical/**` (76개), `data/guidebook/**`, mindvault 등 Delete/Move 실행. 본 설계 범위 외
- **workspace 독립 git repo**: Phase δ 병행. `wiki/{workspaceId}/.git` 분리로 dev-release 사이클 확보
- **5000명 확장**: 본 설계는 100명 pilot 기준. catalog가 5000 페이지까지 커져도 domain 분할로 15K token 이내 유지 가능. 5000명 규모 RBAC 퍼포먼스는 별도 benchmark 필요

---

## 11. 승인 및 구현 조건

- [x] 사용자-Claude 브레인스토밍 합의 (2026-04-20)
- [x] Section 1 (Architecture) 승인
- [x] Section 2 (Components) 승인
- [x] Section 3 (Data flow) 승인
- [x] Section 4 (Error handling) 승인
- [x] Section 5 (Testing) 승인
- [x] Section 6 (Migration) 승인
- [ ] 이 스펙 파일 사용자 검토
- [ ] `superpowers:writing-plans`로 구현 플랜 작성
- [ ] Phase α Step 0-2 실행 (baseline)
- [ ] A-20 eval-031~050 fixture 추가
- [ ] Phase γ C 구현 + test

---

## 12. 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-20 | v1 초안 | 사용자-Claude 브레인스토밍에서 compass v2 재-v2 초안 검토 + 실제 저장소 상태 조사 결과로 합의한 C 방향 (LLM-first shortlist) 확정 |

---

## Appendix A. compass_artifact v2 재-v2 대비 달라진 결정

| 항목 | compass v2 재-v2 제안 | 본 설계 |
|---|---|---|
| Feature flag 구조 | `FEATURE_SUBSCRIPTION_LLM` 단일 | **op-level (INGEST/QUERY/LINT/graph) — 이미 구현됨** (변경 없음) |
| Ingest 라우팅 | CLIProxy 경유 | **직결 유지 (ToS 회색지대)** — 현재 코드 유지 |
| Embedding 로컬화 | Ollama bge-m3 권고 | **보류** (C 설계는 embedding 거의 안 씀 — page-first lexical + LLM이 대체) |
| ask.ts 삭제 | 즉시 | **Phase ε cleanup** (C 구현과 독립, 나중에) |
| Graphify 활성 | 옵션 A 즉시 | **Phase δ**. 단 Code 도메인만. Policy/Cases md에는 불필요 (사용자 지적 반영) |
| 자기정의 "5000명 → 100명 pilot" | 즉시 치환 | **Phase ε cleanup**. pilot 선언은 반영 |
| Graphify 적용 범위 | 명시 안 됨 | **EHR 코드 전용 명시** — Policy/Cases 일반 md는 제외. Karpathy 2층과 Graphify 5층 역할 분리 |
| 탐색 주체 | 명시 안 됨 | **사용자 지적("DB가 관여하면 안됨") 수용 → LLM이 탐색 주도**. 본 설계의 핵심 차이 |

---

## Appendix B. 관련 링크

- Karpathy LLM Wiki gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- WIKI-AGENTS.md: Jarvis 지식 하네스 자기정의
- `packages/ai/page-first/`: 현재 구현
- `scripts/wiki-reproject.ts`: 디스크→DB 프로젝션
- `scripts/build-wiki-index.ts`: index.md 카탈로그 빌더
- `apps/worker/eval/`: 평가 인프라
- `infra/cliproxy/`: CLIProxy 구독 게이트웨이
