# WIKI-AGENTS — Jarvis LLM Wiki Schema

> 이 파일은 Jarvis에서 **LLM이 사내 위키를 관리자처럼 운영**하기 위한 최상위 스키마·워크플로 규약이다.
> Karpathy의 [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)를 엔터프라이즈 멀티테넌트 환경으로 확장한 것.
> `CLAUDE.md`·`AGENTS.md`가 **코드 하네스**를 규정한다면, 이 파일은 **지식 하네스**를 규정한다.
>
> **상태:** v1 초안 (2026-04-15). 사용자+LLM이 함께 진화시키는 살아있는 문서.

---

## 0. 철학 한 문장

**"LLM이 raw를 읽어 wiki를 컴파일하고, 사용자는 compiled wiki를 탐색한다."**

Jarvis는 더 이상 검색 포털이 아니다. 검색/라우팅/RAG는 **수단**이고, 진짜 제품은 **LLM이 지속 편집하는 영속 위키**다. 질문은 raw chunk가 아니라 compiled wiki page를 대상으로 한다. 위키가 커지면 qmd 같은 보조 검색을 붙이되, 본체는 항상 compiled wiki다.

---

## 1. 3-레이어 모델

| 레이어 | 책임 | 저장소 | 편집권 |
|--------|------|--------|--------|
| **Raw Sources** | 업로드된 PDF/DOCX/이미지/음성 원문 | MinIO (불변) + DB 메타(`raw_source`) | ❌ LLM 읽기 전용 |
| **Wiki Pages** | 엔티티·개념·요약·합성 마크다운 | **on-disk `wiki/{workspaceId}/**/*.md` + git** | ✅ LLM 독점 편집 (auto 영역) / 👥 사람 편집 (manual 영역) |
| **Schema** | 이 파일 + `.claude/commands/wiki-*.md` | 코드베이스 | 👥 사용자+LLM 공동 진화 |

**진실원천 규칙:** Wiki content의 SSoT는 **디스크/Git**. DB에는 색인·권한·감사·메타만 projection. `knowledge_page.mdxContent`·`wiki_sources.body`·`wiki_concepts.body`는 전부 **폐기 또는 캐시 강등**.

---

## 2. 디렉터리 구조

```
wiki/
  {workspaceId}/
    .git/                             # workspace당 독립 git repo
    index.md                          # auto — 전체 페이지 카탈로그
    log.md                            # auto — 시간순 ingest/query/lint 기록 (append-only)
    auto/                             # LLM 독점 편집 영역
      sources/{slug}.md               # 원본 소스별 요약 페이지
      entities/{TitleCase}.md         # 인물·조직·시스템 엔티티
      concepts/{kebab-case}.md        # 개념·정책·용어
      syntheses/{slug}.md             # 쿼리 답변 중 "Save as Page" 된 것
      derived/code/{path}.md          # Graphify가 생성한 코드 페이지 (격리)
    manual/                           # 사람 전용 영역 (LLM Read-only)
      overrides/{slug}.md             # 법무/보안 예외, auto 페이지 오버라이드
      notes/{slug}.md                 # 관리자 해설·메모
    _system/                          # auto — 린트/감사 리포트
      lint-report-{YYYY-MM-DD}.md
      contradictions.md
      orphans.md
```

**frontmatter 필수 필드:**
```yaml
---
title: "페이지 제목"
type: source | entity | concept | synthesis | derived
workspaceId: "uuid"
sensitivity: PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY
requiredPermission: "knowledge:read"   # 최소 요구 권한
sources: ["raw_source_id_1", "..."]    # Raw Sources와의 연결
aliases: ["동의어1", "동의어2"]         # 한국어 동의어 (검색용)
tags: ["domain/hr", "type/policy"]
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
authority: auto | manual
linkedPages: ["page-slug-1", "..."]    # 아웃바운드 [[wikilink]] 목록
---
```

---

## 3. 4가지 오퍼레이션

### 3.1 Ingest (핵심 — MindVault가 실패한 지점)

**한 번의 ingest = 여러 페이지 동시 갱신.** 이게 빠지면 "DB-backed wiki skin"이 된다.

```
[입력] raw_source 1건
[프로세스]
  Step A (Analysis LLM):
    - wiki/{workspaceId}/index.md 로드
    - wiki_page_index에서 관련 페이지 후보 선정 (title/alias/tags)
    - LLM이 관련 페이지 10~15개 Read
    - LLM이 raw 원문 읽고 JSON 반환:
        {
          newPages: [{path, type, title, content}],
          updatePages: [{path, newContent, reason}],
          contradictions: [{pageA, pageB, description}],
          linkSuggestions: [{from, to, reason}]
        }
  Step B (Generation LLM):
    - newPages / updatePages 각각의 mdxContent 완성
    - [[wikilink]] 자동 삽입
    - frontmatter 완성 (sources, aliases, linkedPages)
    - **aliases 프롬프트 계약 (필수):** LLM이 각 페이지 title·본문에서
      한국어·영문·축약어 동의어를 최소 3개 자동 생성.
      예: title="MindVault" → aliases=["마인드볼트", "mind vault", "MV"]
      미생성 또는 3개 미만 시 Step C validate 실패 → ingest_dlq로.
      (MindVault 실패 조건 #3 "마인드볼트 ≠ MindVault" 재발 방지 장치)
  Step C (Write):
    - temp worktree에서 patch 생성
    - validate (frontmatter 스키마, wikilink 존재, sensitivity 일관성)
    - main branch에 fast-forward merge (single-writer 큐)
    - commit message: "[ingest] {sourceTitle} — N pages updated"
    - log.md에 한 줄 추가
    - DB projection sync (wiki_page_index, wiki_page_link, wiki_commit_log)
  Step D (Review queue):
    - contradictions / sensitivity 상승 / PII 감지 → review_queue로
    - 승인 전까지 published=false
```

**실패 조건:**
- Step C에서 validate 실패 → commit 안 함, `ingest_dlq`로 이동
- concurrent writer 충돌 → pg-boss 재시도 (single-writer 큐로 거의 발생 안 함)

### 3.2 Query (RAG 폐기, Page-first Navigation)

**raw chunk를 검색하지 않는다. compiled wiki page를 검색한다.**

```
[입력] 사용자 질문
[프로세스]
  1. wiki/{workspaceId}/index.md 로드
  2. wiki_page_index에서 lexical shortlist:
     - title / alias / tags / path ILIKE + pg_trgm similarity
     - freshness bonus (updated DESC)
     - top-20 후보
  3. wiki_page_link 1-hop 확장:
     - shortlist 페이지의 linkedPages + inbound links
     - hub page (inbound 많은 페이지) 우선
  4. 사용자 권한 + sensitivity 필터 (DB WHERE)
  5. top 5~8 페이지 실제 Read
  6. LLM 답변 합성 + [[wikilink]] 인용
  7. [Save as Page] 옵션 → auto/syntheses/{slug}.md
[제거]
  - 벡터 유사도 검색 ❌
  - document_chunks ❌
  - RRF 하이브리드 ❌
  - raw chunk retrieval ❌
```

**규모 확장:** 페이지 500 이상 + 한국어 동의어 매칭 부족 시 qmd-MCP를 **compiled wiki 위에** 붙인다. raw source는 절대 qmd에 넘기지 않는다.

### 3.3 Lint (주기적 건강검진)

주 1회 크론. `apps/worker/src/jobs/wiki-lint.ts`.

```
[점검 항목]
  1. Orphan pages: 인바운드 [[wikilink]] 0인 페이지
  2. Broken links: [[target]]이 실존하지 않음
  3. No-outlinks: 링크가 하나도 없는 페이지
  4. Contradictions: 같은 주제의 상충 주장 (LLM semantic lint)
  5. Stale claims: 최신 소스에 의해 대체된 낡은 주장
  6. Missing cross-refs: 관련도 높은 페이지 간 누락 링크 제안

[출력]
  wiki/_system/lint-report-{YYYY-MM-DD}.md (auto)
  review_queue(type='lint') 항목 생성
  관리자 UI에서 승인 후 auto에 적용
```

### 3.4 Graph (Graphify 통합)

**Graphify는 구조 보조 엔진이지 지식 컴파일러가 아니다.**

```
[역할 분리]
  Graphify → facts extraction + link suggestion + graph viewer
  LLM ingest → semantic synthesis (의미 합성)
  
[출력 분리]
  wiki/auto/derived/code/**  : Graphify가 직접 생성한 페이지 (격리)
  wiki/auto/entities/**      : LLM ingest가 만든 엔티티 페이지 (Graphify 결과 참조 가능)

[신뢰도 태깅]
  EXTRACTED: Graphify가 AST에서 직접 뽑음 (확실)
  INFERRED: LLM이 추론한 관계 (confidence 0.0~1.0)
  AMBIGUOUS: 수동 검토 필요 → review_queue
  
[금지 사항]
  Graphify 결과가 entity/concept 본문을 직접 덮어쓰지 않음
  LLM ingest가 필요 시 Graphify 결과를 Read하고 합성해서 본문 생성
```

---

## 4. Auto vs Manual 편집 경계

**LLM과 사람이 같은 파일을 섞어 편집하면 안 된다.** 다음 ingest 때 인간 수정이 묻히거나 LLM이 오염된 문장을 재활용한다.

```
wiki/auto/**   : LLM 독점 편집
                 사람은 Read만. 수정하려면 manual/에 오버라이드 작성.
wiki/manual/** : 사람 편집
                 LLM은 Read만. ingest/query 시 참조하되 수정 안 함.
```

**auto 페이지가 manual 오버라이드를 참조하는 법:**

```markdown
<!-- wiki/auto/concepts/휴가-정책.md (LLM 편집) -->
# 휴가 정책

본문 ...

## Manual Overrides
- [[manual/overrides/휴가-정책-법무-주석]] — 법무팀 예외 조항
- [[manual/notes/휴가-정책-2026-변경]] — 관리자 메모
```

**Lint 규칙:** manual/ 페이지에 변경이 있으면 관련 auto/ 페이지를 `stale=true`로 마크, 다음 ingest에서 LLM이 재고려하도록.

---

## 5. Single-Writer + Git 규약

Git merge conflict는 **LLM lint가 해결하지 않는다.** conflict 자체를 single-writer 모델로 회피한다.

```
[규칙]
  - workspace당 pg-boss singleton queue (concurrency=1)
  - ingest worker는 temp worktree에서 patch 생성
  - validate 후 main에 fast-forward만 허용 (no merge commit)
  - 실패 시 commit 없이 ingest_dlq로
  - hourly squash 금지 (audit history rewrite 위험)
  - git gc/pack은 주 1회 별도 크론 (mirror branch에서)

[commit message 규약]
  [ingest] {sourceTitle} — N pages updated
  [lint] {date} — M issues flagged
  [synthesis] {query snippet} → {page path}
  [manual] {author} — {reason}

[감사]
  모든 커밋은 wiki_commit_log DB 테이블에 projection
  (commitSha, author, operation, affectedPages[], reasoning, timestamp)
```

---

## 6. 엔터프라이즈 RBAC 적응

Karpathy 원본은 단일 사용자 가정. Jarvis는 5000명 멀티테넌트. 다음 규칙으로 양립.

| 충돌 지점 | 해결 |
|-----------|------|
| 파일시스템엔 RBAC 없음 | frontmatter `sensitivity` + `requiredPermission` + 서버 미들웨어 게이트. 디스크는 **서버 내부 전용**, 사용자는 HTTP로만 접근 |
| 워크스페이스 격리 | `wiki/{workspaceId}/` 별 독립 git repo |
| 동시 쓰기 | workspace당 single-writer 큐 |
| 감사 요건 | git log + `wiki_commit_log` DB projection |
| 백업 | git bare mirror → S3 주 1회 push |
| 사용자 인터페이스 | 웹 UI만 (Obsidian 직접 연동 없음). 디스크는 backend storage로만 존재 |

---

## 7. DB Projection 스키마 (SSoT 아님, 색인용)

```
wiki_page_index         # 파일 시스템 미러: path, title, frontmatter, workspaceId, sensitivity, updatedAt, gitSha
wiki_page_link          # 아웃바운드·인바운드 [[wikilink]] 그래프
wiki_page_source_ref    # 페이지 ↔ raw_source 연결
wiki_commit_log         # 모든 git 커밋의 메타 (author, operation, reasoning)
wiki_review_queue       # contradictions, sensitivity 상승, PII 감지 등 수동 승인 대기
wiki_lint_report        # 주간 lint 결과
```

**삭제 대상:** `knowledge_page.mdxContent`, `knowledge_claim.embedding`, `document_chunks`, `wiki_sources.body`, `wiki_concepts.body`.

**유지 대상(비활성화):** 벡터/임베딩 스키마는 남기되 쓰기·읽기 경로 전부 feature flag OFF. 2~3 릴리스 안정 후 DROP 마이그레이션.

---

## 8. Feature Flag

```
FEATURE_WIKI_FS_MODE=true              # 디스크 Git 모드 활성화 (main switch)
FEATURE_PAGE_FIRST_QUERY=true          # ask.ts를 page-first navigation으로
FEATURE_RAW_CHUNK_QUERY=false          # 레거시 RAG 경로 비활성화
FEATURE_TWO_STEP_INGEST=true           # Two-Step CoT ingest
FEATURE_WIKI_LINT_CRON=true            # 주간 lint 크론
FEATURE_GRAPHIFY_DERIVED_PAGES=true    # Graphify wiki/auto/derived/code/** 생성
FEATURE_SAVE_AS_PAGE=true              # Query 답변을 auto/syntheses/로 환원
FEATURE_WIKI_SINGLE_WRITER=true        # workspace당 pg-boss singleton 큐 강제
FEATURE_WIKI_BOUNDARY_CI=true          # auto/manual 경계 CI blocking 활성

LLM_DAILY_BUDGET_USD=100               # workspace당 일일 예산
LLM_CACHE_TTL_SECONDS=2592000          # 30일
WIKI_ROOT=/var/lib/jarvis/wiki         # workspace별 git repo 루트 (서버 내부 전용)
```

---

## 9. Claude Code `.claude/commands/` 커맨드

`reference_only/llm-wiki-agent` 에서 포팅된 4개 슬래시 커맨드:

- `/wiki-ingest {raw_source_id}` — Two-Step CoT ingest 실행
- `/wiki-query {question}` — page-first navigation 답변
- `/wiki-lint` — 주간 lint 수동 실행
- `/wiki-graph {workspaceId}` — Graphify snapshot + 그래프 페이지 빌드

Jarvis 하네스(planner/builder/integrator)에서 호출 가능. Python CLI는 포팅하지 않음(Node-only).

---

## 10. 도입 로드맵

### Phase-W0 (반나절) — Bootstrap
0. `docs/canonical/` 시드 마크다운 (95건)을 `wiki/{defaultWorkspaceId}/auto/**`로 **1회 초기 import**.
   첫 ingest는 multi-page update 대상이 없으므로 예외적으로 "1 소스 → 1 페이지" 허용.
   이후 ingest부터 Two-Step CoT + 다중 페이지 업데이트 강제.
   상세: `docs/analysis/99-integration-plan-v4.md` Phase-W0 참조.

### Phase-W1 (이번 스프린트, ~5일, 게이트 확인 포함 총 6개 작업)
1. `WIKI-AGENTS.md` 초안 (이 파일)
2. `packages/wiki-fs/` — 디스크 write + git commit + frontmatter parser + `[[wikilink]]` parser
3. `packages/wiki-agent/prompts/` — llm_wiki에서 Analysis/Generation 프롬프트 포팅
4. `.claude/commands/wiki-*.md` 4개 복사 + Jarvis 경로 적응
5. `wiki_page_index`, `wiki_commit_log` 등 projection 테이블 추가 (migration)
6. **W1 게이트 확인** (G1~G5, G11 — 상세 `99-integration-plan-v4.md §5.1`)

### Phase-W2 (~5일, 게이트 확인 포함 총 6개 작업)
7. `ask.ts`를 `FEATURE_PAGE_FIRST_QUERY` 뒤로 분기 (page-first 구현)
8. `ingest.ts`를 Two-Step CoT로 재작성 (multi-page update 포함)
9. single-writer 큐 (pg-boss workspace-scoped singleton)
10. `wiki-lint` 크론 잡
11. "Save as Page" 경로
12. **W2 게이트 확인** (G6 재정의 + G10 page-first recall ≥ 70%)

### Phase-W3 (~3일, 게이트 확인 포함 총 6개 작업)
13. manual/auto 경계 구현 + lint 규칙
14. Graphify wiki/auto/derived/code/** 격리
15. 기존 RAG 경로 `FEATURE_RAW_CHUNK_QUERY=false`로 비활성화
16. 운영 모니터링 + eval fixture 재구성 (page QA 기준)
17. 운영 대시보드 배선
18. **W3 게이트 확인** (G7 llm_call_log, G8 commit log 무결성, G9 auto/manual 경계)

### Phase-W4 (안정화 후, 가변)
19. 페이지 500 돌파 시점에 qmd-MCP 도입 검토
20. 벡터 스키마 DROP 마이그레이션 (2~3 릴리스 안정 후)
21. 구 RAG 코드 물리적 제거
22. Obsidian 연동 재검토 (원할 경우)

---

## 11. 회귀 방지 체크리스트 (MindVault 실패 재발 방지)

MindVault가 실패한 조건이 Jarvis에 그대로 있다. 각 체크포인트에서 통과 확인.

- [ ] **LLM 합성 단계 존재** — ingest에 LLM 호출이 있고, tree-sitter/structure 추출만으로 끝나지 않는다
- [ ] **한 번의 ingest가 다수 페이지 업데이트** — 신규 1장만 만들고 끝나는 게 아니라 관련 페이지 10~15개를 동시 수정
- [ ] **한국어 동의어 매칭** — alias frontmatter + pg_trgm + (필요시) qmd-MCP. "마인드볼트" ≠ "MindVault" 함정 회피
- [ ] **교차 참조 자동 유지** — `[[wikilink]]` 자동 생성·검증·lint
- [ ] **모순 플래그** — lint 잡이 contradictions 탐지 후 review_queue로
- [ ] **페이지 1급 시민** — 청크가 아니라 페이지가 답변 소스
- [ ] **auto/manual 분리** — 사람 편집이 묻히지 않는다
- [ ] **컨텍스트 품질 측정** — 답변에 관련없는 페이지가 top-5에 오면 알람

---

## 12. 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-15 | v1 초안 작성 | Karpathy-first 피벗 착수. MindVault 폐기 + llm_wiki/llm-wiki-agent 실측 후 외부 LLM 분석 반영. |

---

## 13. 참고 자료 (reference_only/)

> **경로 주의:** `reference_only/`는 로컬 개발 머신 `C:\Users\kms\Desktop\dev\reference_only\`에 위치하며 **저장소에 포함되지 않습니다**. 분석·포팅 원본으로만 사용하고 git submodule로 편입하지 않습니다. 타 개발자 온보딩 시 별도 클론 가이드 제공 예정.

- `karpathy/llm-wiki.md` gist — 북극성 (철학만, URL: `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`)
- `reference_only/llm_wiki/` *(로컬 전용)* — Tauri 구현체 (프롬프트·파일 포맷 포팅 대상)
- `reference_only/llm-wiki-agent/` *(로컬 전용)* — Claude Code 스킬 (`.claude/commands/` 포팅 대상)
- `reference_only/graphify/` *(로컬 전용)* — 네이티브 바이너리 (이미 Jarvis에 통합됨)
- `reference_only/qmd/` *(로컬 전용)* — 500+ 페이지 규모 시 도입 후보 (보조 검색)
- `reference_only/mindvault/` *(로컬 전용)* — **실패 경고 사례**. 2026-04-14 공식 폐기 (참고 금지, 함정 분석용)
