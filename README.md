# Jarvis

**LLM이 raw 자료를 읽어 사내 위키를 컴파일하고, 사용자는 compiled wiki를 탐색하는 엔터프라이즈 지식 시스템.**

Jarvis는 검색 포털이 아닙니다. [Karpathy의 LLM Wiki 구상](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)을 엔터프라이즈 멀티테넌트 환경(5000명 규모)으로 확장한 **지식 컴파일·북키핑 자동화 플랫폼**입니다. 원문 업로드·검색·청크 임베딩은 수단일 뿐이고, 제품의 본체는 **LLM이 지속 편집하는 영속 위키**입니다.

> **2026-04-15 피벗.** "6-레인 RAG 포털"에서 "LLM Wiki 컴파일 시스템"으로 정체성을 재정의했습니다. 구 README는 [`docs/_archive/2026-04-pivot/README.rag-era.md`](docs/_archive/2026-04-pivot/README.rag-era.md)에 보존되어 있습니다. 최상위 스키마·워크플로 규약은 [`WIKI-AGENTS.md`](WIKI-AGENTS.md)를 먼저 참고하세요.

---

## 1. 이 프로젝트가 해결하려는 문제

사내 지식 시스템이 계속 실패하는 원인은 **검색의 약점**이 아니라 **지식의 휘발과 파편화**입니다.

- 사람들이 질문하고 답을 얻지만, 그 답이 **어디에도 축적되지 않습니다**. 다음 사람이 같은 질문을 반복합니다.
- 정책·규정·시스템 정보가 **여러 위키·티켓·Slack 채널·개인 메모**에 흩어져 정본이 흐려집니다.
- 누군가 편집하거나 구조를 갱신할 사람이 없으니, 2년 된 위키가 **반만 맞는 상태**로 방치됩니다.
- 새 자료가 들어와도 관련 페이지들을 **교차 갱신할 사람**이 없습니다.
- 결국 "검색이 안 되니 AI로 감추자"라는 RAG로 넘어가지만, RAG는 원문 조각을 섞을 뿐 **지식을 정리하지 않습니다**.

Jarvis는 이 문제를 다르게 풉니다. **LLM을 관리자처럼 운영**합니다. LLM은 raw 자료를 읽고, 관련 페이지 10~15개를 동시에 수정하고, 교차 링크를 자동 유지하고, 모순을 플래그하고, 낡은 주장을 업데이트합니다. 사용자는 **compiled wiki**를 탐색하며, 질문에는 raw chunk가 아니라 완성된 페이지가 답합니다.

---

## 2. Karpathy LLM Wiki 방식 — 왜 RAG가 아닌가

RAG는 "질문 시점에 원문 조각을 섞어 답을 만드는" 아키텍처입니다. 장점은 구현이 단순하다는 것뿐이고, 단점은 다음과 같습니다.

| RAG (구 Jarvis 방식) | LLM Wiki (현 Jarvis 방식) |
|---------------------|---------------------------|
| 원문 청크를 매번 재검색·재합성 | 한 번 컴파일한 페이지를 재사용 |
| 지식이 누적되지 않음 | Git 이력으로 영속 축적 |
| 모순·중복 탐지 불가 | Lint 잡이 주기적으로 감지 |
| 편집자·관리자 개념 없음 | LLM이 편집·합성·교차링크 |
| 임베딩·벡터 인프라 부담 | 텍스트 파일 + Git + DB projection |
| 답변 품질이 검색 품질에 종속 | 답변 품질이 compiled wiki 품질에 종속 |

**핵심 전환:** 검색을 좋게 만드는 대신, **대상 자체를 compiled wiki로 만들고** 거기에서 답한다. 과거 종이책 시대의 백과사전이 "색인"이 아니라 "편집된 정본"이었던 것과 같은 원리다. 검색은 컴파일된 지식을 빠르게 찾기 위한 보조일 뿐, 1차 소스가 아니다.

**MindVault 실패 회귀 방지:** 2026-04-14에 폐기된 MindVault 프로젝트는 이 전환 없이 "청크 + 임베딩 + 그래프 시각화"만으로 위키를 대체하려다 실패했습니다. 원인·재발 방지 체크리스트는 [§14. MindVault 회귀 방지](#14-mindvault-회귀-방지-체크리스트)에 있습니다.

---

## 3. 핵심 아키텍처 — 3-레이어 모델

Jarvis는 세 개의 독립 레이어로 구성됩니다. 각 레이어는 **저장소·편집권·진실원천**이 서로 다릅니다.

| 레이어 | 책임 | 저장소 | 편집권 |
|--------|------|--------|--------|
| **Raw Sources** | 업로드된 PDF/DOCX/이미지/음성 원문 | MinIO (불변) + DB 메타 (`raw_source`) | LLM 읽기 전용 |
| **Wiki Pages** | 엔티티·개념·요약·합성 마크다운 | 디스크 `wiki/{workspaceId}/**/*.md` + Git | LLM 독점 편집 (auto) + 사람 편집 (manual) |
| **Schema** | `WIKI-AGENTS.md` + `.claude/commands/wiki-*.md` | 코드베이스 | 사용자+LLM 공동 진화 |

### 3.1 진실원천 규칙 (중요)

**Wiki 콘텐츠의 SSoT는 디스크/Git입니다.** DB에는 **색인·권한·감사·메타만** projection됩니다. 이 규칙이 핵심입니다.

```
wiki/{workspaceId}/auto/entities/김민석.md        ← SSoT (본문)
          ↓ (projection)
wiki_page_index (title, frontmatter, gitSha, ...)  ← DB (색인)
```

- DB에 본문 필드(`mdxContent`, `body`)는 **없거나 캐시 강등**됩니다.
- 페이지 변경은 반드시 Git 커밋을 거쳐 워커가 DB를 동기화합니다.
- DB만 직접 수정하는 경로는 **버그**입니다.

### 3.2 사용자는 웹 UI로만 접근

디스크 `wiki/` 디렉터리는 **서버 내부 전용 스토리지**입니다. 사용자가 Obsidian이나 VS Code로 직접 열지 않습니다. 접근은 전부 Next.js 웹 UI + HTTP API 경유이며, 권한 게이팅·sensitivity 필터·감사 로그가 전부 이 경로에서만 동작합니다.

---

## 4. 4가지 오퍼레이션

모든 지식 흐름은 네 가지 오퍼레이션으로 환원됩니다. 상세 사양은 [`WIKI-AGENTS.md` §3](WIKI-AGENTS.md)을 참고하세요.

### 4.1 Ingest — 다수 페이지 동시 갱신

**한 번의 ingest = 여러 페이지 동시 갱신.** 이게 핵심입니다. 새 자료 1개를 받으면 관련 페이지 10~15개가 같이 업데이트됩니다. MindVault가 빠뜨린 단계입니다.

```
[입력]  raw_source 1건
[Step A — Analysis LLM]
         index.md 로드 → 관련 페이지 후보 선정 → 10~15개 Read
         JSON 반환: { newPages, updatePages, contradictions, linkSuggestions }
[Step B — Generation LLM]
         각 페이지 본문 완성 + [[wikilink]] 자동 삽입 + frontmatter 채우기
[Step C — Write]
         temp worktree patch → validate → main에 fast-forward merge
         log.md append + DB projection sync (wiki_page_index, wiki_page_link, ...)
[Step D — Review queue]
         contradictions / sensitivity 상승 / PII 감지 → review_queue
```

### 4.2 Query — Page-first Navigation

**raw chunk를 검색하지 않습니다. compiled wiki page를 검색합니다.**

```
사용자 질문
  → index.md 로드 + wiki_page_index lexical shortlist (title/alias/tags, pg_trgm)
  → wiki_page_link 1-hop 확장 (linkedPages + inbound hub)
  → 권한 + sensitivity 필터
  → top 5~8 페이지 Read
  → LLM 답변 + [[wikilink]] 인용
  → [Save as Page] → wiki/auto/syntheses/{slug}.md
```

제거된 경로: 벡터 유사도 검색, `document_chunks`, BM25+vector+RRF 하이브리드, raw chunk retrieval. 페이지 500개 이상 + 한국어 동의어 부족 시에만 qmd-MCP를 **compiled wiki 위에** 추가 검토합니다.

### 4.3 Lint — 주기적 건강검진

주 1회 크론. `apps/worker/src/jobs/wiki-lint.ts`.

- Orphan pages (인바운드 링크 0)
- Broken wikilinks
- No-outlinks pages
- Contradictions (같은 주제의 상충 주장, LLM semantic lint)
- Stale claims (최신 소스에 의해 대체된 낡은 주장)
- Missing cross-refs (관련도 높은 페이지 간 누락 링크 제안)

출력은 `wiki/_system/lint-report-{YYYY-MM-DD}.md` + `wiki_review_queue`로 들어가고, 관리자가 승인하면 auto에 적용됩니다.

### 4.4 Graph — Graphify 구조 보조

**Graphify는 구조 보조 엔진이지 지식 컴파일러가 아닙니다.** 경계를 분명히 합니다.

| 담당 | 역할 |
|------|------|
| Graphify (네이티브 바이너리) | 코드 AST 파싱 + facts extraction + link suggestion + graph viewer |
| LLM ingest | 자연어 합성, 엔티티/개념 페이지 본문 작성 |

- Graphify 결과는 `wiki/auto/derived/code/**`에 **격리**됩니다.
- Graphify가 entity/concept 페이지의 본문을 **직접 덮어쓰지 않습니다.**
- LLM ingest가 필요 시 Graphify 결과를 Read하고 합성해서 본문을 만듭니다.
- 신뢰도 태깅: `EXTRACTED` (AST 확실) / `INFERRED` (LLM 추론 confidence 0.0~1.0) / `AMBIGUOUS` (review_queue).

---

## 5. Auto vs Manual 편집 경계

**LLM과 사람이 같은 파일을 섞어 편집하면 안 됩니다.** 다음 ingest 때 인간 수정이 묻히거나 LLM이 오염된 문장을 재활용합니다.

```
wiki/{workspaceId}/
  auto/              ← LLM 독점 편집, 사람은 Read만
    sources/         ← 원본 소스별 요약 페이지
    entities/        ← 인물·조직·시스템 엔티티
    concepts/        ← 개념·정책·용어
    syntheses/       ← Query 답변 중 "Save as Page" 된 것
    derived/code/    ← Graphify가 생성한 코드 페이지 (격리)

  manual/            ← 사람 편집, LLM은 Read만
    overrides/       ← 법무/보안 예외, auto 오버라이드
    notes/           ← 관리자 해설·메모

  _system/           ← auto — 린트/감사 리포트
    lint-report-*.md
    contradictions.md
    orphans.md
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

**Lint 규칙:** `manual/` 파일이 바뀌면 관련 `auto/` 페이지를 `stale=true`로 마크 → 다음 ingest에서 LLM이 재고려.

---

## 6. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| **모노레포** | pnpm workspace, Turborepo | |
| **웹** | Next.js 15.5 (App Router), React 19, TypeScript | port 3010 |
| **백그라운드 워커** | pg-boss 기반 Node 워커 | workspace당 single-writer 큐 |
| **DB (projection만)** | PostgreSQL 16 + pg_trgm + unaccent | 본문은 디스크, DB는 색인 |
| **Wiki 파일시스템** | on-disk `wiki/{workspaceId}/` + Git (workspace당 독립 repo) | SSoT |
| **ORM** | Drizzle ORM | `pnpm db:generate` 필수 |
| **스토리지** | MinIO (raw source 불변 저장) | |
| **세션** | PostgreSQL `user_session` 테이블 (`id text PK, data jsonb, expires_at timestamptz`) | `sessionId` 쿠키 |
| **캐시** | `embed_cache` 테이블 (pgvector) + in-memory Map (rate-limit) | pg-boss `cache-cleanup` cron (6h) |
| **LLM** | OpenAI (`ASK_AI_MODEL`, 기본 `gpt-5.4-mini`) | Analysis/Generation 2-step |
| **구조 보조** | Graphify 네이티브 바이너리 (tree-sitter AST + NetworkX + Leiden) | 결정론적, API 키 불필요 |
| **인증** | 이메일+비밀번호 (PostgreSQL 세션) | |
| **테스트** | Vitest (단위), Playwright (E2E) | |

**pgvector는 유지되나 비활성화.** 읽기·쓰기 경로는 전부 feature flag로 차단되며, 2~3 릴리스 안정 후 DROP 마이그레이션 예정입니다 ([§9](#9-환경변수-가이드) `FEATURE_RAW_CHUNK_QUERY=false`).

### 6.5 LLM 모델 정책 (FIXED)

**SSoT:** [`docs/policies/llm-models.md`](docs/policies/llm-models.md). 이 표와 다른 내용이 있으면 정책 문서가 이긴다. 변경 시 정책 문서 + `scripts/check-llm-models.mjs` + README 동시 업데이트 필수.

| 용도 | 모델 | 비고 |
|------|------|------|
| 생성·reasoning (무거움) | `gpt-5.4` | CLIProxy 경유 → OpenAI `gpt-5` |
| 생성·라우팅·ingest·lint (기본) | `gpt-5.4-mini` | CLIProxy 경유 → OpenAI `gpt-5-codex-mini` |
| 임베딩 | `text-embedding-3-small` (1536d) | DB HNSW 인덱스와 계약됨. 변경 시 전량 재임베딩 |

**금지:**
- OpenAI `gpt-4*` / `gpt-3*` / `o1`·`o3`·`o4` / `text-embedding-ada-002` / `text-embedding-3-large`
- Anthropic `claude-*` — **서비스 런타임 금지.** Claude Code / Codex CLI 같은 **개발 도구 한정**
- 로컬 모델 — Ollama (`bge-m3`, `nomic-embed`), llama.cpp, HuggingFace GGUF (`embeddinggemma`, `Qwen-Embedding`) 등

**자동 집행:** `scripts/check-llm-models.mjs`가 Claude Code PostToolUse hook(advisory) + pre-commit(blocking) + CI(blocking)에서 `.env` · `apps/**` · `packages/**` · `scripts/**` · `infra/**`를 스캔. 금지 리터럴 발견 시 exit 1.

```bash
node scripts/check-llm-models.mjs             # 수동 스캔 (drift 있으면 exit 1)
node scripts/check-llm-models.mjs --ci        # CI 모드
node scripts/check-llm-models.mjs --precommit # pre-commit 모드
```

---

## 7. 디렉터리 구조

```text
.
├─ apps/
│  ├─ web/                         # Next.js 웹 애플리케이션 (포트 3010)
│  │  ├─ app/                      # App Router pages / API routes / server actions
│  │  ├─ components/               # 도메인 UI 컴포넌트
│  │  ├─ e2e/                      # Playwright E2E
│  │  └─ lib/                      # queries, hooks, server auth helpers
│  └─ worker/                      # pg-boss 워커 (ingest / lint / graphify / cleanup)
│     └─ src/
│        ├─ jobs/                  # wiki-ingest, wiki-lint, graphify-build, ...
│        └─ lib/                   # MinIO, PDF parser, text chunker
├─ packages/
│  ├─ ai/                          # LLM 프롬프트·답변 생성·citation stream
│  ├─ auth/                        # 세션, RBAC
│  ├─ db/                          # Drizzle schema (projection 테이블), migrations
│  ├─ search/                      # page-first lexical + pg_trgm + 1-hop link expansion
│  ├─ secret/                      # secret reference abstraction
│  ├─ shared/                      # constants / types / validation
│  ├─ wiki-fs/                     # (Phase-W1) 디스크 write + git commit + frontmatter parser
│  └─ wiki-agent/                  # (Phase-W1) Analysis/Generation 프롬프트 + ingest 오케스트레이터
├─ wiki/
│  └─ {workspaceId}/               # workspace당 독립 git repo
│     ├─ .git/
│     ├─ index.md                  # auto — 전체 페이지 카탈로그
│     ├─ log.md                    # auto — ingest/query/lint 시간순 기록
│     ├─ auto/                     # LLM 독점 편집
│     ├─ manual/                   # 사람 편집
│     └─ _system/                  # auto — 린트/감사 리포트
├─ docs/
│  ├─ _archive/2026-04-pivot/      # 구 README 등 피벗 이전 문서 보존
│  ├─ superpowers/                 # 설계 메모 / 스펙 문서
│  ├─ guidebook/                   # ISU 가이드북 원본 + 정규화
│  ├─ canonical/                   # 기존 정본 시드 (위키 초기 import 용도)
│  ├─ analysis/                    # 피벗 분석 / 결정 기록
│  └─ plan/                        # 통합 계획 문서
├─ docker/                         # Dockerfile.{web,worker} + compose + secrets/
├─ data/                           # 초기 시드 데이터 (가이드북, 사례 등)
├─ scripts/
│  └─ check-schema-drift.mjs       # Claude Code hook / CI / pre-commit 공용
├─ .claude/
│  ├─ agents/                      # (비어 있음 — 2026-04-22 방법론을 superpowers 플러그인으로 위임)
│  ├─ commands/                    # wiki-ingest, wiki-query, wiki-lint, wiki-graph (Phase-W1)
│  └─ skills/                      # jarvis-feature(얇은 진입점) + jarvis-architecture/db-patterns/i18n/wiki-feature(도메인 레퍼런스)
├─ WIKI-AGENTS.md                  # 지식 하네스 (이 파일의 상위)
├─ CLAUDE.md / AGENTS.md           # 코드 하네스 (Claude Code / Codex)
├─ package.json, pnpm-workspace.yaml, turbo.json, tsconfig.json
└─ .env.example
```

---

## 8. 데이터 모델 개요 (Projection 스키마)

**중요:** 이 테이블들은 **색인·감사·권한·메타만** 담습니다. 페이지 본문은 전부 디스크입니다.

| 테이블 | 역할 |
|--------|------|
| `wiki_page_index` | 파일시스템 미러 — path, title, frontmatter, workspaceId, sensitivity, updatedAt, gitSha |
| `wiki_page_link` | 아웃바운드·인바운드 `[[wikilink]]` 그래프 |
| `wiki_page_source_ref` | 페이지 ↔ `raw_source` 연결 |
| `wiki_commit_log` | 모든 Git 커밋 메타 (author, operation, affectedPages, reasoning) |
| `wiki_review_queue` | contradictions / sensitivity 상승 / PII 감지 → 관리자 승인 대기 |
| `wiki_lint_report` | 주간 lint 결과 스냅샷 |
| `raw_source`, `attachment` | 업로드 원문 메타 + MinIO 경로 |
| `audit_log` | 감사 |
| `directory_entry` | 사내 시스템 링크·양식·담당자 (업무 시스템 쪽, 유지) |
| `project`, `project_task`, `attendance`, ... | 프로젝트·근태·시스템 (기존 업무 시스템 유지) |

**삭제 대상 (비활성화 후 DROP 예정):** `knowledge_page.mdxContent`, `knowledge_claim.embedding`, `document_chunks`, `wiki_sources.body`, `wiki_concepts.body`.

---

## 9. 환경변수 가이드

### 9.1 공통 (기존 유지)

| 변수명 | 필수 | 설명 |
|---|---:|---|
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열 |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | 예 | MinIO 접근 정보 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET` | 예 | MinIO 자격증명, 버킷 (기본 `jarvis-files`) |
| `SESSION_SECRET` | 예 | 세션 서명 (32자 이상) |
| `OPENAI_API_KEY` | 예 | Analysis/Generation LLM 호출 |
| `ASK_AI_MODEL` | 아니오 | 기본 `gpt-5.4-mini` |
| `GRAPHIFY_BIN` | 아니오 | Graphify 바이너리 경로 (기본 `graphify`). 결정론적 — API 키 불필요 |
| `NODE_ENV` | 아니오 | `development`, `production` |

### 9.2 Wiki 파일시스템 / 피벗 관련 (신규)

| 변수명 | 기본 | 설명 |
|---|---|---|
| `WIKI_ROOT` | `./wiki` | 디스크 위키 저장 루트 (workspace별 하위 디렉터리) |
| `FEATURE_WIKI_FS_MODE` | `false` → `true` | 디스크/Git 모드 활성화 (피벗 main switch) |
| `FEATURE_PAGE_FIRST_QUERY` | `false` → `true` | `ask.ts`를 page-first navigation으로 |
| `FEATURE_RAW_CHUNK_QUERY` | `true` → `false` | (legacy, 사용 중지) 레거시 RAG 경로 비활성화 |
| `FEATURE_TWO_STEP_INGEST` | `false` → `true` | Two-Step CoT ingest (Analysis → Generation) |
| `FEATURE_WIKI_LINT_CRON` | `false` → `true` | 주간 lint 크론 |
| `FEATURE_GRAPHIFY_DERIVED_PAGES` | `true` | Graphify `wiki/auto/derived/code/**` 생성 |
| `LLM_DAILY_BUDGET_USD` | `100` | workspace당 일일 LLM 예산 상한 |
| `LLM_CACHE_TTL_SECONDS` | `2592000` | 프롬프트 캐시 TTL (30일) |

### 9.3 개발 환경 예시 `.env`

```env
DATABASE_URL=postgresql://jarvis:jarvispass@localhost:5436/jarvis

MINIO_ENDPOINT=localhost
MINIO_PORT=9100
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=jarvisadmin
MINIO_SECRET_KEY=jarvispassword
MINIO_BUCKET=jarvis-files

SESSION_SECRET=dev-session-secret-32-chars-min!!

OPENAI_API_KEY=sk-...
ASK_AI_MODEL=gpt-5.4-mini
GRAPHIFY_BIN=graphify

WIKI_ROOT=./wiki
FEATURE_WIKI_FS_MODE=true
FEATURE_PAGE_FIRST_QUERY=true
FEATURE_RAW_CHUNK_QUERY=false
FEATURE_TWO_STEP_INGEST=true
FEATURE_WIKI_LINT_CRON=true
FEATURE_GRAPHIFY_DERIVED_PAGES=true
LLM_DAILY_BUDGET_USD=100
LLM_CACHE_TTL_SECONDS=2592000
```

---

## 10. 빠른 시작

### 10.1 요구사항

- Node.js **22+**
- pnpm **9+**
- Docker / Docker Compose
- OpenAI API Key
- (선택) Graphify 네이티브 바이너리 — 코드 저장소 분석 시

### 10.2 저장소 준비

```bash
git clone https://github.com/qoxmfaktmxj/jarvis.git
cd jarvis
cp .env.example .env
# .env를 §9 가이드에 따라 보강
```

### 10.3 인프라 기동

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.dev.yml \
  up -d postgres minio
```

개발 환경 포트:

| 서비스 | 호스트 포트 |
|--------|------------|
| PostgreSQL | `5436` |
| MinIO API | `9100` |
| MinIO Console | `9101` |

### 10.4 의존성 + 마이그레이션

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
```

초기 PostgreSQL 확장은 `docker/init-db/01-extensions.sql`에서 준비됩니다 (`pg_trgm`, `unaccent`, 레거시 호환용 `pgvector`).

### 10.5 실행

```bash
pnpm dev                              # web + worker 동시 실행
pnpm --filter @jarvis/web dev         # 웹만 (포트 3010)
pnpm --filter @jarvis/worker dev      # 워커만 (pg-boss)
```

### 10.6 주요 스크립트

```bash
pnpm build
pnpm test
pnpm lint
pnpm type-check
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
node scripts/check-schema-drift.mjs   # Drizzle schema ↔ _journal drift 확인
```

CI/pre-commit에서는 blocking 모드 사용:

```bash
node scripts/check-schema-drift.mjs --ci          # CI (exit 1 on drift)
node scripts/check-schema-drift.mjs --precommit   # local pre-commit
```

---

## 11. 인증 / 인가 / 감사

### 11.1 인증

- 이메일+비밀번호 인증
- PostgreSQL `user_session` 테이블 세션 저장 + `sessionId` 쿠키

### 11.2 인가 (RBAC + sensitivity)

파일시스템에는 RBAC가 없으므로, **frontmatter + 서버 미들웨어 게이트**로 풀어냅니다.

```yaml
# wiki/{workspaceId}/auto/concepts/보안-정책.md 의 frontmatter 예시
---
title: "보안 정책"
type: concept
workspaceId: "uuid"
sensitivity: RESTRICTED          # PUBLIC | INTERNAL | RESTRICTED | SECRET_REF_ONLY
requiredPermission: "knowledge:read"
sources: ["raw_source_id_1"]
aliases: ["보안규정"]
authority: auto                   # auto | manual
linkedPages: ["인증-정책", "..."]
---
```

- 워크스페이스 격리: `wiki/{workspaceId}/` 별 독립 Git repo.
- 서버 API만 파일을 읽으며, 사용자는 웹 UI를 통해서만 접근.
- 모든 변경은 `wiki_commit_log`에 projection + 정기 S3 미러 백업.

### 11.3 Single-Writer + Git 규약

Git merge conflict는 **LLM lint가 해결하지 않습니다.** conflict 자체를 피합니다.

- workspace당 pg-boss singleton queue (concurrency=1)
- ingest 워커는 temp worktree에서 patch 생성 → validate → main에 fast-forward만 허용
- 실패 시 commit 없이 `ingest_dlq`로
- hourly squash 금지 (audit history rewrite 위험)
- git gc/pack은 주 1회 별도 크론 (mirror branch에서)

커밋 메시지 규약:

```
[ingest]    {sourceTitle} — N pages updated
[lint]      {date} — M issues flagged
[synthesis] {query snippet} → {page path}
[manual]    {author} — {reason}
```

---

## 12. 하네스 (Code + Knowledge)

Jarvis에는 두 개의 하네스가 있습니다.

| 하네스 | 규정 파일 | 역할 |
|--------|-----------|------|
| **코드 하네스** | [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) | 기능 구현 (방법론은 superpowers 플러그인에 위임 + 도메인 스킬 4개 — 2026-04-22 재편) |
| **지식 하네스** | [`WIKI-AGENTS.md`](WIKI-AGENTS.md) | LLM이 위키를 운영하는 규약 (4 오퍼레이션·auto/manual·single-writer·RBAC) |

**슬래시 커맨드 (Phase-W1에서 이식):**

- `/wiki-ingest {raw_source_id}` — Two-Step CoT ingest
- `/wiki-query {question}` — page-first navigation 답변
- `/wiki-lint` — 주간 lint 수동 실행
- `/wiki-graph {workspaceId}` — Graphify snapshot + 그래프 페이지 빌드

**자동화:** `.claude/settings.json` PostToolUse 훅이 Drizzle schema drift를 advisory로 감지. CI/pre-commit은 동일 스크립트(`scripts/check-schema-drift.mjs`)를 blocking 모드로 재사용.

---

## 13. 도입 로드맵

피벗 직후의 4-단계 로드맵입니다. 상세는 [`WIKI-AGENTS.md §10`](WIKI-AGENTS.md) 참조.

### Phase-W1 (이번 스프린트, ~5일)
1. `WIKI-AGENTS.md` 초안 (완료)
2. `packages/wiki-fs/` — 디스크 write + git commit + frontmatter parser + `[[wikilink]]` parser
3. `packages/wiki-agent/prompts/` — `reference_only/llm_wiki/`에서 Analysis/Generation 프롬프트 포팅
4. `.claude/commands/wiki-*.md` 4개 이식
5. `wiki_page_index`, `wiki_commit_log` 등 projection 테이블 마이그레이션

### Phase-W2 (~5일)
6. `ask.ts`를 `FEATURE_PAGE_FIRST_QUERY` 뒤로 분기 — page-first 구현
7. `ingest.ts`를 Two-Step CoT로 재작성 (multi-page update 포함)
8. workspace당 single-writer 큐 (pg-boss singleton)
9. `wiki-lint` 크론 잡
10. "Save as Page" 경로

### Phase-W3 (~3일)
11. manual/auto 경계 구현 + lint 규칙
12. Graphify `wiki/auto/derived/code/**` 격리
13. 기존 RAG 경로 `FEATURE_RAW_CHUNK_QUERY=false`로 비활성화
14. 운영 모니터링 + eval fixture를 page QA 기준으로 재구성

### Phase-W4 (안정화 후)
15. 페이지 500 돌파 시점에 qmd-MCP 도입 검토
16. 벡터 스키마 DROP 마이그레이션 (2~3 릴리스 안정 후)

---

## 14. MindVault 회귀 방지 체크리스트

MindVault가 실패한 조건이 Jarvis 초기 설계에 그대로 있었습니다. 각 체크포인트에서 통과 확인. (출처: [`WIKI-AGENTS.md §11`](WIKI-AGENTS.md))

- [ ] **LLM 합성 단계 존재** — ingest에 LLM 호출이 있고, tree-sitter/structure 추출만으로 끝나지 않는다
- [ ] **한 번의 ingest가 다수 페이지 업데이트** — 신규 1장만 만들고 끝나는 게 아니라 관련 페이지 10~15개를 동시 수정
- [ ] **한국어 동의어 매칭** — `aliases` frontmatter + `pg_trgm` + (필요시) qmd-MCP. "마인드볼트" ≠ "MindVault" 함정 회피
- [ ] **교차 참조 자동 유지** — `[[wikilink]]` 자동 생성·검증·lint
- [ ] **모순 플래그** — lint 잡이 contradictions 탐지 후 `wiki_review_queue`로
- [ ] **페이지가 1급 시민** — 청크가 아니라 페이지가 답변 소스
- [ ] **auto/manual 분리** — 사람 편집이 묻히지 않는다
- [ ] **컨텍스트 품질 측정** — 답변에 관련없는 페이지가 top-5에 오면 알람

이 8항 중 **하나라도 통과 못 하면 MindVault 재현 위험**으로 보고 피벗을 되돌리는 것이 맞습니다.

---

## 15. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| `WIKI-AGENTS.md` v1 초안 | 완료 (2026-04-15) |
| 구 RAG README 아카이브 | 완료 (`docs/_archive/2026-04-pivot/`) |
| `packages/wiki-fs/` | 착수 전 (Phase-W1) |
| `packages/wiki-agent/` | 착수 전 (Phase-W1) |
| projection 테이블 마이그레이션 | 착수 전 (Phase-W1) |
| Page-first Query (`ask.ts`) | 착수 전 (Phase-W2) |
| Two-Step CoT Ingest | 착수 전 (Phase-W2) |
| Single-writer 큐 | 착수 전 (Phase-W2) |
| wiki-lint 크론 | 착수 전 (Phase-W2) |
| auto/manual 경계 | 착수 전 (Phase-W3) |
| 레거시 RAG 비활성화 | 착수 전 (Phase-W3) |
| 벡터 스키마 DROP | 착수 전 (Phase-W4) |
| 기존 업무 시스템 (프로젝트·근태·디렉터리) | 유지 — 피벗 영향 범위 밖 |
| RBAC / sensitivity | 유지 — frontmatter 통합 예정 |
| Graphify 파이프라인 | 유지 — `wiki/auto/derived/code/**` 격리로 재구성 |

---

## 16. 참고 문서

| 주제 | 경로 |
|------|------|
| 지식 하네스 (SSoT) | [`WIKI-AGENTS.md`](WIKI-AGENTS.md) |
| 코드 하네스 (Claude Code) | [`CLAUDE.md`](CLAUDE.md) |
| 코드 하네스 (Codex) | [`AGENTS.md`](AGENTS.md) |
| 구 RAG 시대 README | [`docs/_archive/2026-04-pivot/README.rag-era.md`](docs/_archive/2026-04-pivot/README.rag-era.md) |
| 피벗 분석 기록 | [`docs/analysis/`](docs/analysis/) |
| Karpathy 원 gist | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| `reference_only/llm_wiki/` *(로컬 전용)* | Tauri 구현체 (프롬프트·파일 포맷 포팅 대상) |
| `reference_only/llm-wiki-agent/` *(로컬 전용)* | Claude Code 스킬 (`.claude/commands/` 포팅 대상) |
| `reference_only/graphify/` *(로컬 전용)* | 네이티브 바이너리 (통합 완료) |
| `reference_only/qmd/` *(로컬 전용)* | 500+ 페이지 규모 시 도입 후보 |
| `reference_only/mindvault/` *(로컬 전용)* | **실패 경고 사례** (2026-04-14 폐기, 함정 분석용) |

> **참고:** `reference_only/` 폴더는 로컬 개발 머신의 `C:\Users\kms\Desktop\dev\reference_only\`에 위치하며, 저장소에 포함되지 않습니다. 외부 참조 레포 5개(합계 수백 MB)를 분석·포팅 원본으로만 사용하고, 라이선스·유지보수 비용 때문에 서브모듈로 편입하지 않습니다.

---

## 17. 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-04-15 | README 전면 재작성 — "RAG 6-레인 포털"에서 "LLM Wiki 컴파일 시스템"으로 정체성 재정의 | Karpathy LLM Wiki 방향 피벗 확정. `WIKI-AGENTS.md` v1과 정합성 정렬. 구 README는 `docs/_archive/2026-04-pivot/README.rag-era.md`에 보존. MindVault 실패 회귀 방지 체크리스트 명시. |
