---
name: jarvis-architecture
description: Jarvis(사내 업무 시스템 + LLM 컴파일 위키)의 모노레포 구조·기술 스택·모듈 경계·핵심 파이프라인(tool-use agent Ask AI, wiki-fs SSoT) + 영향도 체크리스트(17계층) · 파일 변경 순서(20단계) · 검증 게이트 명령을 정리한 아키텍처 레퍼런스. Jarvis 기능 작업의 사실상 진입점이며, `jarvis-feature` 오케스트레이터와 superpowers 워크플로우(writing-plans / subagent-driven-development / verification-before-completion) 모두 이 스킬의 섹션들을 컨텍스트로 주입한다. Jarvis 프로젝트에서 기능을 추가·수정하거나, 어느 패키지·어느 라우트에 코드를 넣을지 결정하거나, Ask AI/위키/권한/워커 잡 맥락이 필요할 때 반드시 이 스킬을 먼저 로드하라. "구조 알려줘", "어디에 넣지", "아키텍처 맥락" 같은 표현에서도 트리거된다.
---

# Jarvis Architecture Reference

Jarvis는 사내 업무 시스템(근태·프로젝트·공지·추가개발 등) + **Karpathy 방식 LLM 컴파일 위키** + Ask AI(RAG 아님, page-first)를 하나의 TypeScript 모노레포로 통합한 사내 포털이다. 이 문서는 "어느 파일이 어느 책임을 지는가"를 빠르게 파악하기 위한 레퍼런스.

## 모노레포 레이아웃

```
jarvis/
├─ apps/
│  ├─ web/          # Next.js 15 App Router (port 3010)
│  │  ├─ app/
│  │  │  ├─ (app)/       # 인증 필요 라우트 그룹
│  │  │  ├─ (auth)/      # 로그인 등 공개 라우트
│  │  │  ├─ actions/     # 도메인 횡단 server action (공유)
│  │  │  ├─ api/         # REST endpoint (route.ts)
│  │  │  ├─ middleware.ts
│  │  │  └─ forbidden.tsx
│  │  ├─ components/     # 전역 공통 UI
│  │  ├─ lib/            # 웹 전용 서버 헬퍼·쿼리·auth 브리지
│  │  ├─ messages/       # next-intl ko.json (단일 로케일)
│  │  ├─ i18n/
│  │  └─ e2e/            # Playwright
│  └─ worker/            # pg-boss 워커 (독립 프로세스)
│     └─ src/jobs/       # ingest/, embed, compile, wiki-*, stale-check, ...
├─ packages/             # **8개** (web + worker 공유)
│  ├─ ai/                # Ask AI 파이프라인 (router, page-first, tutor, 6 contexts)
│  ├─ auth/              # 세션, RBAC, sensitivity 헬퍼
│  ├─ db/                # Drizzle schema (31 파일, 52 테이블) + migrations + seed
│  ├─ search/            # 하이브리드 검색 어댑터 (FTS/trigram/RRF), precedent 독립 검색
│  ├─ secret/            # 비밀번호 직접 저장 대신 SecretRef
│  ├─ shared/            # PERMISSIONS 상수, Zod validation, 공통 타입
│  ├─ wiki-fs/           # 디스크 I/O + Git 커밋 (**SSoT**). reader/writer/git/frontmatter/wikilink/worktree
│  └─ wiki-agent/        # LLM prompt builder / parser (stateless). ingest two-step CoT용
├─ docker/               # compose + Dockerfiles + cli-proxy 게이트웨이
├─ docs/                 # plan/, spec/, adr/, _archive/
└─ scripts/              # check-schema-drift, wiki-check, audit-rsc, eval-budget-test
```

## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 모노레포 | pnpm workspace + Turborepo | `pnpm dev`, `pnpm build` |
| 프레임워크 | Next.js 15 App Router + React 19 | server actions |
| DB | PostgreSQL 16 + Drizzle | `pgvector`, `pg_trgm`, `unaccent` |
| 세션 | PostgreSQL `user_session` (쿠키 `sessionId`) | Redis 제거됨 (2026-04 refactor) |
| 캐시 | `embed_cache` 테이블 + in-memory Map + permissionFingerprint ACL 격리 | pg-boss `cache-cleanup` (6h) |
| 오브젝트 스토리지 | MinIO | 버킷 `jarvis-files` |
| 잡 큐 | pg-boss | 워커 독립 프로세스 |
| LLM | **CLIProxyAPI 게이트웨이** (docker/cli-proxy) → Anthropic/OpenAI | subscription/플랜 중개, budget 게이트 |
| 임베딩 | **제거됨** (Phase D+E, 2026-04) — `packages/ai/embed.ts` @deprecated | 신규 Ask AI는 tool-use agent, embedding 없음 |
| 인증 | 이메일+비밀번호 (PostgreSQL 세션) | |
| i18n | next-intl 단일 로케일(`ko`) | `apps/web/messages/ko.json` |
| 테스트 | Vitest + Playwright | `pnpm test`, `pnpm --filter @jarvis/web exec playwright test` |
| 스타일 | Tailwind CSS 4 | 디자인 재구성 예정 |

## 핵심 도메인 (31 스키마 파일 · 52 테이블)

`packages/db/schema/*.ts`. 대분류:

| 도메인 | 파일 | 핵심 테이블 | sensitivity |
|--------|------|-----------|-------------|
| **Knowledge** (사내 위키 본체) | `knowledge.ts`, `review.ts` | knowledge_page, knowledge_page_version, knowledge_claim, owner, tag, review_request | **Yes** (PUBLIC/INTERNAL/RESTRICTED/SECRET_REF_ONLY) |
| **Wiki-fs projection** | `wiki-page-index.ts`, `wiki-page-link.ts`, `wiki-page-source-ref.ts`, `wiki-commit-log.ts`, `wiki-lint-report.ts`, `review-queue.ts` (wiki_review_queue 포함) | wiki_page_index, wiki_page_link, wiki_commit_log, wiki_review_queue, wiki_lint_report | Yes (page-level) |
| **Ask AI** | `ask-conversation.ts`, `feedback.ts`, `directory.ts`, `llm-call-log.ts` | ask_conversation, ask_message, answer_feedback, directory_entry, llm_call_log | No (knowledge layer 경유) |
| **Project & Work** | `project.ts`, `additional-development.ts` | project, project_task, project_inquiry, project_staff, additional_development(+ effort/revenue/staff) | No |
| **System Registry** | `system.ts` | system, system_access | Yes (INTERNAL/RESTRICTED) |
| **Case/Precedent** | `case.ts` | precedent_case, case_cluster | Yes (독립 임베딩 공간) |
| **Graph** | `graph.ts` | graph_snapshot, graph_node, graph_edge, graph_community | Yes |
| **HR/근태** | `attendance.ts` | attendance, out_manage, out_manage_detail | No |
| **Notice** | `notice.ts` | notice | Yes (PUBLIC/INTERNAL) |
| **File** | `file.ts` | raw_source, attachment | Yes |
| **Audit/Search/Master** | `audit.ts`, `search.ts`, `menu.ts`, `code.ts`, `company.ts`, `tenant.ts`, `user.ts` | audit_log, search_log, search_synonym, popular_search, menu_item, code_group/item, company, workspace, organization, user, role, permission, user_role, role_permission | 일부 (e.g. graph) |
| **Infra** | `embed-cache.ts`, `user-session.ts` | embed_cache, user_session | No |

> 스키마 파일이 29→31개로 늘어나는 중(진행형). 추가 도메인 다룰 때는 실제 `packages/db/schema/index.ts`를 먼저 확인.

## Ask AI 파이프라인 (tool-use agent · Karpathy LLM Wiki 패턴)

**중요:** 과거의 "6-lane 라우터 + page-first retrieval" 설계는 **Phase A–G(2026-04) 완료로 tool-use agent로 전환됨**. embedding RAG·벡터 유사도·`FEATURE_PAGE_FIRST_QUERY` 플래그는 모두 제거됨. 진행 계획: [`docs/superpowers/plans/2026-04-23-ask-harness-transition.md`](../../../docs/superpowers/plans/2026-04-23-ask-harness-transition.md).

### 1. Tool-use Agent Loop (`packages/ai/agent/`)

사용자 질문을 받으면 LLM이 아래 4개 도구를 직접 호출하며 위키를 탐색한다:

| function name | 역할 |
|--------------|------|
| `wiki_grep` | 키워드로 페이지 후보 찾기 (제목·slug·content, pg_trgm) |
| `wiki_read` | slug로 디스크 본문 읽기 (wiki-fs 경유) |
| `wiki_follow_link` | `[[wikilink]]` 1-hop 추적 |
| `wiki_graph_query` | graphify 그래프 쿼리 (커뮤니티·경로, `GRAPH_REPORT.md` 활용) |

4개 도구는 모두 **`withSensitivityFilter`** (`packages/ai/agent/tools/sensitivity-filter.ts`)로 감싸진다. 래퍼는 `workspaceId + userId + sensitivity` 레벨을 쿼리 WHERE 절에서 집행 — 앱 레벨 필터 대체 불가. Phase A 핵심 deliverable.

```
사용자 질문
  → wiki_grep (3~5 후보)
  → wiki_read (top 1~2 본문)
  → (필요시) wiki_follow_link / wiki_graph_query 확장
  → LLM 답변 (최대 MAX_TOOL_STEPS=8 tool call, 초과 시 abort)
  → [[slug]] citation 포함 SSE 스트리밍
```

- **`MAX_TOOL_STEPS = 8`** (`packages/ai/agent/ask-agent.ts:20`)
- 시스템 프롬프트가 `[[slug]]` citation 필수 + 근거 부족 시 추측 금지 강제
- **SSE adapter** (`packages/ai/agent/sse-adapter.ts`): `AskAgentEvent` → `SSEEvent` 변환, `wiki_read` 결과를 slug 기준 dedup 후 `sources` 배열로 harvest
- **`askAI`** (`packages/ai/ask.ts`): budget tracking / `logLlmCall` / 캐시 키 배선 유지하는 얇은 래퍼, 내부적으로 `askAgentStream`에 위임
- **`apps/web/app/api/ask/route.ts`**: 미변경 — HTTP 계약 안정
- **`apps/web/components/ai/AnswerCard.tsx`**: `[[slug]]` citation 렌더링

### 2. 레거시 상태 (burn-in 대기)

`packages/ai/router.ts` (6-lane 라우터)와 `retrieveRelevant*` 함수는 `@deprecated` 배너가 붙어 있으며, 1주 burn-in 후 삭제 예정. 신규 코드는 `packages/ai/agent/**`만 참조할 것. `generateEmbedding` / `embed_cache` 쓰기 경로 / HNSW 인덱스 / `FEATURE_PAGE_FIRST_QUERY` 플래그는 모두 제거 완료.

## Wiki-fs SSoT 모델 (Karpathy 방식)

**디스크가 SSoT, DB는 projection only.**

```
wiki/{workspaceId}/
├─ auto/              ← LLM 독점 편집. UI는 viewer 전용.
│  ├─ sources/           원본 문서 요약
│  ├─ entities/          인물·조직·시스템
│  ├─ concepts/          개념·정책
│  ├─ syntheses/         Ask AI "Save as Page"
│  ├─ cases/             사례 요약
│  ├─ playbooks/         업무 플레이북
│  ├─ reports/           정기 리포트
│  ├─ onboarding/        온보딩 트랙
│  └─ derived/code/      Graphify 결과 (격리)
├─ manual/            ← 사람 편집(admin/editor). LLM은 Read only.
│  ├─ overrides/         법무·보안 예외
│  └─ notes/             관리자 해설
├─ _system/           ← 린트·감사 자동 생성
├─ _archive/          ← projection 제외
├─ index.md           ← auto 카탈로그
└─ log.md             ← auto 시간순 로그
```

- 경로 조립은 `resolveWikiPath({ workspaceId, zone, subdir, slug })` 헬퍼만 사용(문자열 concat 금지)
- Git 커밋은 `packages/wiki-fs/git.ts`의 `GitRepo`·`commitPatch` 경유
- DB(`wiki_page_index`, `wiki_page_link` 등)는 **워커 동기화 잡만** INSERT/UPDATE. UI server action은 INSERT 금지(조회만)
- 본문 쓰기는 절대 `wiki_page_index.body` 컬럼으로 가지 않음(디스크가 SSoT)

상세 워크플로우와 위반 패턴은 `jarvis-wiki-feature` 스킬.

## Ingest 4단계 분해 (`apps/worker/src/jobs/ingest/`)

raw_source 1건을 Two-Step CoT로 다수 페이지에 반영:

```
ingest (pg-boss 핸들러)
  ├─ analyze         Step A: 소스 분석 → JSON (keyEntities, keyConcepts, findings, contradictions)
  ├─ generate        Step B: 분석 + 기존 페이지 → 새 wiki 페이지 콘텐츠 생성 (LLM)
  ├─ write-and-commit wiki-fs로 디스크 write + git commit + wiki_commit_log
  └─ review-queue    민감/충돌/PII 감지 시 wiki_review_queue 기록
```

프롬프트 빌더·파서는 `packages/wiki-agent/src/prompts/*` + `parsers/*`. `PROMPT_VERSION` 상수로 스냅숏 관리.

## 주요 패턴

### 1. 페이지 구조 (Next.js App Router)

```
apps/web/app/(app)/{domain}/
├─ page.tsx              # Server Component
├─ layout.tsx            # (선택)
├─ actions.ts            # "use server" 서버 액션
├─ _components/          # 해당 페이지 전용 client component ("use client")
└─ [id]/
   ├─ page.tsx
   └─ edit/page.tsx
```

- `(app)`=인증 필요, `(auth)`=공개
- `_components` 언더스코어 접두사로 라우트에서 제외
- 전역 공통은 `apps/web/components/`
- 도메인 횡단 server action은 `apps/web/app/actions/`

**현재 도메인 라우트:** `admin`, `architecture`, `ask`, `attendance`, `dashboard`, `infra`, `knowledge`, `notices`, `profile`, `projects`, `search`, `systems`, `wiki`.

### 2. 서버 액션 컨벤션

권한 기반 도메인(knowledge, project, system 등):
```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export async function pinPage(pageId: string): Promise<{ ok: boolean; pinnedAt: string | null }> {
  const session = await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  // workspace + sensitivity 필터 필수
}
```

세션 기반 도메인(ask, feedback 등):
```ts
"use server";
import { requireSession } from "@jarvis/auth";

export async function listConversations() {
  const session = await requireSession();
  // workspaceId + userId 이중 필터
}
```

**필수:** 반환 타입 명시 · null/undefined 구별 · sensitivity 컬럼이 있는 엔티티는 쿼리 레벨 필터.

### 3. 권한 (RBAC + sensitivity)

- `packages/shared/constants/permissions.ts`에 **PERMISSIONS 34종** 정의 (KNOWLEDGE_*, PROJECT_*, SYSTEM_*, ATTENDANCE_*, NOTICE_*, ADDITIONAL_DEV_*, GRAPH_*, USER_*, AUDIT_READ, ADMIN_ALL, FILES_WRITE, SYSTEM_ACCESS_SECRET)
- `ROLE_PERMISSIONS` 매핑: **5역할** (ADMIN, MANAGER, DEVELOPER, HR, VIEWER)
  - DEVELOPER는 의도적으로 `KNOWLEDGE_REVIEW` 제외 → wiki_page_index sensitivity=RESTRICTED 페이지 차단 (필요 시 MANAGER 추가 부여)
  - `SYSTEM_ACCESS_SECRET`는 DEVELOPER에 명시적 허용 (credential 접근)
- sensitivity는 `packages/auth/rbac.ts`의 `canAccessKnowledgeSensitivity` + 쿼리 레벨 `buildLegacyKnowledgeSensitivitySqlFilter` 병용 (legacy 필터는 Phase-W4까지)

### 4. 하이브리드 검색 (`packages/search`)

`SearchAdapter` 추상화. `pg-search.ts`는 FTS + trigram + 동의어 → RRF(Reciprocal Rank Fusion) 병합. `precedent-search.ts`는 **독립 벡터 공간**(TF-IDF+SVD) on precedent_case — pg-search와 절대 혼합 금지. freshness/popularity 보정은 `hybrid-ranker.ts`.

### 5. i18n

- 단일 로케일 `ko`. `apps/web/i18n/request.ts`가 `locale='ko'` 하드코딩
- `apps/web/messages/ko.json`에 네임스페이스(`Domain.Section.key`) 구조
- 보간 변수 `{count}`, `{name}` 등 양쪽 일치
- 상세는 `jarvis-i18n` 스킬

### 6. 워커 잡 & 스케줄 (`apps/worker/src/index.ts`)

| 잡 | 트리거 | 역할 |
|----|--------|------|
| `ingest` (+ 4 서브) | 웹 API (raw_source 업로드) | Two-Step CoT → wiki 페이지 생성 |
| `embed` | ~~on-demand~~ | **@deprecated** — Phase D+E에서 제거됨. 신규 코드 참조 금지 |
| `compile` | on-demand | page summary 생성 |
| `graphify-build` | 수동 | 아키텍처 그래프 렌더링 |
| `wiki-bootstrap` | 수동(CLI) | wiki-fs 초기화 |
| `wiki-lint` | 수동/플래그 | frontmatter · wikilink 정합성 |
| `check-freshness` (stale) | **cron `0 9 * * *`** | freshness SLA 초과 페이지 → audit_log |
| `aggregate-popular` | **cron `0 0 * * 0`** (일요일 00:00) | 인기 검색어 집계 |
| `cleanup` | **cron `0 0 1 * *`** (매월 1일) | audit_log / version 아카이빙 |
| `cache-cleanup` | 6시간마다 | 세션 정리 (embed_cache 쓰기는 @deprecated) |

## 주요 명령어

```bash
# 개발
pnpm dev                              # web + worker 동시
pnpm --filter @jarvis/web dev
pnpm --filter @jarvis/worker dev

# 타입/린트/테스트
pnpm type-check
pnpm --filter @jarvis/web type-check  # 빠른 범위
pnpm --filter @jarvis/web lint
pnpm test
pnpm --filter @jarvis/web exec playwright test

# DB
pnpm db:generate                      # schema → migration 자동
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm db:push                          # prod 직접 push (주의)

# 검증 스크립트
node scripts/check-schema-drift.mjs --hook        # 훅 (advisory)
node scripts/check-schema-drift.mjs --precommit   # blocking
pnpm wiki:check                                   # wiki-fs ↔ DB projection drift
pnpm audit:rsc                                    # RSC boundary 위반 감지
pnpm eval:budget-test                             # LLM budget 검증
```

## 인프라 포트 (개발)

| 서비스 | 호스트 포트 |
|-------|------------|
| Next.js web | 3010 |
| PostgreSQL | 5436 |
| MinIO API | 9100 |
| MinIO Console | 9101 |
| cli-proxy | docker-compose에 정의 |

## 자주 혼동되는 것

- **`apps/web/lib/` vs `packages/*`** — 전자는 웹 앱 전용(다른 앱 import 불가), 후자는 web+worker 공유
- **server action vs route handler** — 폼/내부 mutation은 server action, 외부 호출 REST는 `route.ts`
- **`components/` vs `_components/`** — 전자는 전역 공통, 후자는 페이지 전용
- **`wiki-fs` vs `wiki-agent`** — wiki-fs는 **디스크 I/O + git**(stateful), wiki-agent는 **LLM prompt/parser**(stateless). 절대 서로 섞지 말 것
- **`knowledge_page` vs `wiki_page_index`** — 전자는 레거시 Knowledge 도메인, 후자는 Karpathy wiki-fs projection. 현재 이행 중이라 두 테이블이 공존
- **`review_request` vs `review_queue` vs `wiki_review_queue`** — knowledge 수동 리뷰 / PII·Secret 큐 / wiki 도메인 전용 큐 (3개 모두 다른 책임)
- **Drizzle 마이그레이션** — 수동으로 `drizzle/*.sql` 편집 금지, 반드시 `pnpm db:generate`

## 영향도 체크리스트 (계획 단계)

기능 작업 계획을 짤 때 아래 모든 계층을 빠짐없이 확인한다. superpowers:writing-plans 실행 시 plan 문서에 각 계층의 변경 여부(해당 없음도 명시)를 반드시 포함한다.

| 계층 | 확인 질문 | 파일 위치 |
|------|----------|-----------|
| DB 스키마 | 31개 파일 중 어디? 테이블/컬럼/인덱스? 마이그레이션 필요? | `packages/db/schema/*.ts`, `packages/db/drizzle/` |
| Validation | Zod 스키마 추가/수정? | `packages/shared/validation/*.ts` |
| 권한 (34 상수) | 기존 재사용? 새 PERMISSION 필요? 5 역할 매핑? | `packages/shared/constants/permissions.ts`, `packages/auth/rbac.ts` |
| 세션 vs 권한 모델 | Ask AI류(세션+user) vs Knowledge류(requirePermission)? | `packages/auth/session.ts` |
| Sensitivity 필터 | 쿼리 WHERE에 sensitivity 절 넣는가? (앱 레벨 필터 금지) | `packages/auth/rbac.ts` |
| Ask AI / tool-use agent | agent 도구(wiki_grep/read/follow_link/graph_query) 변경? sensitivity-filter 영향? SSE adapter 영향? | `packages/ai/agent/**`, `packages/ai/ask.ts` |
| Wiki-fs (Karpathy) | auto/manual 경계 유지? wiki-fs API 경유? DB projection only? | `packages/wiki-fs/`, `packages/wiki-agent/`, `wiki/{ws}/**` |
| 검색 | pg-search(knowledge) vs precedent-search(case) 어느 쪽? 혼합 금지 | `packages/search/` |
| 서버 액션/API | 어느 파일에 생성? 응답 shape? | `apps/web/app/(app)/{domain}/**/actions.ts`, `app/api/**/route.ts`, `app/actions/` |
| 서버 로직 (lib) | 쿼리 추가? 기존 lib 재사용? | `apps/web/lib/` |
| UI 라우트 | `(app)` / `(auth)` 어느 그룹? 도메인? | `apps/web/app/(app)/{domain}/` |
| UI 컴포넌트 | 페이지 전용 `_components/`? 전역 `components/`? RSC vs client? | `apps/web/app/(app)/**/_components/`, `apps/web/components/` |
| i18n 키 | ko.json 어느 네임스페이스? 보간 변수? | `apps/web/messages/ko.json` |
| 테스트 | unit(Vitest)? integration(worker)? e2e(Playwright)? | `*.test.ts`, `apps/web/e2e/`, `apps/worker/eval/` |
| 워커 잡 | 새 잡? ingest 4단계 영향? cron 스케줄? | `apps/worker/src/jobs/`, `apps/worker/src/jobs/ingest/`, `apps/worker/src/index.ts` |
| LLM 호출 | CLIProxyAPI 경유? `llm_call_log` 기록? budget 영향? | `packages/ai/router.ts`, `docker/cli-proxy/`, `packages/ai/budget.ts` |
| Audit | mutation이면 `audit_log` 기록 + 트랜잭션 | `packages/db/schema/audit.ts` |

## 파일 변경 순서 (구현 의존성)

한 기능이 여러 계층을 건드릴 때는 아래 순서를 따른다. superpowers:subagent-driven-development의 implementer 서브에이전트가 task를 쪼갤 때 이 순서를 지키도록 plan 단계에서 명시.

```
 1. packages/db/schema/*.ts                 (스키마)
 2. pnpm db:generate                        (마이그레이션 생성)
 3. packages/shared/validation/*.ts         (Zod 입출력 스키마)
 4. packages/shared/constants/permissions.ts (권한 상수 + ROLE_PERMISSIONS 매핑)
 5. packages/auth/rbac.ts, session.ts       (권한/세션 헬퍼 — 필요 시만)
 6. packages/secret/*                        (SecretRef — 필요 시)
 7. packages/wiki-fs/src/**                 (디스크 I/O + git) ← stateful
 8. packages/wiki-agent/src/**              (LLM prompt/parser) ← stateless
 9. packages/ai/**                          (router, page-first, ask, tutor, 6 contexts)
10. packages/search/**                      (FTS/trigram/precedent 독립)
11. apps/web/lib/**                         (웹 전용 쿼리/헬퍼)
12. apps/web/app/actions/**                 (도메인 횡단 server action)
13. apps/web/app/(app)/**/actions.ts        (도메인별 server action)
14. apps/web/app/api/**/route.ts            (REST endpoint — 필요 시)
15. apps/web/app/(app)/**/page.tsx          (Server Component)
16. apps/web/app/(app)/**/_components/*.tsx (Client Component)
17. apps/web/messages/ko.json               (i18n — 배치 처리)
18. apps/worker/src/jobs/ingest/*.ts        (ingest 4단계 — 필요 시)
19. apps/worker/src/jobs/*.ts + index.ts    (기타 워커 잡 + 스케줄 등록)
20. 테스트 파일 (*.test.ts, e2e/*.spec.ts, worker/eval/)
```

**i18n은 반드시 마지막 배치.** 모든 UI를 완성한 뒤 필요한 키를 한 번에 추가해야 누락이 없다.

**stateful/stateless 경계:** `wiki-fs`는 디스크·git 부작용만, `wiki-agent`는 프롬프트·파서만. 둘을 섞지 말 것(`jarvis-wiki-feature` 스킬 3.1/3.2 참조).

## 검증 게이트 명령 (완료 전 필수 실행)

superpowers:verification-before-completion 실행 시, Jarvis 도메인 변경에는 아래 게이트를 함께 통과시킨다. "언제 필수인지"를 함께 명시 — 변경 범위 밖의 게이트까지 모두 돌릴 필요는 없다.

| 명령 | 언제 필수 | 게이트 성격 |
|------|----------|-----------|
| `pnpm --filter @jarvis/web type-check` | 모든 web 변경 | 타입 안전성 |
| `pnpm --filter @jarvis/web lint` | 모든 web 변경 | 린트 |
| `pnpm test` (범위 좁혀) | 해당 범위 unit 테스트가 있으면 | TDD red-green 확인 |
| `pnpm db:generate` + `node scripts/check-schema-drift.mjs --precommit` | 스키마 변경 시 | 마이그레이션·drift 블로킹 |
| `pnpm wiki:check` | `packages/wiki-fs/**`, `packages/wiki-agent/**`, `apps/worker/src/jobs/ingest/**`, `wiki_*` 테이블, `wiki/**` 중 하나라도 변경 | wiki-fs ↔ DB projection(`commitSha` 등) 무결성 |
| `pnpm audit:rsc` | RSC/client 컴포넌트 이동·추가, `use server`/`use client` 경계 변경 | RSC boundary 위반 감지 |
| `pnpm eval:budget-test` | `packages/ai/**`, `apps/worker/src/jobs/ingest/**`, 프롬프트/LLM 호출 경로 변경 | LLM 예산 regression |
| `pnpm --filter @jarvis/web exec playwright test` | UI 라우트/인증 플로우 변경 | e2e (시간 소요 큼, PR 직전에만) |

**일반 원칙:** 변경 범위가 좁으면 해당 게이트만 실행. 범위가 wiki + ai + RSC를 넘나들면 여러 게이트를 병렬로. 게이트 하나라도 실패하면 "완료" 주장을 철회하고 근본 원인을 해결한다(우회 금지).

## 상태 / 진행 중 이슈

- **디자인 재구성 예정** — Tailwind 스타일에 시간 쓰지 말 것
- **Phase-W4: 레거시 RAG 경로 폐지 중** — `document_chunks`, `knowledge_claim.embedding` DROP 마이그레이션 대기. Ask AI embedding 경로는 Phase D+E에서 이미 제거 완료
- **`systems` → `projects` 라우트 이행** — 최근 rename 완료, 잔존 참조 확인 필요
- **Redis 제거 완료** — 세션은 PostgreSQL `user_session`, 캐시는 `embed_cache` + in-memory
- **CLIProxyAPI 게이트웨이** — 외부 LLM 호출은 `packages/ai/agent/ask-agent.ts` → docker cli-proxy → OpenAI (`packages/ai/router.ts`는 @deprecated)
- **5000명 엔터프라이즈 스케일, 1주 스프린트** — 속도 우선, 품질 유지

## 그리드 표준 화면 (대량 데이터 마스터)

다량의 행 데이터를 표시·편집하는 모든 화면은 **DataGrid baseline**을 따른다. 시각·동작 표준은 `admin/companies` 화면을 reference implementation으로 하며, 모든 새 그리드는 이 표준에 1:1 부합해야 한다. 행 ≥ 20건이면 무조건 그리드 채택 — 카드형/모달폼 X.

### 1. baseline 컴포넌트 위치

**공유 그리드 인프라** (`apps/web/components/grid/`):
- [`DataGrid.tsx`](../../../apps/web/components/grid/DataGrid.tsx) — 메인 orchestrator. 모든 도메인은 `<DataGrid<DomainRow>>`로 wrapping
- [`DataGridToolbar.tsx`](../../../apps/web/components/grid/DataGridToolbar.tsx) — 좌측 children 슬롯 + 우측 Excel export 버튼
- [`GridToolbar.tsx`](../../../apps/web/components/grid/GridToolbar.tsx) — DataGrid 내부 [입력]/[복사]/[저장(N)] 툴바
- [`useGridState.ts`](../../../apps/web/components/grid/useGridState.ts) — `clean/new/dirty/deleted` 행 상태 훅. generic `<T extends { id: string }>`
- [`ColumnFilterRow.tsx`](../../../apps/web/components/grid/ColumnFilterRow.tsx) — 헤더 아래 필터 row
- [`RowStatusBadge.tsx`](../../../apps/web/components/grid/RowStatusBadge.tsx) — NEW/DIRTY/DELETED 시각 배지
- [`UnsavedChangesDialog.tsx`](../../../apps/web/components/grid/UnsavedChangesDialog.tsx) — 미저장 변경 confirm
- [`cells/Editable{Text,TextArea,Select,Date,Boolean,Numeric}Cell.tsx`](../../../apps/web/components/grid/cells/) — 인라인 편집 셀 6종
- [`utils/excelExport.ts`](../../../apps/web/components/grid/utils/excelExport.ts) — Excel 내보내기 유틸
- [`utils/makeHiddenSkipCol.ts`](../../../apps/web/components/grid/utils/makeHiddenSkipCol.ts) — ibsheet Hidden 정책 호환
- [`EmployeePicker.tsx`](../../../apps/web/components/grid/EmployeePicker.tsx) — 사번 자동완성
- [`CodeGroupPopupLauncher.tsx`](../../../apps/web/components/grid/CodeGroupPopupLauncher.tsx) — 코드그룹 팝업

**도메인 wrapping 규칙**: 도메인별로 `apps/web/app/(app)/{domain}/_components/{Domain}GridContainer.tsx` 1개. 컬럼/필터 정의 + reload + handleSave + handleExport만 책임지고 그리드 본체 로직은 무조건 baseline 호출.

### 2. 필수 기능 (모든 그리드 7+1가지)

1. **인라인 편집** — 셀 클릭→편집, Enter/blur=commit, Esc=취소. 모달 폼 별도 사용 금지
2. **행 단위 dirty tracking** — clean/new/dirty/deleted 4 상태, RowStatusBadge로 시각화
3. **GridToolbar (DataGrid 내부)** — [입력] / [복사] / [저장 (N)] 3 버튼 고정
4. **컬럼 헤더 아래 필터 row** — type별 셀렉트/텍스트
5. **서버 페이징** — `page`/`limit`, default `limit=50`. 무한 스크롤 금지
6. **미저장 변경 confirm dialog** — 페이지 이동/필터 변경/네비게이션 시 `UnsavedChangesDialog`
7. **server action batch save** — `{ creates, updates, deletes }` 한 트랜잭션 + audit_log insert
8. **DataGridToolbar (외부 toolbar)** — Excel 다운로드 버튼 + 도메인 검색 입력(필요 시)

### 3. 디자인 토큰 (변경 금지)

| 항목 | 값 |
|---|---|
| 행 높이 | 32px (compact) |
| 셀 padding | x=8px y=4px |
| 헤더 폰트 | 11px semibold uppercase tracking-wide `text-slate-600` |
| 셀 폰트 | 13px `text-slate-900` |
| 헤더 배경 | `bg-slate-50` |
| 테두리 | `border-slate-200` |
| hover 행 | `bg-slate-50` |
| selected 행 | `bg-blue-50/40` |
| 편집 셀 ring | `ring-2 ring-blue-500 inset` |
| sticky 헤더 | `top-0 z-10` (필터 row가 그 아래 sticky) |
| 폰트 패밀리 | Inter |

**상태 배지 색상**:
- NEW: `bg-blue-100 text-blue-700`
- DIRTY: `bg-amber-100 text-amber-700`
- DELETED: `bg-rose-100 text-rose-700` + `line-through`

### 4. 버튼 표준화

| 버튼 | 위치 | 라벨 i18n 키 | variant | 상태별 텍스트 |
|---|---|---|---|---|
| 엑셀 다운로드 | 외부 DataGridToolbar 우측 (`ml-auto`) | `Sales.Common.Excel.button` / `.downloading` | `outline` size `sm` | 진행 중엔 `t("Excel.downloading")` 토글 |
| 입력(신규 행) | DataGrid 내부 GridToolbar 좌측 | `Common.Grid.insert` | `outline` | — |
| 복사 | GridToolbar 좌측 | `Common.Grid.copy` | `outline` | 선택 행 0개면 `disabled` |
| 저장 (N) | GridToolbar 좌측 | `Common.Grid.save` | `default` (primary) | dirty count 0이면 `disabled`, 진행 중이면 `Common.Grid.saving` |

**일관 원칙**:
- 모든 라벨은 i18n 키로. 하드코딩된 한국어 금지 (`jarvis-i18n` 스킬 강제)
- `isExporting` / `isSaving` 같은 진행 플래그가 있으면 라벨 토글 + `disabled` 동시 적용
- 셀에서 **별도 액션 버튼**(예: "삭제", "복제")은 추가하지 않는다. 행 선택 + 툴바 버튼 패턴으로 통일
- 모달 다이얼로그 신규 도입 금지. 미저장 변경만 `UnsavedChangesDialog` 사용

### 5. 컬럼 컨벤션

표준 정렬:

```
[좌측: PK/식별자] → [본문: 도메인 컬럼] → [우측 readonly: audit 필드]
```

| 위치 | 컬럼 | 비고 |
|---|---|---|
| 좌측 | `code` 또는 `employeeId` 또는 도메인 식별자 | width 90~110px, type `text` |
| 본문 | 도메인 데이터 | type 적합한 셀 사용 |
| 우측 | `updatedByName` | width 100px, **readOnly: true** |
| 우측 | `updatedAt` | width 160px, **readOnly: true** |

**컬럼 정의 규칙**:
- `key`는 **DB 컬럼명 그대로**. shape 일치를 강제 (`jarvis-db-patterns` 9.1)
- `width` 명시 필수. content-fit 금지 (헤더 폭 jitter 방지)
- 공유 enum (`status` 등)은 그리드 컴포넌트별 옵션 배열을 다시 만들지 말고 i18n + Zod enum 한 곳에서 단일 source
- audit 컬럼(`updatedBy*`/`updatedAt`)은 `readOnly: true` 강제 — 사용자 편집 불가
- Hidden 컬럼(레거시 ibsheet `Hidden:1`)은 `makeHiddenSkipCol`로 처리. 단, audit 정책상 export에는 포함될 수 있음(메모리 `feedback_legacy_ibsheet_hidden_policy.md`)

### 6. Server action 컨벤션

도메인 `actions.ts`는 정확히 두 함수를 export:

```ts
export async function list{Domain}(input: List{Domain}Input):
  Promise<{ ok: boolean; rows: {Domain}Row[]; total: number }>;

export async function save{Domain}(input: Save{Domain}Input):
  Promise<{ ok: boolean; inserted: number; updated: number; deleted: number; error?: string }>;
```

규칙:
- 권한 가드: 첫 줄에서 `requirePermission(...)` 또는 `resolveAdminContext()` 호출
- workspace 필터: 모든 WHERE/INSERT에 `workspaceId`
- batch save는 `db.transaction` 안에서 creates → updates → deletes 순으로
- 모든 mutation은 `audit_log` insert 동반 (`action: "{domain}.create|update|delete"` + before/after diff in `details`)
- update에는 `updatedBy: session.userId, updatedAt: new Date()` 항상 set
- 응답 shape는 Zod `{Domain}Output.parse(...)`로 강제

### 7. 금지 패턴

| 패턴 | 이유 |
|---|---|
| 신규 그리드에 `@tanstack/react-table` 도입 | DataGrid baseline와 분리 — admin/users 마이그레이션 후 0건. 신규 도입 시 PR 반려 |
| 카드형 그리드 (행을 카드로 늘어뜨림) | 데이터 밀도 손실. 메모리 `feedback_grid_design_unified.md` |
| 셀 안에 액션 버튼 (삭제/복제 인라인) | UX 비일관 — 툴바 버튼 패턴으로 통일 |
| 모달 폼 (신규 행 입력 다이얼로그) | 인라인 편집 강제 |
| 무한 스크롤 / virtualized rows | 서버 페이징 사용 |
| 일러스트 / 이모지 / 애니메이션 강조 | AI slop 회피 |
| `bg-blue-500` 등 raw Tailwind 색상 직접 적용 | 위 디자인 토큰만 사용 |
| 클라이언트 측 sensitivity 필터 / 권한 필터 | 쿼리 WHERE에서 처리 (`jarvis-db-patterns` 4) |
| 응답에 `passwordHash`/secret 컬럼 노출 | server action returning에 화이트리스트 강제 (admin/users 패턴 참고) |

### 8. 신규 그리드 PR 체크리스트

새 그리드 화면 PR 머지 전 모두 통과해야 함. spec-reviewer가 검증:

- [ ] DataGrid baseline 사용 (TanStack Table / 자체 table 0건)
- [ ] DomainGridContainer 1개 + DataGrid 본체 미수정
- [ ] 필수 기능 7+1 모두 구현 (인라인 편집/dirty/툴바 3버튼/필터 row/페이징/confirm dialog/batch save/Excel export)
- [ ] 디자인 토큰 1:1 매칭 — admin/companies 옆에 두고 비교 시 차이 없음
- [ ] 컬럼 정렬: PK 좌측 → 본문 → audit 우측 readonly
- [ ] 모든 라벨 i18n 키 (하드코딩 한국어 grep 결과 0)
- [ ] server action `list{Domain}`/`save{Domain}` 두 함수 + 트랜잭션 + audit_log
- [ ] 권한 가드 첫 줄 (`requirePermission` 또는 `resolveAdminContext`)
- [ ] 응답 shape Zod parse, 비밀 컬럼(`passwordHash` 등) 미노출
- [ ] type-check 0 errors / lint 0 new warnings / `audit:rsc` 0 errors
- [ ] 기존 baseline 회귀 테스트(`useGridState.test.ts`/`DataGridToolbar.test.tsx` 등) 통과

### 9. 참고

- Reference implementation: `admin/companies` ([CompaniesGridContainer.tsx](../../../apps/web/app/(app)/admin/companies/_components/CompaniesGridContainer.tsx))
- 추가 baseline 사용처(11곳): admin/codes·menus·infra-licenses·users · sales/customers·customer-contacts·mail-persons·opportunities·activities·product-types·product-cost-mapping
- ibsheet → React 매핑: 본 문서 "ibsheet 이벤트 → React 매핑" 섹션
- 디자인 통일 메모리 규칙: `feedback_grid_design_unified.md`
- 참고 plan: [`docs/superpowers/plans/2026-04-30-company-master-grid.md`](../../../docs/superpowers/plans/2026-04-30-company-master-grid.md), [`docs/superpowers/plans/2026-05-02-admin-users-grid-and-audit.md`](../../../docs/superpowers/plans/2026-05-02-admin-users-grid-and-audit.md)

## RBAC 메뉴 트리 (DB 기반 menu_item + menu_permission)

사이드바·CommandPalette 메뉴는 `apps/web/lib/routes.ts` 하드코딩에서 **DB(`menu_item` + `menu_permission` N:M)** 기반으로 전환되었다 (2026-04-30 머지). UNION 모델: 사용자가 가진 권한 중 하나라도 메뉴-권한 매핑에 일치하면 해당 메뉴 노출. ADMIN_ALL은 모든 메뉴에 자동 매핑되어 ADMIN role은 자동으로 모든 메뉴를 본다.

**핵심 규칙:**
- 데이터 SoT: `menu_item` 테이블 (workspace 스코프, `code` unique). `routes.ts`는 `@deprecated` (테스트 호환만 유지).
- 권한 매핑: `menu_permission` 조인 테이블 (composite PK: `(menu_item_id, permission_id)`).
- 가시성 결정: `getVisibleMenuTree(session, kind)` SQL이 `menu_permission ⨯ role_permission ⨯ user_role`을 OR-match로 JOIN. **`role.workspace_id = session.workspaceId` 필터 필수** (cross-workspace 권한 누수 방지).
- 부모-자식 cascade: `buildMenuTree`가 자식 가시성으로 부모 표시 결정 (라우트 없는 부모는 자식 없으면 prune).
- 사이클 방어: `parent_id` self-FK가 있지만 DB에 acyclic CHECK 없음 → `buildMenuTree`가 path-tracking Set으로 사이클 감지 + dev-warn.
- `kind` enum: `menu`(사이드바) | `action`(CommandPalette).
- 페이지 내 버튼 권한: server action 가드가 진짜, `<Authorized perm>` HOC는 UI hint만 (option 4C).
- routePath 검증: Sidebar/CommandPalette `toRenderItem`이 `isSafeInternalPath` 가드로 `/`로 시작하는 same-origin 경로만 렌더 (`javascript:` URI XSS 차단 — defense-in-depth).

**핵심 파일:**
- 스키마: [`packages/db/schema/menu.ts`](../../../packages/db/schema/menu.ts) (`code`/`kind`/`description` + self-FK), [`packages/db/schema/menu-permission.ts`](../../../packages/db/schema/menu-permission.ts) (N:M).
- 시드: [`packages/db/seed/permissions.ts`](../../../packages/db/seed/permissions.ts) (28 PERMISSIONS + 74 role_permission), [`packages/db/seed/menus.ts`](../../../packages/db/seed/menus.ts) (31 MENU_SEEDS — 14 NAV + 13 ADMIN + 4 ACTION).
- Runtime helper: [`apps/web/lib/server/menu-tree.ts`](../../../apps/web/lib/server/menu-tree.ts) — `buildMenuTree` (pure) + `getVisibleMenuTree` (Drizzle query builder, try/catch graceful degrade).
- Admin viewer: [`apps/web/lib/queries/admin.ts`](../../../apps/web/lib/queries/admin.ts) `getMenuTree(workspaceId)` (unfiltered, 페이지가 ADMIN_ALL 가드).
- Sidebar: [`apps/web/components/layout/Sidebar.tsx`](../../../apps/web/components/layout/Sidebar.tsx) — `code` prefix(`nav.*` / `admin.*`)로 그룹 분리, sortOrder 컨벤션(`<200` NAV, `200-399` ADMIN, `≥400` ACTION).
- Icon resolver: [`apps/web/components/layout/icon-map.ts`](../../../apps/web/components/layout/icon-map.ts) — string → LucideIcon (28 entries + ShieldCheck fallback).
- Layout fetch: [`apps/web/app/(app)/layout.tsx`](../../../apps/web/app/(app)/layout.tsx) — `Promise.all([getVisibleMenuTree(s, "menu"), getVisibleMenuTree(s, "action")])`.
- Authorized HOC: [`apps/web/components/auth/Authorized.tsx`](../../../apps/web/components/auth/Authorized.tsx) — `Permission | Permission[]` 타입(typo 컴파일 시 차단), ANY-match, fallback prop.

**메뉴 추가/수정 절차:**
1. `packages/db/seed/menus.ts`의 `MENU_SEEDS` 배열에 entry 추가 (code/kind/label/icon/routePath/sortOrder/permissions).
2. 새 아이콘이면 [`apps/web/components/layout/icon-map.ts`](../../../apps/web/components/layout/icon-map.ts)에 import + map 추가.
3. `pnpm db:seed` (멱등 — `onConflictDoUpdate` on `(workspace_id, code)`).
4. 권한 키는 `PERMISSIONS.X` 참조로 typo를 컴파일 시 차단.

**플랜 결정 옵션 (변경 금지):** 1A(ADMIN_ALL 자동 매핑) · 2B(부모 cascade) · 3B(ANY-match UNION) · 4C(server action 가드 + UI hint) · 5A(menu_item 테이블 SoT) · 6A(kind enum 통합).

**알려진 회귀 (별도 task):** ① NAV `badge`(예: `nav.ask: "AI"`)는 `MenuTreeNode`에 컬럼 없음 — `menu_item.badge` 추가 또는 사이드카 테이블 필요. ② CommandPalette의 `keywords` fuzzy 매칭 필드도 컬럼 없음 → label-only 매칭으로 축소.

**참고 plan:** [`docs/superpowers/plans/2026-04-30-rbac-menu-tree.md`](../../../docs/superpowers/plans/2026-04-30-rbac-menu-tree.md) (병합 후 삭제 예정).

## 영업 도메인 (sales) — 현재 머지된 구조

레거시 ibsheet JSP에서 React로 단계적으로 포팅 중. 2026-05-01 시점 머지된 테이블·라우트 단면:

**스키마 파일** (`packages/db/schema/`):
- `sales-customer.ts` — `sales_customer`, `sales_customer_charger`, `sales_customer_org`, `sales_customer_memo`, `sales_customer_contact`, `sales_customer_contact_memo`
- `sales-mail-person.ts` — `sales_mail_person` (메일 발송 대상)
- `sales-product-type.ts` — `sales_product_type`, `sales_product_type_cost` (정규화 후, 0053 migration)

**메모 모델 (PR #40):** `sales_customer_memo` / `sales_customer_contact_memo` 모두 self-FK `prior_comt_seq` 로 2-level reply 트리. 변환 로직: [`apps/web/lib/queries/sales-tabs.ts`](../../../apps/web/lib/queries/sales-tabs.ts) `buildMemoTree` (orphan reply는 silently 드롭, `isOwn` 은 `createdBy === sessionUserId`).

**아직 머지되지 않은 테이블 (P2-BLOCKED):** `sales_opportunity`, `sales_activity` 는 P2 plan(별도 worktree)이 main에 머지된 직후에만 추가됨. `sales-tabs.ts:10` 의 import 주석을 활성화하면 `getCustomerTabCounts` / `getContactTabCounts` 의 `opCnt` / `actCnt` 가 실제 카운트로 전환.

**사이드바 4탭 카운트 source:**
- 카운트 쿼리: [`apps/web/lib/queries/sales-tabs.ts`](../../../apps/web/lib/queries/sales-tabs.ts) `getCustomerTabCounts(customerId)` / `getContactTabCounts(contactId)`
- 반환 shape: `{ memo, contacts, opportunities, activities }` (op/act 는 P2 머지 전까지 0)
- E2E 가드: [`apps/web/e2e/sales-customers-tabs.spec.ts`](../../../apps/web/e2e/sales-customers-tabs.spec.ts), [`apps/web/e2e/sales-customer-contacts-tabs.spec.ts`](../../../apps/web/e2e/sales-customer-contacts-tabs.spec.ts) — op/act > 0 케이스는 P2 머지 후 갱신
- 새 sales 라우트가 추가될 때마다 `getCustomerTabCounts` 의 select 절에 카운트를 추가하라 (master-detail tab UI 는 이 단일 소스에 의존)

**DataGrid baseline (P2-A 적용분 — 5화면 공통):**
- 표준 9 visible 컬럼 정책: 레거시 ibsheet `Hidden:0|1` 을 SoT로 본다. 스키마는 모든 컬럼 유지하되 `GridColumn.hidden = true` 로 비표시. 무엇이 visible/hidden 인지는 메모리 `feedback_legacy_ibsheet_hidden_policy.md` + 레거시 JSP `Cols Hidden:` 헤더가 결정.
- 적용 화면: `sales/customers`, `sales/customer-contacts`, `sales/product-cost-mapping`, `sales/mail-persons`, `admin/infra/licenses`
- 공통 baseline 5종 (P1.5 산출물): `makeHiddenSkipCol`, `DataGridToolbar`, `CodeGroupPopupLauncher`, `useUrlFilters`, `validateDuplicateKeys` — 위 ibsheet 매핑표 참조
- Excel export: [`apps/web/lib/server/export-excel.ts`](../../../apps/web/lib/server/export-excel.ts) + 도메인별 `export.ts` server action + 클라이언트 [`apps/web/lib/utils/triggerDownload.ts`](../../../apps/web/lib/utils/triggerDownload.ts)
- 서버 페이징: 기본 `limit=50`, 컬럼 헤더 아래 필터 row, batch save (`{ creates, updates, deletes }`) — `/admin/companies` 표준과 동일

**바인딩 주의:**
- Customer/Contact 메모는 server action 가드에서 권한 + `isOwn` 양쪽을 모두 검사 (작성자만 수정/삭제)
- `sales_product_type_cost` 는 `sales_product_type` FK; 0053 migration 후 단가 별도 테이블 분리 — 단일 join 으로 조회 시 [`apps/web/lib/queries/sales-product-type-cost.ts`](../../../apps/web/lib/queries/sales-product-type-cost.ts) 헬퍼 사용
- 메일 모듈 0054 migration: `sales_mail_person.mail_id` + `memo` 추가, 기존 행은 nullable 로 시드

## ibsheet 이벤트 → React 매핑 (영업관리 포팅 가이드)

레거시 `apps/web/app/(app)/sales/**` 기반은 `.local/영업관리모듈/jsp_biz/` ibsheet JSP. React 포팅 시 매핑 표:

| ibsheet 이벤트/함수 | React 동등 패턴 | baseline |
|---|---|---|
| `sheet1_OnSearchEnd` | server action `result.then(setRows)` | server action |
| `sheet1_OnSaveEnd` | mutate → revalidatePath | server action |
| `sheet1_OnClick` | `<tr onClick>` | DataGrid built-in |
| `sheet1_OnDblClick` | `<tr onDoubleClick={() => router.push(...)}` | wrapper (P2 본진) |
| `sheet1_OnPopupClick` | `<CodeGroupPopupLauncher>` | `apps/web/components/grid/CodeGroupPopupLauncher.tsx` |
| `sheet1_OnAfterClick` | useEffect on row select | hook |
| `sheet1.DoSearch()` | server action 호출 | server action |
| `sheet1.DoSave()` | server action `saveXxx({ creates, updates, deletes })` | server action |
| `sheet1.Down2Excel()` | server action + `<DataGridToolbar onExport>` | `apps/web/components/grid/DataGridToolbar.tsx` |
| `makeHiddenSkipCol(sheet)` | `makeHiddenSkipCol(cols)` 순수 함수 | `apps/web/components/grid/utils/makeHiddenSkipCol.ts` |
| `dupChk(sheet, "k1\|k2\|k3")` | `findDuplicateKeys(rows, ["k1","k2","k3"])` | `apps/web/lib/utils/validateDuplicateKeys.ts` |
| `${map.searchXxx}` (filter persistence) | `useUrlFilters({ defaults })` | `apps/web/lib/hooks/useUrlFilters.ts` |
| `setSheetAutocompleteEmp()` | `<EmployeePicker>` (P2-A 시점 신설) | (TBD) |
| `IBS_SaveName(form, sheet)` | server action 직접 (Zod schema가 shape 강제) | — |
| Hidden:0/1 컬럼 정책 | `hidden: true` GridColumn 옵션 | DataGrid built-in |

### 참고 레거시 소스 (메모리 reference)
- 위치: `.local/영업관리모듈/jsp_biz/biz/{activity,contract,contrect}/**/*.jsp` (60 JSP)
- P1 5화면 ↔ 레거시 매핑: 메모리 `reference_sales_p1_mapping.md`
- Hidden:0|1 SoT 정책: 메모리 `feedback_legacy_ibsheet_hidden_policy.md`

### baseline 적용 시점
- **P2-A 세션** (별도 worktree): 5 sales 화면(customers, customer-contacts, product-cost-mapping, mail-persons, admin/infra/licenses)에 baseline 적용
- **P2 본진 세션** (별도 worktree): 사이드바 4탭 + master-detail edit pages에서 `useUrlFilters` 활용
- **P2 plan 신규 라우트** (sales-opportunities/activities/dashboard): baseline 활용 권장 (P2 worktree main rebase 후 import 가능)

## 표준 입력 컴포넌트

이 섹션은 모든 폼/그리드 입력에서 **반드시 사용해야 하는** 표준 컴포넌트를 모아둔다. 새 도메인을 만들거나 기존 화면을 수정할 때 이 섹션의 컴포넌트만 사용하라. 새 표준이 도입되면 같은 섹션에 누적한다.

### 날짜 입력

**금지:** `<input type="date">`

이유:
- 한국 IME 환경에서 자릿수 자동 분할이 작동하지 않아 연도 칸에 6글자(예: `202605`)가 그대로 들어가는 버그가 발생.
- 토/일·공휴일 시각 표시 / 툴팁 / 키보드 네비게이션이 모두 불가능.

**표준:** `@/components/ui/DatePicker`

```tsx
import { DatePicker } from "@/components/ui/DatePicker";

<DatePicker
  value={value}              // ISO yyyy-mm-dd 또는 null
  onChange={setValue}
  min={min}                  // optional
  max={max}                  // optional
  placeholder="yyyy-mm-dd"   // optional
  ariaLabel="설립일"          // optional, 권장
/>
```

특징:
- yyyy-mm-dd masked input + 자릿수 자동 분할 + paste 인식 (yyyy-mm-dd / yyyymmdd 모두)
- 캘린더 popup: 월간 그리드, 토 파랑 / 일 빨강 / 공휴일 빨강 + 우상단 점 + hover 툴팁(공휴일 이름)
- 키보드: ←→↑↓, PageUp/Down(월 이동), Home/End(주 시작/끝), Enter 선택, Esc 닫기
- 공휴일 데이터: `useWorkspaceHolidays`가 popup 열릴 때 lazy fetch + month range cache (workspace 단위)

그리드 셀: `EditableDateCell`이 내부적으로 `DatePicker`를 사용한다. `ColumnDef.type === "date"`만 지정하면 자동 적용.

**검증:** `apps/web/components/`, `apps/web/app/**` 어디에도 `<input type="date">`는 존재하지 않아야 한다(2026-05-02 sweep 완료). 새 추가 시 PR 리뷰에서 차단.
