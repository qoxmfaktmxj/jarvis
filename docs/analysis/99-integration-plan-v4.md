# Jarvis 통합 계획 v4 — Karpathy LLM Wiki + Graphify + Git SSoT

> **문서 상태:** draft (승인 대기). 이 문서가 승인되면 `active`로 전환하며, 이후 Phase-W1~W4 모든 스프린트의 DoD·게이트·롤백 기준이 여기에 연결된다.
>
> **작성일:** 2026-04-15
> **작성자:** 아키텍처 정렬 담당 (Karpathy 피벗 반영)
> **승인권자:** 프로젝트 리드 + integrator
> **대상 독자:** planner / builder / integrator (3인 하네스), Codex CLI 재현 시 동일 문서 사용
>
> **버전 상태 및 폐기 선언:**
>
> | 버전 | 상태 | 경로 | 비고 |
> |------|------|------|------|
> | v1 | ❌ 폐기 (2026-04-14) | `docs/_archive/2026-04-pivot/99-integration-plan.md`의 §0 | "RAG 하이브리드 단일 파이프라인" 가정 |
> | v2 | ❌ 폐기 (2026-04-15) | `docs/_archive/2026-04-pivot/99-integration-plan.md` | Phase-7A+7B+8 분할, 여전히 raw-chunk-first |
> | v3 | ❌ 폐기 (2026-04-15) | `docs/_archive/2026-04-pivot/2026-04-15-phase7b.md` | 실행 세부화했으나 전제 동일 |
> | **v4** | 🟡 draft (이 문서) | `docs/analysis/99-integration-plan-v4.md` | **Karpathy-first**. Git+LLM 위키가 본체, 검색은 보조 |
>
> v1/v2/v3는 모두 "hybrid RAG + 위키 스킨" 전제를 공유했다. 2026-04-15 피벗으로 전면 폐기된다. v4는 **compiled wiki**를 본체로 재정의한다.
>
> **관련 문서 크로스링크:**
> - 상위 규약: [`WIKI-AGENTS.md`](../../WIKI-AGENTS.md) — 지식 하네스 (이 문서가 "스키마", v4가 "실행")
> - 코드 하네스: [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md)
> - 참고 분석: [`01-graphify.md`](01-graphify.md), [`02-llm_wiki.md`](02-llm_wiki.md), [`03-llm-wiki-agent.md`](03-llm-wiki-agent.md)
> - MindVault 실패 사례: `docs/_archive/2026-04-pivot/04-mindvault.md` (아카이브)
> - 규모 확장 후보: [`05-qmd.md`](05-qmd.md) (Phase-W4 이후 도입 검토)

---

## 0. 메타

### 0.1 이 문서의 역할

`WIKI-AGENTS.md`는 **지식 레이어 규약(스키마)** 이다. 이 v4 계획서는 그 규약을 **실행 가능한 스프린트·작업·게이트·롤백**으로 번역한다. 상호 배타가 아닌 **쌍**이며, 중복되는 내용(예: 3-레이어 모델, 4 오퍼레이션 정의, frontmatter 필드)은 **링크로 참조**하고 복붙하지 않는다.

- **규약 변경** → `WIKI-AGENTS.md` 직접 수정 + 이 문서 §10 변경 이력 업데이트
- **실행 계획 변경** → 이 문서 직접 수정 + 상위 규약 불변

### 0.2 어디서부터 읽어야 하나

| 독자 | 먼저 읽을 섹션 |
|------|---------------|
| 프로젝트 리드 (승인권자) | §1, §2, §3, §9 |
| planner | §4 전체, §5, §7 |
| builder | §4 세부 작업, §8 (레거시 처리) |
| integrator | §5, §6, §7, §9 |
| Codex CLI 사용자 | §0, §4, §8 (+`AGENTS.md`) |

### 0.3 승인 체크리스트

이 문서는 다음이 모두 확인되어야 `active`로 전환된다.

- [ ] `WIKI-AGENTS.md` v1 초안 병합 완료
- [ ] `docs/_archive/2026-04-pivot/` 이동 완료 (v1/v2/v3)
- [ ] 이 문서의 §4 스프린트 상세 검토 (planner 1명 + integrator 1명)
- [ ] §5 게이트 목록이 CI/훅에서 구현 가능한지 확인
- [ ] §7 롤백 매트릭스가 모든 Feature Flag를 커버하는지 확인
- [ ] 위험 §6의 완화 전략이 실제로 실행 가능한지 confirm

---

## 1. 피벗 배경

### 1.1 MindVault 공식 폐기 (2026-04-14)

2026-04-14 자로 MindVault 프로젝트는 Jarvis 컨텍스트에서 **공식 폐기**되었다. `docs/_archive/2026-04-pivot/04-mindvault.md`에 분석이 보존된다. 폐기 사유 3가지:

1. **검색 최적화 함정.** MindVault는 "수천 페이지에서 정답 페이지를 빨리 찾는" 문제를 풀려 했지만, 실제 병목은 **페이지가 누적되지 않는 것**이었다. 한 번 ingest할 때 신규 페이지 1장만 만들고 끝나 기존 페이지들과의 상호 참조가 빠짐. MindVault는 결국 "파일시스템 + 검색"이었지 "지식 컴파일러"가 아니었다.
2. **한국어 동의어 매칭 부재.** "마인드볼트" ≠ "MindVault" 함정을 해결하지 못함. alias 시스템 + trigram이 없었다.
3. **사람/AI 동시 편집 경계 부재.** 사람이 수정한 페이지를 다음 ingest가 덮어쓰는 사고가 반복. auto/manual 분리 설계 부재.

**결론:** MindVault는 "DB-backed wiki skin"이었다. Jarvis가 같은 함정에 빠지지 않으려면 **Git을 진실 원천(SSoT)** 으로 삼고, **한 번의 ingest로 다수 페이지 동시 갱신**을 강제해야 한다.

### 1.2 외부 LLM 정합성 평가 8.5/10

2026-04-15 외부 LLM(GPT-5.4 + Claude Opus) 교차 리뷰 결과, Karpathy 철학을 Jarvis 엔터프라이즈 환경에 적용한 `WIKI-AGENTS.md` 초안은 **8.5/10** 정합성을 받았다. 감점 1.5의 주된 이유:

- 단일 사용자 가정 → 멀티테넌트(workspace당 git repo) 확장 필요 ✅ (반영 완료)
- 파일시스템 기반 → DB 미러가 필요 (색인·감사·권한 게이트) ✅ (반영 완료)
- LLM 다중 페이지 동시 생성 시 프롬프트 안정성 미검증 (→ Phase-W2에서 실측 예정)

`WIKI-AGENTS.md` §11(회귀 방지 체크리스트)이 이 평가의 요약본이다.

### 1.3 핵심 철학 전환

| 축 | 이전 (v1/v2/v3) | 이후 (v4, Karpathy-first) |
|----|----------------|--------------------------|
| **본체** | Hybrid search pipeline (BM25 + vector + RRF) | **Compiled wiki pages** (Git + 마크다운) |
| **쿼리 대상** | raw chunks (document_chunks) | wiki pages (page-first navigation) |
| **ingest 결과** | 새 `document_chunks` row N개 | 새 wiki page N개 **+ 기존 페이지 N개 갱신** (한 번에) |
| **LLM 역할** | 답변 합성 + 요약 보조 | **지식 컴파일러** (읽기/쓰기의 주체) |
| **SSoT** | PostgreSQL | **디스크/Git** (DB는 projection) |
| **5000명 확장** | 벡터 인덱스 샤딩 | workspace당 독립 git repo + single-writer 큐 |
| **관측의 핵심** | Recall@10 | **페이지 누적률 + commit 무결성 + 페이지당 피드백** |

**한 문장 요약:** "검색이 잘 되는 시스템"에서 "지식이 **컴파일되는** 시스템"으로.

---

## 2. 현황 진단 (AS-IS)

### 2.1 현재 Jarvis가 "hybrid-search-first"인 증거

코드·스키마·프롬프트·테스트 모두 RAG 파이프라인을 1급 시민으로 전제하고 있다. 다음이 증거다:

| 증거 | 경로 | 설명 |
|------|------|------|
| 6-레인 ask.ts | `packages/ai/ask.ts` | `retrieveRelevantClaims` + `retrieveChunkHybrid` + `rrfMerge` + `assembleContext`. 청크가 1급 답변 소스 |
| `document_chunks` 테이블 | `packages/db/schema/document-chunks.ts` | Phase-7A에서 생성. pgvector cosine + IVFFlat. 이 테이블이 답변의 근거 |
| RRF 유틸 | `packages/ai/rrf.ts` | 서로 다른 검색 결과 병합. raw chunk 공간 전제 |
| Chunking 파이프라인 | `apps/worker/src/lib/text-chunker.ts` | `chunkText(text, 300, 50)` — 단어 300개 window로 raw 문서를 분해 |
| Phase-7B 테스트 | `packages/ai/__tests__/rrf.test.ts`, `__tests__/retrieve-chunk-hybrid.test.ts` | 전부 raw chunk retrieval 기준 |
| feature flags | `FEATURE_TWO_STEP_INGEST`, `FEATURE_HYBRID_SEARCH_MVP`, `FEATURE_DOCUMENT_CHUNKS_WRITE` | 이름부터 "chunk·hybrid·search"가 1급 |

### 2.2 실측 기반 "RAG 85% / Wiki 15%" 상태 수치

2026-04-15 계측 결과:

| 지표 | 값 | 해석 |
|------|-----|------|
| `document_chunks` row 수 | ~42,000 | raw chunk 공간이 거의 전부 |
| `knowledge_page` row 수 (authority='generated') | ~180 | LLM이 생성한 "페이지"는 극소수 |
| `knowledge_page.mdxContent` 평균 길이 | 1,200자 | 실질 위키 페이지라 보기엔 짧음 |
| `[[wikilink]]` 사용 비율 | 거의 0 | 교차 참조 없음 |
| Ask AI 답변에 인용된 소스 분포 | 97% chunks / 3% pages | **페이지는 사실상 dead weight** |
| 주 1회 신규 page 생성율 | ~12 | 월 50개 수준 (누적 효과 미약) |

**결론:** 현재 Jarvis는 이름만 "사내 위키"이지 실제로는 **raw-chunk RAG 포털**이다. "RAG 85% / Wiki 15%" 수치가 이 상태를 압축한다.

### 2.3 남겨야 할 것 vs 비활성화할 것

| 자산 | 평가 | v4에서의 처리 |
|------|------|---------------|
| `llm_call_log` 테이블 + 비용 대시보드 | ✅ 유효 | 그대로 승계 (Phase-W1 관측 배선 재활용) |
| PII redactor (`packages/shared/pii/`) | ✅ 유효 | 그대로 승계 (ingest Step 0에 재배치) |
| `review_queue` 테이블 + UI | ✅ 유효 (재사용) | `kind` 확장: `contradiction`, `sensitivity_promotion`, `wiki_lint`, `wiki_heal` |
| `workspace` 테이블 + 멀티테넌시 모델 | ✅ 유효 | git repo가 workspace당 1개로 매핑됨 |
| `knowledge_page` 테이블 | ⚠️ 용도 변경 | `mdxContent`는 캐시 강등, 본문 SSoT는 디스크로. 스키마는 `wiki_page_index`로 rename 고려 (Phase-W3) |
| `document_chunks` 테이블 | ❌ 비활성화 | `FEATURE_RAW_CHUNK_QUERY=false`로 읽기 경로 차단. 쓰기는 Phase-W2 말에 중단 |
| `retrieveChunkHybrid`, `rrfMerge` | ❌ 비활성화 | `if (!FEATURE_PAGE_FIRST_QUERY)` 분기로 감싸 유지 후 2 릴리스 후 제거 |
| `retrieveRelevantClaims` | ⚠️ 용도 축소 | 페이지 navigator 대체 경로로 유지 가능. 실측 후 결정 |
| `apps/worker/src/jobs/ingest.ts` Phase-7B 경로 | ❌ 재작성 | Two-Step CoT **with multi-page update**로 전면 교체 (기존 경로는 flag off로 중단) |
| Graphify 통합 (graphify-build.ts) | ✅ 유효 (경계 강화) | `wiki/auto/derived/code/**` 격리 영역으로만 쓴다 |
| `search_log` 테이블 | ⚠️ 의미 변경 | raw chunk search 로그 → wiki page navigation 로그로 의미 재정의. 컬럼은 유지 |

---

## 3. 목표 (TO-BE)

### 3.1 3-레이어

`WIKI-AGENTS.md §1` 참조. 요약:

- **Raw** (MinIO + DB 메타) — 불변, LLM 읽기 전용
- **Wiki** (disk + git) — LLM auto 편집 + 사람 manual 편집 (분리)
- **Schema** (코드) — `WIKI-AGENTS.md` 자체 + `.claude/commands/wiki-*.md`

### 3.2 4 오퍼레이션

`WIKI-AGENTS.md §3` 참조. 요약:

1. **Ingest** — raw → 다수 page 동시 갱신 (Two-Step CoT + single-writer commit)
2. **Query** — page-first navigation (raw chunk 검색 폐기)
3. **Lint** — 주 1회 crown (orphan / broken / contradictions / stale)
4. **Graph** — Graphify 통합 (격리된 `wiki/auto/derived/code/**`만)

### 3.3 Git 단일 진실원천 + DB projection

| 층 | 역할 |
|---|------|
| **디스크** (`wiki/{workspaceId}/**/*.md`) | **본문 SSoT**. LLM/사람이 읽고 쓰는 실체 |
| **git** (`wiki/{workspaceId}/.git/`) | 버전/감사 |
| **DB** (`wiki_page_index`, `wiki_page_link`, `wiki_commit_log`, 기타) | **색인·권한·감사·메타 projection**. 본문 재구성은 디스크에서 |
| **캐시** (PG `embed_cache` + in-memory) | 옵션. 본문 요약·토큰 카운트 등 재계산 가능한 파생물 |

**불변량:** DB `wiki_page_index.gitSha == git show HEAD:{path}`. 어긋나면 G8 게이트 위반.

### 3.4 Auto vs Manual 경계

`WIKI-AGENTS.md §4` 참조. 실행 관점에서는:

- **builder에게의 계약:** `wiki/auto/**`는 LLM만 편집. `wiki/manual/**`는 사람만 편집. ingest 파이프라인은 manual을 Read-only로 취급.
- **CI 게이트 (G9):** `wiki/auto/**` 경로의 사람 커밋을 차단. 자동 CI 정책으로 강제.
- **UI 수준:** 웹 에디터에서 manual 오버라이드 버튼은 `manual/overrides/` 경로에만 쓰도록 고정.

### 3.5 Single-writer + append log

`WIKI-AGENTS.md §5` 참조. 실행 관점에서는:

- **workspace당 pg-boss singleton queue** (`concurrency: 1`)
- **ingest worker는 temp worktree에서 patch 생성 → validate → main fast-forward**
- **log.md는 append-only**; squash 금지
- **merge commit 금지**; 실패 시 ingest_dlq로

---

## 4. 스프린트 상세

### 총 개요

| 스프린트 | 기간 | 목적 | 작업 수 | 게이트 |
|----------|------|------|---------|--------|
| **Phase-W0** | 반일 | **Bootstrap — `docs/canonical/` 시드 import** | 1 (T0) | — (W0은 게이트 없이 W1에 흡수) |
| Phase-W1 | 5일 | 골격 구축 (인프라) | 6 (T1~T6, 게이트 확인 포함) | W1 게이트 |
| Phase-W2 | 5일 | 오퍼레이션 구현 (기능) | 6 (T1~T6, 게이트 확인 포함) | W2 게이트 |
| Phase-W3 | 3일 | 경계/격리/비활성화 | 6 (T1~T6, 게이트 확인 포함) | W3 게이트 |
| Phase-W4 | 가변 | 확장·정리 (안정화 후) | 4 (T1~T4) | W4 게이트 (도입 결정 게이트) |

### 4.0 Phase-W0 (반일) — Bootstrap import

**목표:** Two-Step CoT ingest가 동작하려면 "기존 관련 페이지 10~15개"가 존재해야 한다. 레포 최초 실행 시 이 조건이 없으므로 **1회 시드 import**로 초기 위키를 구축한다.

**배경 (Critic #4 반영):** MindVault 함정의 핵심은 "1 소스 → 1 페이지" 고착. Jarvis는 `updatePages: []`가 비어있지 않아야 하는데, 초기엔 기존 페이지가 없음 → 첫 ingest가 전부 newPages로 빠져나감 → "다수 페이지 교차 갱신" KPI를 영원히 채우지 못하는 **콜드스타트 함정**.

#### W0-T0: `docs/canonical/` 시드 → `wiki/{defaultWorkspaceId}/auto/**` 초기 import

- **스크립트:** `apps/worker/src/jobs/wiki-bootstrap.ts` + CLI `pnpm wiki:bootstrap`
- **파일 대상:** `docs/canonical/` 95개 마크다운 (ISU 가이드북 정규화본)
- **예외 적용:** 이 1회에 한해 **"1 소스 → 1 페이지" 허용** (다중 페이지 갱신 요구 면제). frontmatter·aliases·linkedPages는 **LLM이 생성**해야 함 (그래야 이후 ingest가 `wikilink` 탐색 가능).
- **DoD:**
  - [ ] 95개 페이지가 `wiki/{defaultWorkspaceId}/auto/concepts/` 또는 `auto/sources/`에 생성
  - [ ] `index.md` + `log.md` 최초 커밋 생성
  - [ ] 각 페이지 frontmatter의 `aliases` 평균 3개 이상
  - [ ] `wiki_page_index` projection에 95건 동기화
  - [ ] **이후 W1 이상의 ingest는 `--bootstrap` 플래그 없으면 multi-page update 강제**
- **리스크:**
  - **R-W0T0-1**: LLM이 aliases를 빈 배열로 반환 → ingest_dlq (fallback: title에서 trigram 3-gram 자동 추출을 fallback으로 둠)
- **담당:** builder
- **예상:** 반일 (LLM 호출 95 × $0.02 ≈ $2)
- **롤백:** `wiki/{defaultWorkspaceId}/` 전체 삭제 + `wiki_page_index` truncate. 외부 영향 없음 (Phase-W1 착수 전 단독 실행).

### 4.1 Phase-W1 (Sprint 1, 5일) — 골격 구축

**목표:** 디스크 Git 모드가 동작하도록 인프라를 깐다. 이 단계에선 기존 RAG 경로를 **건드리지 않는다**. 모두 feature flag 뒤.

#### W1-T1: `packages/wiki-fs/` 생성

- **파일:**
  - `packages/wiki-fs/src/writer.ts` — 디스크 write + fsync + atomic rename
  - `packages/wiki-fs/src/frontmatter.ts` — YAML frontmatter parser/serializer (round-trip 보장)
  - `packages/wiki-fs/src/wikilink.ts` — `[[wikilink]]` parser + renderer + resolver
  - `packages/wiki-fs/src/git.ts` — simple-git 래퍼: `createRepo()`, `readBlob()`, `writeAndCommit()`, `headSha()`
  - `packages/wiki-fs/src/worktree.ts` — temp worktree create/cleanup
  - `packages/wiki-fs/src/__tests__/*.test.ts` — 각 모듈별 단위 테스트
- **외부 의존:** `simple-git@^3`, `gray-matter@^4`, `remark-wiki-link@^1` (또는 자체 구현), `yaml@^2`
- **DoD:**
  - [ ] frontmatter round-trip 테스트 20건 통과 (기본 필드 + aliases + linkedPages + sensitivity)
  - [ ] `[[wikilink]]` 파서 단위 테스트 통과: `[[page]]`, `[[page|별칭]]`, `[[folder/page#anchor]]` 3형식
  - [ ] temp worktree에서 commit 1건 생성 + `headSha()`로 확인 가능
  - [ ] Windows/Linux 양쪽에서 `simple-git` child process 정상 동작 (CI matrix)
- **리스크:**
  - **R-W1T1-1**: Windows 환경에서 git child process 경로·권한 이슈 → `simple-git`의 `binary` 옵션으로 명시적 git 경로 지정 + CI matrix 검증
  - **R-W1T1-2**: frontmatter serializer가 한국어 문자열에서 따옴표/이스케이프 깨짐 → `yaml@^2`의 `defaultKeyType: 'PLAIN'` 옵션 + 테스트 케이스
- **담당:** builder
- **예상:** 2일
- **롤백:** 패키지 전체 삭제 + `pnpm-workspace.yaml`에서 제외. 외부 영향 없음.

#### W1-T2: `packages/wiki-agent/prompts/` — Analysis/Generation 프롬프트 포팅

- **파일:**
  - `packages/wiki-agent/prompts/analyze.ts` — Step A 프롬프트 (페이지 후보 + 변경 계획 JSON)
  - `packages/wiki-agent/prompts/generate.ts` — Step B 프롬프트 (실제 mdxContent + wikilink 삽입)
  - `packages/wiki-agent/prompts/lint.ts` — orphan/contradictions 프롬프트
  - `packages/wiki-agent/prompts/schemas.ts` — Zod 스키마 (IngestResult, LintReport)
  - `packages/wiki-agent/prompts/__tests__/schema.test.ts`
- **외부 의존:** `zod@^3`, 기존 `@jarvis/ai`
- **참고 원본:**
  - `reference_only/llm_wiki/src/llm/ingest.ts` — 2-pass CoT 프롬프트 원본
  - `reference_only/llm-wiki-agent/tools/ingest.py:141-157` — JSON 스키마 계약
  - `docs/analysis/02-llm_wiki.md` §3 (구현 세부)
  - `docs/analysis/03-llm-wiki-agent.md` §2, §3 (프롬프트 구조)
- **DoD:**
  - [ ] IngestResult Zod 스키마: `{ newPages, updatePages, contradictions, linkSuggestions }` 모든 필드 100% 커버
  - [ ] 프롬프트에 `<user_content>...</user_content>` 래퍼 적용 (injection 방어)
  - [ ] `PROMPT_VERSION` 상수 + `llm_cache` key 구성에 반영되는지 확인
  - [ ] 1건 이상 실샘플 ingest에서 스키마 검증 통과 (수동)
- **리스크:**
  - **R-W1T2-1**: llm_wiki 원본이 영어 기반이라 한국어 문서에 그대로 붙이면 품질 저하 → Phase-W2 시작 직후 한국어 샘플 5건으로 튜닝 체크포인트
  - **R-W1T2-2**: Zod 스키마가 과하게 엄격하면 LLM이 거의 항상 반려 → `strict: false` + 명확하지 않은 필드는 `.optional()`
- **담당:** builder (프롬프트 엔지니어링 경험자)
- **예상:** 1.5일
- **롤백:** 패키지 삭제. ingest.ts는 기존 경로 유지.

#### W1-T3: `.claude/commands/wiki-*.md` 4개 포팅

- **파일:**
  - `.claude/commands/wiki-ingest.md`
  - `.claude/commands/wiki-query.md`
  - `.claude/commands/wiki-lint.md`
  - `.claude/commands/wiki-graph.md`
- **원본 참고:** `reference_only/llm-wiki-agent/CLAUDE.md` (`docs/analysis/03-llm-wiki-agent.md` §4)
- **Jarvis 경로 적응:**
  - `raw/` → `wiki/{workspaceId}/auto/sources/` (input은 DB `raw_source` id)
  - `wiki/` → `wiki/{workspaceId}/auto/`
  - `tools/ingest.py` → `packages/wiki-agent/prompts/` 호출 (Node-only)
- **DoD:**
  - [ ] 4개 slash command 문법 검증 (`.claude/commands/` 형식 준수)
  - [ ] Jarvis planner/builder/integrator에서 호출 가능 (dry-run)
  - [ ] 인자 체계: `/wiki-ingest {raw_source_id}`, `/wiki-query {question}`, `/wiki-lint`, `/wiki-graph {workspaceId}`
- **리스크:**
  - **R-W1T3-1**: slash command가 Python CLI를 가정하면 포팅 누락 발생 → Node-only 선언 명시 (`WIKI-AGENTS.md §9` 참조)
- **담당:** builder
- **예상:** 0.5일
- **롤백:** `.claude/commands/wiki-*.md` 파일 삭제. 기존 커맨드 유지.

#### W1-T4: projection DB migration — `wiki_page_index` 외

- **파일:**
  - `packages/db/schema/wiki-page-index.ts`
  - `packages/db/schema/wiki-page-link.ts`
  - `packages/db/schema/wiki-page-source-ref.ts`
  - `packages/db/schema/wiki-commit-log.ts`
  - `packages/db/schema/wiki-review-queue.ts` (기존 `review_queue` 확장 or 신규)
  - `packages/db/schema/wiki-lint-report.ts`
  - `packages/db/migrations/NNNN_wiki_projection.sql`
- **스키마 요약** (`WIKI-AGENTS.md §7` 참조):
  - `wiki_page_index` — path + title + frontmatter JSON + workspaceId + sensitivity + gitSha + updatedAt (본문은 없음)
  - `wiki_page_link` — srcPath, dstPath, type ('wikilink' | 'backref'), workspaceId
  - `wiki_commit_log` — commitSha, author, operation, affectedPages[], reasoning, timestamp
- **DoD:**
  - [ ] 모든 테이블 `workspaceId UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE`
  - [ ] sensitivity 필드는 `varchar(30) UPPERCASE` (Jarvis 컨벤션)
  - [ ] `CREATE INDEX CONCURRENTLY` (zero-downtime) 사용
  - [ ] drizzle `pnpm db:generate` 후 schema drift 훅 통과
- **리스크:**
  - **R-W1T4-1**: 기존 `knowledge_page` 테이블과의 충돌 → 당분간 공존. Phase-W3 말에 rename 마이그레이션 검토
  - **R-W1T4-2**: gitSha가 40자 고정이라 인덱스 크기 폭증 → `varchar(40)` + btree 인덱스, PG가 잘 처리
- **담당:** builder + integrator (schema review)
- **예상:** 1일
- **롤백:** down migration 준비. 새 테이블만 DROP, 기존 데이터 무손실.

#### W1-T5: 관측 배선 (승계)

- **파일:**
  - `packages/ai/cached-call.ts` — 기존 wrapper 재사용 + `wiki_*` op 타입 추가
  - `packages/logger/src/index.ts` — 기존 pino 설정 재사용
  - `apps/web/app/(admin)/observability/cost/page.tsx` — 기존 대시보드에 wiki 섹션 추가
- **신규 로그 op 타입:**
  - `wiki.ingest.analyze`, `wiki.ingest.generate`
  - `wiki.query.shortlist`, `wiki.query.synthesize`
  - `wiki.lint.semantic`
  - `wiki.git.commit`, `wiki.git.conflict`
- **DoD:**
  - [ ] `llm_call_log`에 wiki op 1건 이상 기록됨 (테스트 ingest로 검증)
  - [ ] `/admin/cost`에서 wiki op별 비용 / 캐시 적중률 / fallback 발생률 가시
  - [ ] Sentry에 wiki.* breadcrumb 태그 추가
- **리스크:**
  - **R-W1T5-1**: 관측 배선이 빠지면 W2 이후 디버깅 불가 → W1에 반드시 완료
- **담당:** integrator
- **예상:** 0.5일
- **롤백:** 로그 op 태그만 추가 상태라 rollback 불필요. 기존 대시보드 유지.

#### W1-T6: W1 게이트 통과 확인

- **파일:** `docs/plan/2026-04-W1-gate.md` (게이트 체크리스트 + 통과 증거)
- **DoD:**
  - [ ] 아래 모든 항목 체크 (§5 게이트 정의 참조)
- **W1 게이트 체크리스트:**
  - [ ] `packages/wiki-fs/` 단위 테스트 ≥ 20건 green
  - [ ] `packages/wiki-agent/prompts/` Zod 스키마 테스트 green
  - [ ] `.claude/commands/wiki-*.md` 4개 존재 + 문법 검증
  - [ ] `wiki_page_index`, `wiki_page_link`, `wiki_commit_log`, `wiki_page_source_ref`, `wiki_lint_report` 테이블 migration 통과
  - [ ] 1건 end-to-end 테스트: 수동으로 raw_source → ingest (dry-run) → wiki page 생성 → git commit → DB projection 확인
  - [ ] `FEATURE_WIKI_FS_MODE=true` 로 1건 샘플 동작
  - [ ] 관측 대시보드 wiki 섹션 가시
  - [ ] schema drift 훅 clean
- **담당:** integrator
- **예상:** 0.5일

**Phase-W1 총 예상:** 6일 (5일 목표 + 0.5d 버퍼 + W1-T6 0.5d). 필요 시 W1-T5를 W2 초반으로 넘김.

### 4.2 Phase-W2 (Sprint 2, 5일) — 오퍼레이션 구현

**목표:** 실제 4 오퍼레이션을 구현한다. 여전히 feature flag 뒤. 레거시 RAG는 계속 동작.

#### W2-T1: `ingest.ts` Two-Step CoT 재작성 (multi-page update 포함)

- **파일:**
  - `apps/worker/src/jobs/ingest.ts` — `FEATURE_TWO_STEP_INGEST` 분기 안에 신규 경로 작성
  - `apps/worker/src/jobs/ingest/analyze.ts` — Step A
  - `apps/worker/src/jobs/ingest/generate.ts` — Step B
  - `apps/worker/src/jobs/ingest/write-and-commit.ts` — Step C
  - `apps/worker/src/jobs/ingest/review-queue.ts` — Step D
  - `apps/worker/src/__tests__/integration/ingest-two-step.test.ts` — 통합 테스트
- **파이프라인** (`WIKI-AGENTS.md §3.1` 참조):
  ```
  Step 0: redactPII (기존 승계)
  Step A: Analysis LLM — 관련 페이지 후보 10~15개 Read + JSON(newPages/updatePages/contradictions/linkSuggestions)
  Step B: Generation LLM — 각 페이지의 mdxContent 완성 + [[wikilink]] + frontmatter
  Step C: Write & Commit — temp worktree → validate → fast-forward merge + log.md append + DB projection sync
  Step D: Review queue — contradictions / sensitivity 상승 / PII → review_queue
  ```
- **DoD:**
  - [ ] 1건 ingest로 ≥ 8 page update (신규 + 갱신 합산, 5건 이상이 갱신) — **multi-page가 핵심**
  - [ ] validate 실패 시 commit 안 함 + `ingest_dlq` INSERT
  - [ ] temp worktree cleanup 보장 (finally 블록)
  - [ ] 고정 10건 fixture로 pageUpdates 측정: 중앙값 ≥ 8 AND 10건 중 8건 이상이 threshold 통과 (평균 기준 금지)
- **리스크:**
  - **R-W2T1-1**: LLM이 다중 페이지 동시 생성 시 프롬프트 일관성 무너짐 (페이지 A·B 같은 주제 중복 작성) → Step B 직후 **지역 validate**: 같은 title 중복 감지 시 review_queue로
  - **R-W2T1-2**: 1건 ingest가 토큰 한도 초과 → Step A에서 후보 페이지 수 동적 제한 (`maxCandidates = min(15, budget/avgPageTokens)`)
  - **R-W2T1-3**: temp worktree가 동시 ingest로 충돌 → `worktree name = ingest-{runId}` 유니크
- **담당:** builder
- **예상:** 2일
- **롤백:** `FEATURE_TWO_STEP_INGEST=false` → 기존 ingest 경로. 코드 경로 전환만.

#### W2-T2: `ask.ts` page-first navigation 분기 (`FEATURE_PAGE_FIRST_QUERY`)

- **파일:**
  - `packages/ai/ask.ts` — `if (FEATURE_PAGE_FIRST_QUERY) { pageFirstAsk() } else { legacyChunkAsk() }`
  - `packages/ai/page-first/shortlist.ts` — `wiki_page_index` lexical shortlist (title/alias/tags ILIKE + pg_trgm)
  - `packages/ai/page-first/expand.ts` — 1-hop wikilink 확장 (`wiki_page_link`)
  - `packages/ai/page-first/read-pages.ts` — 디스크에서 실제 페이지 Read (top 5~8)
  - `packages/ai/page-first/synthesize.ts` — LLM 답변 합성 + `[[wikilink]]` 인용
  - `packages/ai/__tests__/page-first.test.ts`
- **파이프라인** (`WIKI-AGENTS.md §3.2` 참조):
  ```
  1. wiki/{workspaceId}/index.md 로드 (요약)
  2. lexical shortlist (top-20)
  3. 1-hop wikilink 확장
  4. 권한 + sensitivity 필터
  5. top 5~8 페이지 실제 Read (디스크 fs)
  6. LLM 답변 합성 (gpt-5.4) + citation
  7. "Save as Page" 버튼 노출 (응답 메타데이터에 포함)
  ```
- **DoD:**
  - [ ] 10개 샘플 질문으로 page-first recall@5 측정 (목표 ≥ 70% — W2 통과 기준)
  - [ ] 답변 citation이 `[[page-slug]]` 형식으로 frontend에 전달됨
  - [ ] 권한 필터가 동작 (sensitivity=SECRET인 페이지는 `requiredPermission` 없는 유저에게 숨김)
  - [ ] 통합 테스트 green
- **리스크:**
  - **R-W2T2-1**: pg_trgm 한국어 매칭 품질이 낮음 ("마인드볼트" ≠ "MindVault") → Phase-W2 중 bigram column 또는 pg_bigm 설치 결정
  - **R-W2T2-2**: 1-hop 확장이 거대 hub page에서 폭발 → `fanOut <= 30` 제한 + freshness 우선
  - **R-W2T2-3**: 디스크 Read가 병목 → in-memory LRU cache (`packages/wiki-fs/src/cache.ts`, W2-T5로 분리 가능)
- **담당:** builder
- **예상:** 1.5일
- **롤백:** `FEATURE_PAGE_FIRST_QUERY=false` → 기존 `retrieveChunkHybrid` 경로. 코드 전환만.

#### W2-T3: single-writer 큐 (pg-boss workspace-scoped singleton)

- **파일:**
  - `apps/worker/src/queues/wiki-writer.ts` — pg-boss `singletonKey: workspaceId`
  - `apps/worker/src/queues/wiki-writer-contract.ts` — Job 타입 정의
  - `apps/worker/src/__tests__/integration/single-writer.test.ts` — 동시 10건 → 순차 처리 검증
- **DoD:**
  - [ ] 동일 workspace에 10건 concurrent enqueue → 순차 처리 (동시 실행 0건)
  - [ ] 다른 workspace는 병렬 처리 가능
  - [ ] 실패 3회 → `ingest_dlq` 자동 이동
  - [ ] Exponential backoff 10s / 60s / 600s
- **리스크:**
  - **R-W2T3-1**: pg-boss singletonKey가 예약 시점 기준이라 장시간 처리 중 대기 큐 폭증 → 모니터링 대시보드에 큐 길이 추가
  - **R-W2T3-2**: 단일 writer 병목으로 5000명 × 동시 ingest 느려짐 → W3-T5 모니터링 + Phase-W4-T1에서 partition by sub-workspace 고려
- **담당:** builder
- **예상:** 1일
- **롤백:** `FEATURE_WIKI_SINGLE_WRITER=false` → 기존 concurrency pg-boss 설정.

#### W2-T4: `wiki-lint` 크론 잡

- **파일:**
  - `apps/worker/src/jobs/wiki-lint.ts` — 주 1회 크론 (일요일 03:00 KST)
  - `apps/worker/src/jobs/wiki-lint/orphans.ts` — 인바운드 링크 0인 페이지
  - `apps/worker/src/jobs/wiki-lint/broken-links.ts` — `[[target]]`이 실존 안 함
  - `apps/worker/src/jobs/wiki-lint/contradictions.ts` — 주제 동일 + 주장 상충 (LLM semantic)
  - `apps/worker/src/jobs/wiki-lint/stale-claims.ts` — 최신 소스에 의해 대체된 낡은 주장
  - `apps/worker/src/jobs/wiki-lint/missing-cross-refs.ts` — 링크 누락 제안
- **출력:**
  - `wiki/{workspaceId}/_system/lint-report-{YYYY-MM-DD}.md` (auto 커밋, LLM 편집)
  - `wiki_review_queue(kind='lint')` — 관리자 승인 대기
- **DoD:**
  - [ ] 5개 체크 항목 모두 동작
  - [ ] contradictions LLM 호출에 `gpt-5.4-mini` + fallback ladder 적용
  - [ ] 결과가 `wiki_review_queue`에만 들어가고, **`wiki/auto/**`에 직접 쓰지 않음** (관리자 승인 후)
  - [ ] Phase-6 drift detection과 공존 (같은 UI 탭, 다른 소스)
- **리스크:**
  - **R-W2T4-1**: 5000명 환경에서 lint 1회가 1시간 초과 → workspace 단위 분할, 병렬 도우 개수 cap
  - **R-W2T4-2**: contradictions false positive 폭발 → confidence threshold 기본 0.7 + 수동 튜닝 가능
- **담당:** builder
- **예상:** 1.5일
- **롤백:** `FEATURE_WIKI_LINT_CRON=false` → 크론 비활성화. 기존 drift detection은 계속 동작.

#### W2-T5: "Save as Page" 경로

- **파일:**
  - `apps/web/components/ask/save-as-page.tsx` — 답변 아래 버튼
  - `apps/web/app/api/wiki/save-as-page/route.ts` — POST 핸들러
  - `apps/worker/src/jobs/wiki-save-synthesis.ts` — 비동기 저장 job (single-writer 큐 경유)
- **흐름:**
  ```
  1. Ask AI 답변 UI에 [Save as Page] 버튼
  2. 클릭 → 답변 내용 + 사용자 의도(`title`, `tags`) 입력 모달
  3. POST → single-writer 큐 enqueue
  4. worker가 `wiki/auto/syntheses/{slug}.md` 작성 + git commit + DB projection
  5. UI에 "저장됨: [[slug]]" 링크 노출
  ```
- **DoD:**
  - [ ] 1건 save → 2분 내 `wiki/auto/syntheses/`에 파일 + commit 확인
  - [ ] 권한 확인: 저장하려는 sensitivity를 현재 user가 쓸 수 있는지 검증
  - [ ] "Save as Page"는 auto/syntheses에만 쓰고, auto/entities·concepts엔 쓰지 않음 (경계)
- **리스크:**
  - **R-W2T5-1**: 저장 시 기존 syntheses와 중복 → title similarity 체크, 중복이면 "업데이트" 모드 제안
- **담당:** builder (frontend) + builder (backend)
- **예상:** 1일
- **롤백:** `FEATURE_SAVE_AS_PAGE=false` → UI에서 버튼 숨김.

#### W2-T6: W2 게이트 통과 확인

- **파일:** `docs/plan/2026-04-W2-gate.md`
- **W2 게이트 체크리스트:**
  - [ ] Two-Step CoT ingest로 고정 10건 fixture → 중앙값 pageUpdates ≥ 8 AND 10건 중 8건 이상 pass (KPI, 평균 대신 중앙값 + pass rate)
  - [ ] page-first recall@5 ≥ 70% (10개 샘플 질문 수동 측정)
  - [ ] single-writer 큐 동작 검증 (10건 concurrent → 순차)
  - [ ] wiki-lint 1회 실행 → review_queue에 결과 진입
  - [ ] "Save as Page" 1건 동작 확인
  - [ ] `wiki_commit_log`와 디스크 git log 일치 (10건 샘플, G8 초벌 검증)
  - [ ] 레거시 RAG 경로 여전히 동작 (회귀 없음)
- **담당:** integrator
- **예상:** 0.5일

**Phase-W2 총 예상:** 7.5일 (5일 목표 초과). 버퍼가 부족하면 W2-T4를 W3으로 이연.

### 4.3 Phase-W3 (Sprint 3, 3일) — 경계/격리/비활성화

**목표:** auto/manual 경계 강제, Graphify 격리, 레거시 RAG off, eval fixture 재구성.

#### W3-T1: auto/manual 경계 구현 + lint 규칙

- **파일:**
  - `.github/workflows/wiki-boundary-check.yml` — PR에서 `wiki/auto/**` 경로를 사람 author가 수정한 커밋 차단
  - `apps/worker/src/jobs/wiki-lint/boundary.ts` — manual 오버라이드와 연결되지 않은 auto 페이지 감지
  - `apps/web/app/(admin)/wiki/boundary-violations/page.tsx` — 위반 대시보드
- **규칙:**
  - LLM commit author = `jarvis-llm@{workspaceId}`
  - 사람 commit author = 실제 이메일
  - CI 스크립트: `git log --author=@{workspaceId} -- wiki/manual/**`가 non-empty면 실패 (LLM이 manual 건드림)
  - CI 스크립트: `git log --author=(not @{workspaceId}) -- wiki/auto/**`가 non-empty면 실패 (사람이 auto 건드림)
- **DoD:**
  - [ ] 의도적 위반 커밋으로 CI 실패 검증 (exit code ≠ 0)
  - [ ] 정상 커밋 10건에서 CI 성공
  - [ ] `wiki-lint` boundary 체크 동작 확인
- **리스크:**
  - **R-W3T1-1**: git author 위조 방지 → commit signing은 Phase-W4 (GPG) 이월. 지금은 server-side commit author 강제
- **담당:** integrator (CI) + builder (lint)
- **예상:** 0.5일
- **롤백:** CI workflow 비활성화. boundary 체크는 advisory로 낮춤.

#### W3-T2: Graphify `wiki/auto/derived/code/**` 격리

- **파일:**
  - `apps/worker/src/jobs/graphify-build.ts` — 기존 코드 수정 (출력 경로 `wiki/auto/derived/code/` 하드코딩)
  - `.github/workflows/graphify-boundary.yml` — Graphify 결과가 entity/concept에 쓰지 않는지 검증
- **규칙:**
  - Graphify 출력 경로: 오직 `wiki/auto/derived/code/**`
  - Graphify가 생성한 페이지는 frontmatter `type: derived`
  - `wiki/auto/entities/**`, `wiki/auto/concepts/**`는 LLM ingest만 쓸 수 있음
  - LLM ingest가 필요 시 Graphify 결과를 Read하고 entity 본문에 인용
- **DoD:**
  - [ ] Graphify 출력 1건 → `wiki/auto/derived/code/*.md` 경로 확인
  - [ ] Graphify가 entity 페이지 덮어쓰려는 시도 → CI 실패
  - [ ] LLM ingest가 Graphify 결과 Read 후 entity 페이지 합성 (1건 샘플)
- **리스크:**
  - **R-W3T2-1**: Graphify 바이너리의 하드코딩된 출력 경로가 충돌 → wrapper 스크립트로 경로 강제
- **담당:** builder
- **예상:** 0.5일
- **롤백:** `FEATURE_GRAPHIFY_DERIVED_PAGES=false` → Graphify 출력 비활성화.

#### W3-T3: `FEATURE_RAW_CHUNK_QUERY=false` 전환

- **파일:**
  - `.env.example` — flag 기본값 `false`로 변경
  - `packages/ai/ask.ts` — `if (FEATURE_RAW_CHUNK_QUERY === false) { throw new Error('raw chunk query disabled, use page-first') }`
  - `packages/ai/retrieve-chunk-hybrid.ts` — 함수 body에 `assertFeatureEnabled('FEATURE_RAW_CHUNK_QUERY')` 추가
  - `packages/ai/__tests__/retrieve-chunk-hybrid.test.ts` — skip 처리 (삭제는 Phase-W4)
  - `packages/ai/__tests__/rrf.test.ts` — skip 처리
- **DoD:**
  - [ ] 프로덕션 ENV에서 `FEATURE_RAW_CHUNK_QUERY=false` + `FEATURE_PAGE_FIRST_QUERY=true`
  - [ ] Ask AI 1건 호출 → page-first 경로만 사용 (로그 확인)
  - [ ] 24시간 모니터링 후 회귀 없음 확인
  - [ ] 실패 시 즉시 rollback 가능 (flag on 하나로)
- **리스크:**
  - **R-W3T3-1**: page-first recall이 아직 부족해 사용자 만족도 급락 → W2에서 recall@5 ≥ 70% 확보 전제
  - **R-W3T3-2**: legacy 코드 경로가 다른 기능(튜터 등)에서 사용 중 → grep으로 의존성 확인 후 전환
- **담당:** integrator
- **예상:** 0.5일
- **롤백:** flag 복귀.

#### W3-T4: eval fixture 재구성 (page QA 기준)

- **파일:**
  - `apps/worker/eval/fixtures/2026-04/page-qa.jsonl` — 30건 이상 큐레이션
  - `apps/worker/eval/runners/page-first-baseline.ts`
- **스키마:** `{ query, expectedPages: string[], answerPatterns: RegExp[], curator_user_id, reviewed_by_user_id }`
- **DoD:**
  - [ ] 30건 이상 큐레이션 완료 (curator ≠ reviewer)
  - [ ] runner가 page-first recall@5 자동 측정
  - [ ] baseline 수치 기록 (측정 리포트 MD)
- **리스크:**
  - **R-W3T4-1**: 기존 raw-chunk 기준 fixture는 답변이 **청크** 기반이라 페이지 단위로 재라벨링 필요 → 수작업 불가피
- **담당:** planner + integrator (큐레이션)
- **예상:** 1일
- **롤백:** 기존 fixture 유지 + 새 fixture 병행.

#### W3-T5: 운영 모니터링 대시보드

- **파일:**
  - `apps/web/app/(admin)/observability/wiki/page.tsx` — wiki 전용 대시보드
- **지표:**
  - 일별 ingest 건수, 평균 page 업데이트 수, 평균 commit 수
  - single-writer 큐 length (실시간) + p50/p95 대기시간
  - page-first query 수 + recall@5 샘플링
  - auto/manual 경계 위반 수
  - commit log 무결성 에러 (G8 위반)
  - Lint result summary (주간)
- **DoD:**
  - [ ] 대시보드 1회 열람 → 모든 패널 데이터 표시
  - [ ] 자동 새로고침 30s
  - [ ] admin role만 접근 가능
- **리스크:**
  - **R-W3T5-1**: 지표가 과다하면 오히려 혼란 → 3개 핵심 위젯(ingest 건수, recall, 무결성)을 최상단에 고정
- **담당:** builder (frontend)
- **예상:** 1일
- **롤백:** 페이지 경로 삭제. 기존 `/admin/cost` 대시보드는 유지.

#### W3-T6: W3 게이트 통과 확인

- **파일:** `docs/plan/2026-04-W3-gate.md`
- **W3 게이트 체크리스트:**
  - [ ] CI에서 auto/manual 경계 위반 차단 (의도적 위반 1건으로 검증)
  - [ ] Graphify 출력이 `wiki/auto/derived/code/**`로만 감 (1건 샘플)
  - [ ] `FEATURE_RAW_CHUNK_QUERY=false` 전환 + 24h 안정
  - [ ] page-first recall@5 ≥ 70% (30건 fixture)
  - [ ] 운영 대시보드 가시
  - [ ] auto/manual 경계 위반 주간 0건
- **담당:** integrator
- **예상:** 0.5일

**Phase-W3 총 예상:** 4일 (3일 목표 초과). W3-T4는 W2~W3에 병행 큐레이션.

### 4.4 Phase-W4 (안정화 후, 가변) — 확장·정리

**목표:** 페이지 수가 일정 규모를 넘으면 보조 검색 도입 + 레거시 RAG 완전 제거. 스프린트가 아닌 **체크포인트 기반 게이트**.

#### W4-T1: 페이지 500 돌파 감시 + qmd-MCP 도입 결정 게이트

- **파일:**
  - `apps/worker/src/jobs/wiki-scale-monitor.ts` — 주간 페이지 수 집계
  - `docs/plan/qmd-integration-decision.md` — 결정 리포트 템플릿
- **트리거:** 특정 workspace에서 `wiki_page_index.count` ≥ 500
- **결정 기준:**
  - page-first recall@5 < 70% 2주 연속 → qmd 도입
  - page-first p95 latency > 3s → qmd 도입
  - 둘 다 정상 → qmd 연기
- **qmd 통합 범위 (승인 시):** compiled wiki 위에만 qmd 인덱스, raw source 넘기지 않음. `docs/analysis/05-qmd.md` 참조.
- **DoD:**
  - [ ] 트리거 감시 동작 확인
  - [ ] 결정 리포트 승인 프로세스 문서화
- **담당:** planner (결정) + builder (실행, 승인 시)
- **예상:** 가변 (안정화 후)

#### W4-T2: 벡터/`document_chunks` DROP 마이그레이션

- **파일:** `packages/db/migrations/NNNN_drop_legacy_chunks.sql`
- **조건:**
  - Phase-W3 완료 후 2~3 릴리스 무회귀
  - `FEATURE_RAW_CHUNK_QUERY` 완전 off 상태 유지
  - `document_chunks`, `knowledge_claim.embedding`, `wiki_sources.body`(있다면), `wiki_concepts.body`(있다면) DROP
- **DoD:**
  - [ ] 모든 down migration 스크립트 준비 (재현 불가하면 금지)
  - [ ] 백업 스냅샷 1건 보존 (S3 amort.)
  - [ ] 스테이징 환경 1주 확인
  - [ ] 프로덕션 migration + 30분 모니터링
- **리스크:**
  - **R-W4T2-1**: **되돌림 불가**. 가장 마지막에 실행
- **담당:** integrator
- **예상:** 1일 (실행) + 1주 (모니터링)

#### W4-T3: 구 RAG 경로 코드 제거

- **파일:** `packages/ai/retrieve-chunk-hybrid.ts`, `packages/ai/rrf.ts`, 관련 테스트
- **조건:** W4-T2 완료 후
- **DoD:**
  - [ ] grep으로 `retrieveChunkHybrid`, `rrfMerge` 사용처 0건 확인
  - [ ] 파일 삭제 PR 1건
- **담당:** builder
- **예상:** 0.5일

#### W4-T4: Obsidian 연동 재검토 (원하면)

- **참고:** `docs/analysis/02-llm_wiki.md` §6 (Obsidian vault export)
- **결정 기준:** 사내 5000명 사용자 중 PKM 요구가 있는지 + 권한 모델과의 호환성
- **기본 결정:** 도입 보류 (웹 UI가 SSoT, Obsidian 연동은 디스크 read-only export 정도만 검토)
- **DoD:**
  - [ ] 결정 리포트 1건 (`docs/plan/obsidian-decision.md`)
- **담당:** planner
- **예상:** 가변

---

## 5. 게이트 체크포인트

### 5.1 게이트 총 10개 (계승 6 + 재정의 1 + 신규 3)

#### 계승 게이트 (Phase-7A에서 유효성 확인됨)

- **G1: LLM 비용 kill-switch** — `LLM_DAILY_BUDGET_USD` 초과 시 자동 차단. 구현: `packages/ai/budget-guard.ts`. 그대로 승계.
- **G2: PII redactor** — ingest Step 0에서 주민번호/전화/이메일/카드/계좌 마스킹 + 자동 sensitivity 승급. 그대로 승계.
- **G3: review_queue** — `kind` 확장으로 wiki 전환 대응 (contradiction, lint, heal, sensitivity_promotion, boundary_violation, synonym_conflict). 그대로 승계 + kind 추가.
- **G4: cross-workspace leakage** — 모든 쿼리에 `workspaceId` 강제 주입. page-first에서도 동일하게 `wiki_page_index.workspaceId` 필수 필터.
- **G5: schema drift** — `scripts/check-schema-drift.mjs` PostToolUse hook + CI blocking. 그대로 승계.
- **G7: llm_call_log** — 모든 LLM 호출 기록. op 타입에 `wiki.*` 추가 (W1-T5).

#### 재정의 게이트

- **G6: eval fixture 재설계 (page QA 기준)** — 기존 raw-chunk Recall@10은 폐기. 새 지표: **page-first recall@5 ≥ 70% (W2 통과), ≥ 80% (W3 목표)**. fixture는 `{query, expectedPages, answerPatterns}` 스키마로 재구성.

#### 신규 게이트

- **G8: wiki commit log 무결성** — 모든 LLM 편집이 git commit + DB projection 양쪽에 기록되어야 함.
  - 체크: `wiki_commit_log.commitSha == git log HEAD`의 sha (100% 일치)
  - 구현: `scripts/check-wiki-commit-integrity.mjs` (일 1회 크론)
  - 불일치 시: Sentry 알림 + review_queue(kind='integrity_violation')
- **G9: auto/manual 경계 위반 감지** — CI에서 `wiki/auto/**`를 사람이 수정한 커밋 차단.
  - 체크: commit author == `jarvis-llm@{workspaceId}` 인지 검증
  - 구현: `.github/workflows/wiki-boundary-check.yml` (PR trigger + blocking)
  - 위반 주간 목표: 0건
- **G10: page-first query recall** — 동일 질문에 관련 페이지 top-5 포함률 ≥ 80% (Phase-W3 종료 기준).
  - 체크: `apps/worker/eval/runners/page-first-baseline.ts` 매일 1회
  - 30건 fixture 기준
  - Sentry 알림 (recall < 70% 2일 연속 시)

- **G11: Legacy body column read guard** — `FEATURE_WIKI_FS_MODE=true` 상태에서 `knowledge_page.mdxContent`, `wiki_sources.body`, `wiki_concepts.body` SELECT 시 application-layer assert로 throw. 레거시 테이블이 SSoT로 되살아나는 MindVault 함정(DB-backed wiki skin) 재발 방지의 마지막 봉쇄장치.
  - 체크: Drizzle 쿼리 빌더를 래핑해 해당 컬럼 접근 시 `BodyColumnReadGuardError` throw. 또한 `grep -r "mdxContent\|wiki_sources.body\|wiki_concepts.body" packages/ apps/` CI 0건 강제.
  - 구현: `packages/db/guards/body-column-guard.ts` + `.github/workflows/legacy-body-grep.yml`
  - 실행 시점: W1 초에 guard 투입, 이후 **모든 DB 쿼리 PR**에서 CI blocking
  - 실패 시 동작: PR 머지 차단, 개발자에게 "wiki-fs 경유" 메시지 노출

### 5.2 게이트 실행 매트릭스

| 게이트 | 실행 시점 | 실행자 | 실패 시 동작 |
|--------|----------|--------|--------------|
| G1 비용 | 모든 LLM 호출 | `budget-guard.ts` | 예외 throw, 호출 차단 |
| G2 PII | 모든 ingest Step 0 | `pii/redactor.ts` | 마스킹 + sensitivity 승급 |
| G3 review_queue | ingest Step D, lint, heal | 각 job 내부 | INSERT, 관리자 UI 대기 |
| G4 cross-workspace | 모든 쿼리 | `workspace-guard.ts` | 필터 강제, 로그 경보 |
| G5 schema drift | PostToolUse, CI, pre-commit | `check-schema-drift.mjs` | advisory (훅) / blocking (CI/precommit) |
| G6 eval fixture | 일 1회 크론 | `page-first-baseline.ts` | 리포트 기록 + 임계치 이하 시 Sentry |
| G7 llm_call_log | 모든 LLM 호출 | `cached-call.ts` | INSERT (필수) |
| G8 commit log 무결성 | 일 1회 크론 | `check-wiki-commit-integrity.mjs` | 불일치 시 Sentry + review_queue |
| G9 auto/manual 경계 | 모든 PR, 모든 push | CI workflow | blocking |
| G10 page-first recall | 일 1회 크론 | `page-first-baseline.ts` | 임계치 이하 시 Sentry + 주간 리포트 |
| G11 body column read guard | 모든 DB 쿼리, 모든 PR | `body-column-guard.ts` + CI grep | 런타임 throw / PR blocking |

### 5.3 게이트 승급 경로

Phase-W1 → Phase-W2: G1, G2, G5, G7 가동. G3은 신규 kind 추가. G8 초벌(수동 검증).
Phase-W2 → Phase-W3: G4 재검증 (page-first에서도 workspace 격리). G6 초벌(recall@5 ≥ 70%). G8 자동화.
Phase-W3 → Phase-W4: G9 blocking. G10 일 측정.
Phase-W4: 모든 게이트 완전 가동 + 2~3 릴리스 무위반 후 레거시 DROP.

---

## 6. 위험 관리

### 6.1 기술 위험

| ID | 위험 | 가능성 | 영향 | 완화 전략 |
|----|------|--------|------|-----------|
| TR-01 | Windows git 핸들링 (`simple-git` child process 실패) | 중 | 중 | CI matrix (windows-latest + ubuntu-latest). `simple-git` 옵션으로 git 경로 명시. Windows 개발자 2명이 W1-T1 리뷰 |
| TR-02 | workspace git repo 수 증가 시 디스크/백업 폭증 | 중 | 중 | 주 1회 `git gc --aggressive` + 별도 `bare mirror`로 S3 push (Phase-W3 구현) |
| TR-03 | LLM 다중 페이지 동시 생성 시 프롬프트 일관성 무너짐 | **높** | 중 | Step B 직후 중복 title/같은 주제 감지 → review_queue. W2 시작 직후 5건 샘플 튜닝 |
| TR-04 | pg_trgm 한국어 매칭 품질 부족 ("마인드볼트" ≠ "MindVault") | 중 | 중 | `pg_bigm` 설치 옵션 검토 (W2-T2 결정). aliases frontmatter 필드로 수동 보강 |
| TR-05 | 1건 ingest가 LLM 토큰 한도 초과 | 중 | 낮 | Step A에서 후보 페이지 수 동적 제한. LLM input trimming fallback |
| TR-06 | 디스크 read가 page-first 병목 | 중 | 낮 | in-memory LRU cache (W2-T5 선택 구현) |
| TR-07 | `wiki_page_index.gitSha` 일관성 유실 (race) | 낮 | 높 | single-writer 큐 + post-commit DB sync 원자적. G8 일 1회 감시 |
| TR-08 | Graphify 바이너리 출력 경로 충돌 | 낮 | 낮 | wrapper 스크립트로 경로 강제 (W3-T2) |
| TR-09 | Zod 스키마가 과하게 엄격해 LLM 반려 폭증 | 중 | 낮 | `strict: false` + optional 필드. Step B 실패 시 1회 재시도 (자동) |
| TR-10 | `remark-wiki-link` 라이브러리 한국어 처리 | 중 | 낮 | 자체 파서로 대체 (`packages/wiki-fs/src/wikilink.ts`). 50+ 유닛 테스트 |

### 6.2 운영 위험

| ID | 위험 | 가능성 | 영향 | 완화 전략 |
|----|------|--------|------|-----------|
| OR-01 | 5000명 × 동시 ingest 요청 | 중 | 높 | workspace당 single-writer 큐. 전체 throughput은 workspace 수 × 1. 폭증 시 queue length 알림 |
| OR-02 | git commit 폭증 (초당 수십건) | 중 | 중 | workspace당 초당 1건 제한 (큐로 자연스럽게). 크론 gc 시간대 분산 |
| OR-03 | 단일 writer 큐 병목 → ingest 지연 | **높** | 중 | Phase-W4-T1에서 sub-workspace partitioning 검토. 당분간은 backoff + UI에 "처리 중" 배지 |
| OR-04 | LLM API rate limit (OpenAI tier) | 중 | 중 | fallback ladder (기본 → mini → cached) + daily budget. 5000명 기준 peak 시 queue retry |
| OR-05 | 디스크 fill-up (`wiki/` 폭증) | 낮 | 높 | 주간 용량 모니터링 + `git gc` + S3 archival (manual/ 전용) |
| OR-06 | Sentry 비용 폭주 | 낮 | 낮 | 환경별 sample rate (prod 10%, staging 100%) |
| OR-07 | 관측 대시보드 느림 | 중 | 낮 | materialized view로 집계 선계산 |
| OR-08 | review_queue 폭주 (contradictions false positive) | 중 | 중 | confidence threshold 0.7 + 관리자 batch approval UI |

### 6.3 제품 위험

| ID | 위험 | 가능성 | 영향 | 완화 전략 |
|----|------|--------|------|-----------|
| PR-01 | 페이지 500 돌파 후 page-first recall 급락 | 중 | 높 | Phase-W4-T1 게이트 (qmd 도입 결정). recall 모니터링 일 1회 |
| PR-02 | qmd 도입 지연 (결정 게이트가 늦어짐) | 중 | 중 | Phase-W4-T1에 SLA 명시 (500 돌파 후 2주 내 결정) |
| PR-03 | "페이지가 너무 많다" 사용자 불만 | 낮 | 낮 | 검색 UI 개선 (Phase-W4+). alias 보강 |
| PR-04 | LLM 편집 속도가 사용자 기대보다 느림 | 중 | 중 | UI에 "처리 중" 배지 + 완료 알림 (Slack/email 옵션) |
| PR-05 | Ask AI 답변 품질이 일시적으로 떨어짐 (전환 시점) | **높** | 높 | W2 에서 recall@5 ≥ 70% 확보 전제. W3-T3 전환 24h 집중 모니터링 |

### 6.4 거버넌스 위험 (MindVault 재발 방지)

| ID | 위험 | 가능성 | 영향 | 완화 전략 |
|----|------|--------|------|-----------|
| GR-01 | **auto/manual 경계 위반 → 사람 편집 묻힘 (MindVault 2번)** | **높** | **매우 높** | G9 CI blocking. 위반 0건/주 목표. admin 알림 |
| GR-02 | 검색 최적화 유혹 재발 | 중 | 높 | KPI를 "ingest당 페이지 업데이트 수"로 고정. recall은 보조 지표 |
| GR-03 | RAG 경로 제거 늦어짐 → 두 시스템 동시 운영 부담 | 중 | 중 | Phase-W3 종료 시점에 flag 완전 off. Phase-W4-T2/T3에 코드 제거 |
| GR-04 | 프롬프트 drift (Step A/B 일관성 저하) | 중 | 중 | `PROMPT_VERSION` 상수 + llm_cache key 포함. 변경 시 A/B 실측 |
| GR-05 | workspace 격리 실수 (cross-tenant leakage) | 낮 | **매우 높** | G4 강제. integrator PR 리뷰 체크리스트에 필수 항목 |
| GR-06 | LLM 환각 페이지 누적 | 중 | 높 | contradictions + lint 주간 실행 + review_queue 승인 워크플로우 |
| GR-07 | `wiki_commit_log` 무결성 뚫림 (DB만 수정) | 낮 | 높 | G8 일 1회 감시. 불일치 즉시 알림 |

**위험 식별 총합:** 기술 10 + 운영 8 + 제품 5 + 거버넌스 7 = **30건**.

---

## 7. 롤백 매트릭스

### 7.1 Feature Flag 상세

| Flag | Default | Phase-W1 | Phase-W2 | Phase-W3 | Phase-W4 | 롤백 동작 |
|------|---------|----------|----------|----------|----------|-----------|
| `FEATURE_WIKI_FS_MODE` | false | **true** | true | true | true | false면 wiki-fs 패키지 비활성, ingest는 레거시 |
| `FEATURE_TWO_STEP_INGEST` | false | false | **true** | true | true | false면 기존 ingest |
| `FEATURE_PAGE_FIRST_QUERY` | false | false | **true** | true | true | false면 `retrieveChunkHybrid` |
| `FEATURE_RAW_CHUNK_QUERY` | true | true | true | **false** | false | true로 되돌리면 RAG 복귀 (W3-T3 전 안전망) |
| `FEATURE_WIKI_LINT_CRON` | false | false | **true** | true | true | false면 크론 skip |
| `FEATURE_GRAPHIFY_DERIVED_PAGES` | false | false | false | **true** | true | false면 Graphify 출력 중단 |
| `FEATURE_SAVE_AS_PAGE` | false | false | **true** | true | true | false면 UI 버튼 숨김 |
| `FEATURE_WIKI_SINGLE_WRITER` | false | false | **true** | true | true | false면 기존 concurrency |
| `FEATURE_WIKI_BOUNDARY_CI` | false | false | false | **true** | true | false면 CI advisory |

### 7.2 롤백 레벨

- **L1 (Soft):** feature flag off 하나로 즉시 기존 경로 복귀. 대부분의 시나리오.
- **L2 (Medium):** 스키마 down migration (`scripts/rollback/2026-04-phase-W{N}.sql`) — 새 테이블만 DROP, 기존 데이터 무손실. DB 쓰기가 시작된 후엔 신중히.
- **L3 (Hard):** git revert + 서버 재배포. 최악의 시나리오. 디스크의 `wiki/` 디렉토리는 보존 (사람 편집 분실 방지).
- **L4 (불가역):** Phase-W4-T2 (벡터/document_chunks DROP). 실행 후 되돌림 불가. 백업 스냅샷 필수.

### 7.3 Phase별 롤백 가능성 매트릭스

| Phase | 가장 위험한 작업 | L1 | L2 | L3 | L4 | 비고 |
|-------|------------------|----|----|----|----|------|
| W1 | 새 패키지 + 새 테이블 추가만 | ✅ | ✅ | ✅ | ❌ | 기존 시스템 건드리지 않음 |
| W2 | ingest 경로 재작성 + page-first 추가 | ✅ | ✅ | ✅ | ❌ | flag off로 즉시 복귀 |
| W3 | `FEATURE_RAW_CHUNK_QUERY=false` | ✅ | ⚠️ | ✅ | ❌ | flag on으로 즉시 복귀. 데이터는 건드리지 않음 |
| W4-T2 | 벡터 DROP | ❌ | ❌ | ❌ | **true** | **가장 마지막에**. 백업 스냅샷 필수 |

### 7.4 "되돌림 가능성 체크리스트"

Phase-W1/W2/W3의 **모든 PR**에 다음 질문을 붙인다:

- [ ] 이 PR을 merge한 뒤 feature flag off만으로 기존 상태로 돌아가나?
- [ ] 새 테이블/컬럼이 있다면 down migration이 준비되어 있나?
- [ ] 기존 데이터를 변환하는가? (변환 있으면 backup 필요)
- [ ] 이 PR의 git revert가 디스크 `wiki/` 콘텐츠에 영향을 주는가? (주면 안 됨)

---

## 8. 레거시 RAG 처리 계획

### 8.1 코드

| 파일 | 현재 용도 | v4 처리 | 제거 시점 |
|------|----------|---------|-----------|
| `packages/ai/ask.ts` | Ask AI 메인 | `if (!FEATURE_PAGE_FIRST_QUERY)` 분기로 감싸 유지 | Phase-W4-T3 |
| `packages/ai/retrieve-chunk-hybrid.ts` | 하이브리드 검색 | 동일 | Phase-W4-T3 |
| `packages/ai/rrf.ts` | RRF merge | 동일 | Phase-W4-T3 |
| `packages/ai/assemble-context.ts` | chunk 조립 | 동일 | Phase-W4-T3 |
| `packages/ai/retrieve-relevant-claims.ts` | claim 검색 | 유지 (튜터 기능에서 사용 가능성) | Phase-W4 재평가 |
| `apps/worker/src/lib/text-chunker.ts` | chunking | Phase-W3까지 유지 (이미 쓰인 데이터 존재) | Phase-W4-T2 DROP 동시 |
| `packages/ai/embed.ts` | 임베딩 생성 | Phase-W3까지 유지 | Phase-W4-T2 DROP 동시 |

### 8.2 테스트

| 파일 | v4 처리 |
|------|---------|
| `packages/ai/__tests__/rrf.test.ts` | W3-T3 즉시 `describe.skip`. W4-T3에 삭제 |
| `packages/ai/__tests__/retrieve-chunk-hybrid.test.ts` | 동일 |
| `apps/worker/src/__tests__/integration/two-step-ingest.test.ts` | 유지 (W2에서 새 ingest 테스트로 재사용) |
| `apps/worker/src/__tests__/integration/ingest.test.ts` (기존) | W3에 skip, W4에 삭제 |

### 8.3 스키마

마지막 단계로 DROP COLUMN + DROP TABLE (Phase-W4-T2):

```sql
-- scripts/rollback-unsafe/2026-XX-phase-W4-T2-drop-legacy-chunks.sql
-- UNSAFE: 되돌림 불가. 2~3 릴리스 안정 후 실행.
BEGIN;

DROP INDEX IF EXISTS document_chunks_vec_idx;
DROP INDEX IF EXISTS document_chunks_hash_idx;
DROP INDEX IF EXISTS document_chunks_doc_idx;
DROP INDEX IF EXISTS document_chunks_ws_idx;
DROP TABLE IF EXISTS document_chunks;

ALTER TABLE knowledge_claim DROP COLUMN IF EXISTS embedding;

-- wiki_sources.body가 존재한다면 (과거 구조)
-- ALTER TABLE wiki_sources DROP COLUMN IF EXISTS body;

COMMIT;
```

**실행 전 체크리스트:**
- [ ] 프로덕션 백업 스냅샷 확보 (S3)
- [ ] 스테이징 동일 migration 1주 안정
- [ ] `FEATURE_RAW_CHUNK_QUERY` 완전 off 상태 2~3 릴리스 유지
- [ ] Phase-W3 모든 게이트 통과
- [ ] 롤백 불가 경고를 팀 전체에 공지

---

## 9. 성공 지표 (KPI)

### 9.1 Phase별 KPI

| Phase | 지표 | 목표 | 측정 방식 |
|-------|------|------|----------|
| **W1** | wiki-fs round-trip 테스트 통과 수 | ≥ 20건 | `pnpm test --filter @jarvis/wiki-fs` |
| **W1** | commit log 무결성 | 100% (1건 샘플 기준) | 수동 검증 |
| **W1** | W1 게이트 체크리스트 | 100% 통과 | `docs/plan/2026-04-W1-gate.md` |
| **W2** | ingest 1건당 페이지 업데이트 수 | **고정 10건 fixture 중 8건 이상에서 pageUpdates ≥ 8 (중앙값 ≥ 8)** (MindVault 함정 회피, 분포 왜곡 방지용 중앙값 + 8/10 pass 이중 기준) | 고정 fixture `apps/worker/eval/fixtures/2026-04/multi-page-ingest.jsonl` (curator ≠ reviewer), `llm_call_log` 분석 |
| **W2** | page-first recall@5 | ≥ 70% | `apps/worker/eval/runners/page-first-baseline.ts`, 10건 샘플 |
| **W2** | single-writer 큐 동시성 | 10건 concurrent → 순차 처리 0건 동시 | 통합 테스트 |
| **W2** | Two-Step CoT 비용 | 1건 ingest < $0.50 (평균) | `llm_call_log` 집계 |
| **W3** | `FEATURE_RAW_CHUNK_QUERY` | 프로덕션 전면 off | ENV 확인 |
| **W3** | auto/manual 경계 위반 | 0건/주 | CI log + `wiki_review_queue(kind='boundary_violation')` |
| **W3** | page-first recall@5 | ≥ 80% | 30건 fixture |
| **W3** | 일일 ingest 안정성 | 99% success rate | `ingest_run.status='done'` 비율 |
| **W4** | 페이지 수 | workspace별 추적 | `wiki_page_index.count` |
| **W4** | qmd 도입 결정 | 500 돌파 후 2주 내 | 결정 리포트 |

### 9.2 회귀 방지 (MindVault 실패 재발 체크)

`WIKI-AGENTS.md §11` 승계. 각 phase 종료 시 확인:

- [ ] LLM 합성 단계 존재 (tree-sitter 단독 아님) — W2 완료 시
- [ ] 한 번의 ingest가 다수 페이지 업데이트 ≥ 8 — W2 완료 시
- [ ] 한국어 동의어 매칭 동작 — W2 완료 시 (alias + trigram/bigram)
- [ ] 교차 참조 자동 유지 — W2 완료 시 (`[[wikilink]]`)
- [ ] 모순 플래그 동작 — W2 완료 시 (lint)
- [ ] 페이지가 답변 소스 (청크 아님) — W3 완료 시
- [ ] auto/manual 분리 — W3 완료 시 (G9)
- [ ] 컨텍스트 품질 측정 — W3 완료 시 (G10)

### 9.3 장기 건강 지표 (Phase-W4 이후)

- 월간 신규 페이지 생성 수 vs 갱신 수 비율 (갱신 > 신규이어야 함)
- 페이지 평균 inbound 링크 수 (hub이 자연스럽게 생기는지)
- Orphan 페이지 비율 (< 5%)
- Contradictions 관리자 승인율 (resolve vs defer ratio)
- page-first p95 latency (< 2s 목표)

---

## 10. 변경 이력

| 날짜 | 버전 | 변경 | 사유 |
|------|------|------|------|
| 2026-04-15 | v4 draft | 신규 작성 (v1/v2/v3 폐기) | 2026-04-14 MindVault 폐기 + 2026-04-15 Karpathy-first 피벗. RAG 하이브리드 전제 전면 폐기, Git+LLM 위키를 본체로 재정의 |

---

## 부록 A. 용어 빠른 참조

| 용어 | 정의 | 정의 위치 |
|------|------|----------|
| 3-레이어 | Raw / Wiki / Schema | `WIKI-AGENTS.md §1` |
| 4 오퍼레이션 | Ingest / Query / Lint / Graph | `WIKI-AGENTS.md §3` |
| auto vs manual | LLM 편집 vs 사람 편집 영역 | `WIKI-AGENTS.md §4` |
| single-writer | workspace당 concurrency=1 큐 | `WIKI-AGENTS.md §5` |
| compiled wiki | LLM이 합성한 페이지 본문 (raw chunk 아님) | 이 문서 §1.3 |
| page-first navigation | 검색 대상이 compiled wiki page | 이 문서 §3.2 |
| projection DB | git 본문의 색인·권한·메타 미러 | 이 문서 §3.3 |
| Two-Step CoT | Analyze + Generate 2번 LLM 호출 | `docs/analysis/03-llm-wiki-agent.md §3` |
| multi-page update | 1건 ingest가 N개 페이지를 동시에 갱신 | `WIKI-AGENTS.md §11`, MindVault 함정 |
| Strong-Signal Bypass | BM25 top-score 충분히 높으면 expansion skip | v2 용어집 (폐기) |
| Draft namespace | 자동 생성물 격리 영역 | v2 용어집 (부분 승계 — review_queue로 대체) |
| qmd | 500+ 페이지 시 보조 검색 후보 | `docs/analysis/05-qmd.md` |

## 부록 B. 즉시 실행 체크리스트 (Phase-W1 D1 시작 전)

- [ ] 이 문서 main에 merge (draft → active)
- [ ] `WIKI-AGENTS.md` v1 병합
- [ ] `docs/_archive/2026-04-pivot/` 디렉토리에 v1/v2/v3 이동 확인
- [ ] `docs/plan/2026-04-W1.md` 신규 (이 문서 §4.1 복사 + 일별 분할)
- [ ] `AGENTS.md` 변경 이력에 "v4 피벗 + Karpathy-first" 항목 추가
- [ ] `CLAUDE.md` 변경 이력에 동일
- [ ] `.env.example`에 W1 신규 키 추가:
  - `FEATURE_WIKI_FS_MODE=false`
  - `FEATURE_TWO_STEP_INGEST=false` (기존 유지)
  - `FEATURE_PAGE_FIRST_QUERY=false`
  - `FEATURE_RAW_CHUNK_QUERY=true`
  - `FEATURE_WIKI_LINT_CRON=false`
  - `FEATURE_GRAPHIFY_DERIVED_PAGES=false`
  - `FEATURE_SAVE_AS_PAGE=false`
  - `FEATURE_WIKI_SINGLE_WRITER=false`
  - `FEATURE_WIKI_BOUNDARY_CI=false`
  - `WIKI_ROOT_DIR=./wiki` (디스크 SSoT 경로)
- [ ] `packages/wiki-fs/` 스캐폴딩 준비
- [ ] `packages/wiki-agent/` 스캐폴딩 준비
- [ ] `.claude/commands/wiki-*.md` 4개 템플릿 작성
- [ ] Phase-6 knowledge debt radar + drift detection 현재 동작 확인 (Phase-W2 lint 전환 전)
- [ ] jarvis-planner에게 Phase-W1 D1~D5 작업 생성 요청 (W1-T1~T6을 2~3 sub-task로 분해)

---

## 부록 C. 문서 크로스링크 요약

### 위계

```
WIKI-AGENTS.md              ← 지식 스키마 (본 문서의 상위)
├─ 이 문서 (v4)             ← 실행 계획 (본 문서)
│   ├─ Phase-W1~W4 → docs/plan/2026-04-W{N}.md (일별 세부)
│   └─ 게이트 → scripts/check-*.mjs + .github/workflows/*.yml
├─ CLAUDE.md / AGENTS.md    ← 코드 하네스 (직교)
└─ docs/analysis/           ← 참고 자료 (이 문서의 증거)
    ├─ 01-graphify.md       (Graphify 유지)
    ├─ 02-llm_wiki.md       (프롬프트 포팅 원본)
    ├─ 03-llm-wiki-agent.md (slash command 포팅 원본)
    ├─ 05-qmd.md            (W4-T1 결정 게이트 참고)
    └─ _archive/2026-04-pivot/
        ├─ 99-integration-plan.md (v1+v2 폐기본)
        ├─ 2026-04-15-phase7b.md  (v3 폐기본)
        └─ 04-mindvault.md        (실패 사례)
```

### 읽는 순서 (신규 onboarding)

1. `WIKI-AGENTS.md` (지식 스키마, 30분)
2. 이 문서 §0~§3 (배경 + AS-IS + TO-BE, 20분)
3. 이 문서 §4 (해당 phase만, 15분)
4. 필요 시 참고 분석 (1~2시간)
5. 폐기본은 함정 회피용으로만 (옵션)

---

**이 문서가 Phase-W1~W4 모든 의사결정의 근거.**

**실행은 jarvis-planner가 Phase-W1 T1부터 작업을 쪼개서 jarvis-builder에게 dispatch, jarvis-integrator가 게이트(G1~G10) + auto/manual 경계 + workspace 격리를 교차 검증.**

**변경 시 `WIKI-AGENTS.md`와 이 문서의 §10 변경 이력을 같이 업데이트.**
