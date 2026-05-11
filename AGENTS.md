# Jarvis — Agent Instructions

> 이 파일은 Codex CLI, Claude Code, 그리고 이 프로젝트에서 일하는 모든 AI 에이전트를 위한 최상위 지시문입니다.
> Claude Code 사용자라면 `CLAUDE.md`가 자동 로드되지만, **이 파일도 같은 원칙을 담고 있으니 충돌 시 양쪽을 모두 참조**하세요.
> Codex CLI 사용자라면 이 파일이 일차 진입점입니다.

## 프로젝트 개요

Jarvis = **사내 업무 시스템 + LLM 컴파일 위키**를 하나의 TypeScript 모노레포로 통합한 엔터프라이즈 지식 플랫폼. 2026-04-15부터 Karpathy LLM Wiki 방식 + Graphify 구조보조 + Git 단일 진실원천으로 피벗 중. 상세는 `WIKI-AGENTS.md` 참조. Next.js 15 App Router + Drizzle + PostgreSQL 16 (+pg_trgm, unaccent; pgvector는 레거시 호환용 비활성) + MinIO + pg-boss. 세션은 PG `user_session` 테이블, 임베딩 캐시는 `embed_cache` 테이블, rate-limit은 in-memory Map. 5000명 규모 배포를 목표로 한다.

- 웹 앱: `apps/web` (Next.js, port 3010)
- 백그라운드 워커: `apps/worker` (pg-boss)
- 공유 패키지: `packages/{ai,auth,db,search,secret,shared,wiki-fs,wiki-agent}` (8개)

**상태:** 디자인은 전면 재구성 예정. UI 스타일을 완성형으로 만드는 데 시간 쓰지 말고 **구조와 데이터 흐름의 정합성을 우선**한다.

## 개발 명령어

```bash
pnpm dev                            # web + worker 동시 실행
pnpm --filter @jarvis/web dev       # web만
pnpm --filter @jarvis/worker dev    # worker만
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test
```

## 하네스: 방법론은 superpowers, 도메인은 Jarvis 스킬

2026-04-22 기준, Jarvis 하네스는 "도메인 지식과 방향성만" 담당하고, **개발 방법론은 `superpowers` 플러그인에 위임**합니다. 이 원칙은 Claude Code와 Codex CLI 모두에 동일하게 적용됩니다.

### Codex CLI에서도 superpowers 사용

Codex CLI 사용자는 반드시 아래 중 한 방법으로 `superpowers` 플러그인을 설치하고, 기능 작업 시 해당 워크플로우를 따르세요.

```
# Codex CLI 내에서
/plugins
# 목록에서 superpowers를 찾아 Install Plugin
```

설치되지 않은 환경에서도 본 파일과 `.claude/skills/jarvis-*/SKILL.md`의 도메인 체크리스트를 수동으로 따라가면 동일한 경계면 버그를 예방할 수 있습니다.

### 방법론 위임 매핑

| 단계 | 위임 대상 (superpowers) |
|------|-----------------------|
| 요구 탐색 / 브레인스토밍 | `superpowers:brainstorming` |
| 구현 계획서 작성 | `superpowers:writing-plans` |
| 동일 세션 task-by-task 실행 + 2단계 리뷰 | `superpowers:subagent-driven-development` |
| 별도 세션 계획 실행 | `superpowers:executing-plans` |
| TDD red-green-refactor | `superpowers:test-driven-development` |
| 완료 주장 전 증거 확보 | `superpowers:verification-before-completion` |
| 코드 리뷰 요청 / 수신 | `superpowers:requesting-code-review` / `superpowers:receiving-code-review` |
| 디버깅 근본 원인 | `superpowers:systematic-debugging` |
| 병렬 독립 작업 | `superpowers:dispatching-parallel-agents` |
| 격리 워크트리 | `superpowers:using-git-worktrees` |
| 브랜치 마감·PR | `superpowers:finishing-a-development-branch` |

각 superpowers 스킬은 "어떻게"(방법론)만 담고 있습니다. "무엇을 어디에"(Jarvis 도메인)는 아래 도메인 스킬에서 가져와 주입합니다.

### Jarvis 도메인 스킬 (방법론 각 단계에 컨텍스트로 주입)

| 스킬 | 어떤 정보를 담고 있는가 | 언제 참조하는가 |
|------|----------------------|---------------|
| [`.claude/skills/jarvis-architecture/SKILL.md`](.claude/skills/jarvis-architecture/SKILL.md) | 모노레포 레이아웃 · tool-use agent(Ask AI) · wiki-fs SSoT · **영향도 체크리스트(17계층)** · **파일 변경 순서 20단계** · **검증 게이트 명령** | 거의 항상(진입점) |
| [`.claude/skills/jarvis-db-patterns/SKILL.md`](.claude/skills/jarvis-db-patterns/SKILL.md) | 54 스키마 파일 · 47 권한 · 5 역할 · Zod · server action 두 패턴(RBAC / 세션) · **경계면 교차 비교 체크리스트**(shape/권한/nullable/마이그레이션/i18n) | DB·권한·서버 액션 작업 |
| [`.claude/skills/jarvis-i18n/SKILL.md`](.claude/skills/jarvis-i18n/SKILL.md) | ko.json 네임스페이스 · 보간 변수 · client/server 훅 · 경계면 검증 | UI 문자열 작업 |
| [`.claude/skills/jarvis-wiki-feature/SKILL.md`](.claude/skills/jarvis-wiki-feature/SKILL.md) | Karpathy 4원칙(auto/manual · wiki-fs API · projection only · raw chunk RAG 금지) · ingest 4단계 · wiki-fs vs wiki-agent 경계 | wiki/ask-AI 도메인 작업 |

### 얇은 진입점 스킬

[`.claude/skills/jarvis-feature/SKILL.md`](.claude/skills/jarvis-feature/SKILL.md)는 위 두 축(방법론 + 도메인)을 한 요청에서 엮는 얇은 오케스트레이터입니다. Claude Code에서는 스킬 자동 트리거로, Codex CLI에서는 직접 참조 문서로 사용합니다.

## 작업 흐름 요약 (짧게)

기능 작업 요청을 받았을 때, 어느 환경에서든 아래 순서를 따르세요:

1. **도메인 컨텍스트 로드** — 관련된 Jarvis 도메인 스킬을 읽는다(거의 항상 `jarvis-architecture`는 필요).
2. **요구 명료화** (애매하면) — `superpowers:brainstorming`.
3. **계획 작성** — `superpowers:writing-plans` + `jarvis-architecture`의 영향도 체크리스트(17계층). 해당 없음도 명시.
4. **구현 + 리뷰** — `superpowers:subagent-driven-development` (같은 세션) 또는 `superpowers:executing-plans` (별도 세션). TDD는 `superpowers:test-driven-development`. 파일 변경 순서는 `jarvis-architecture`의 20단계.
5. **완료 전 검증** — `superpowers:verification-before-completion` + `jarvis-architecture`의 검증 게이트 명령 표(범위에 맞는 것만: type-check/lint/test/운영 DB SQL 적용/wiki:check/audit:rsc/eval:budget-test).
6. **브랜치 마감** — `superpowers:finishing-a-development-branch`.

단일 파일 1~2줄 수정이나 정보 조회는 위 흐름을 건너뛰어도 됩니다.

## 핵심 규칙 (요약, 상세는 도메인 스킬 참조)

### DB 스키마 변경

- `packages/db/schema/*.ts` 편집 후 운영 DB에 해당 `ALTER/CREATE` SQL을 직접 적용. 수동으로 drizzle 파일 편집 금지.
- `workspaceId` 필터는 모든 쿼리에 필수 (multi-tenant 격리). row 단위 sensitivity 필터는 **사용하지 않음** (2026-05-12 폐기).
- **Wiki 관련 테이블은 projection 전용**: `wiki_page_index`, `wiki_page_link`, `wiki_page_source_ref`, `wiki_commit_log`, `wiki_review_queue`, `wiki_lint_report`. 본문 컬럼(body, mdxContent 등) 추가 금지.
- `document_chunks`, `knowledge_claim.embedding` 등 레거시 RAG 테이블은 쓰기·읽기 경로 차단 예정. 신규 코드가 참조하지 말 것. `knowledge_page.mdxContent`·`wiki_sources.body`·`wiki_concepts.body` SELECT도 동일 금지.
- timestamp는 `{ withTimezone: true }`.

### 권한 (RBAC)

- 상수: `packages/shared/constants/permissions.ts` (`PERMISSIONS` 47종). 역할 매핑: 같은 파일 `ROLE_PERMISSIONS` (5역할).
- 네이밍: `{domain}:{action}` (예: `knowledge:update`).
- server action 시작: `await requirePermission(PERMISSIONS.X)`. Ask AI 계열은 `requireSession` + `workspaceId + userId` 이중 필터.
- 격리는 RBAC 권한 + `workspaceId` 두 축으로만 결정. 행 단위 `sensitivity` 필터는 2026-05-12 폐기.

### i18n (한국어, next-intl)

- 단일 로케일 파일: `apps/web/messages/ko.json`.
- 네임스페이스 구조: `{Domain}.{Section}.{key}` (camelCase key).
- 클라이언트: `useTranslations("Admin.Users")` → `t("title")`. 서버: `await getTranslations("Admin.Users")`.
- 보간 변수명은 **ko.json과 컴포넌트가 완전 일치**해야 함.
- 새 키는 **컴포넌트에서 쓰기 전에** ko.json에 먼저 추가.
- 보간 변수 불일치는 과거 반복 발생 → 리뷰 단계에서 반드시 교차 검증(`jarvis-i18n` 스킬의 "경계면 검증" 섹션).

### 서버 액션 (패턴)

```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export async function pinPage(
  pageId: string
): Promise<{ ok: boolean; pinnedAt: string | null }> {
  const session = await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  // workspaceId 필터 필수 (multi-tenant 격리)
  return { ok: true, pinnedAt: new Date().toISOString() };
}
```

상세 패턴(트랜잭션·audit·nullable·Zod 출력 parse 등)은 `jarvis-db-patterns` 스킬 §3 참조.

## Ask AI 워크플로우 (Harness-first)

> 전환 상세: `git log --grep='harness-first'` 또는 `CLAUDE.md` 변경 이력 2026-04-24 entry 참조 (plan 본문은 disposable 정책에 따라 머지 후 삭제됨).
> 관련 스킬: [graphify 스킬](~/.claude/skills/graphify/SKILL.md) (`/graphify` 명령)

Ask AI는 embedding RAG 대신 **tool-use agent**로 동작합니다 (Phase A–G, 2026-04 완료). 사용자 질문을 받으면 LLM이 아래 4개 도구를 호출하며 위키를 직접 탐색합니다.

### 도구 (OpenAI function-call 이름)

| 프로즈 이름 | function name | 역할 |
|------------|--------------|------|
| `wiki-grep` | `wiki_grep` | 키워드로 페이지 후보 찾기 (제목·slug·content 검색, pg_trgm) |
| `wiki-read` | `wiki_read` | slug로 디스크 본문 읽기 (wiki-fs 경유) |
| `wiki-follow-link` | `wiki_follow_link` | `[[wikilink]]` 1-hop 추적 |
| `wiki-graph-query` | `wiki_graph_query` | graphify 그래프 쿼리 (커뮤니티·경로, `GRAPH_REPORT.md` 활용) |

4개 도구는 모두 `withWorkspaceRbacFilter` 래퍼로 감싸져 있습니다 (`packages/ai/agent/tools/sensitivity-filter.ts` — 함수명은 1주 burn-in 후 파일까지 함께 정리 예정). 래퍼는 세션의 `workspaceId` + `userId` + 보유 권한을 검증한 뒤 LLM에 결과를 전달합니다. row 단위 sensitivity 필터는 2026-05-12 폐기 — 워크스페이스 멀티테넌트 + RBAC 권한 게이트가 동등한 격리를 제공합니다. 권한 없는 사용자는 화면 자체가 노출되지 않습니다(서버 페이지/route 가드).

### 탐색 규칙

1. `wiki-grep`으로 관련 페이지 3~5개 후보를 얻는다.
2. top 1~2개를 `wiki-read`로 읽는다.
3. 답이 충분치 않으면 `wiki-follow-link` 또는 `wiki-graph-query`로 확장.
4. 최대 **8회** tool call (`MAX_TOOL_STEPS = 8`, `packages/ai/agent/ask-agent.ts`). 넘으면 abort.
5. 답변에는 `[[slug]]` 형식 citation 필수.
6. 근거 부족 시 "문서에 없다"고 응답 — 추측 금지.

### SSE 스트리밍 & sources

`packages/ai/agent/sse-adapter.ts`가 `AskAgentEvent`를 `SSEEvent`로 변환합니다. `wiki-read` 결과는 slug 기준으로 dedup되어 `sources` 배열로 harvest됩니다. `apps/web/components/ai/AnswerCard.tsx`가 `[[slug]]` citation을 렌더링합니다.

`packages/ai/ask.ts`의 `askAI`는 budget/cache/`logLlmCall` 배선을 유지하는 얇은 래퍼이며, 내부적으로 `askAgentStream`에 위임합니다. `apps/web/app/api/ask/route.ts`는 변경 없이 계약을 유지합니다.

### 레거시 상태

`packages/ai/router.ts` (6-lane 라우터) + 레거시 `retrieveRelevant*` 함수는 `@deprecated` 배너가 붙어 있으며, 1주 burn-in 후 삭제 예정입니다. 신규 코드는 `packages/ai/agent/**`만 참조하세요.

### graphify 연동

`/graphify` 스킬 실행 → `graphify-out/GRAPH_REPORT.md` 생성. `wiki-graph-query` 도구는 이 산출물을 활용하여 코드 그래프 탐색을 지원합니다.

---

## 자주 혼동되는 것

- **`apps/web/lib/`** (웹 전용 서버 헬퍼) vs **`packages/{auth,shared,ai,wiki-fs,wiki-agent}/`** (web + worker 공유)
- **server action** (form mutation, RSC) vs **route handler `route.ts`** (외부 API)
- **`apps/web/components/`** (전역 공통) vs **`apps/web/app/(app)/**/_components/`** (페이지 전용)
- **`wiki-fs`**(디스크 I/O + git, stateful) vs **`wiki-agent`**(LLM 프롬프트/파서, stateless) — 절대 섞지 말 것
- **`knowledge_page`** (레거시 Knowledge) vs **`wiki_page_index`** (Karpathy projection) — 이행 중 공존
- DB 스키마 변경 시: `packages/db/schema/*.ts` 수정 → 운영 DB에 SQL 직접 적용

## 참조 문서

| 주제 | 파일 | 언제 읽는가 |
|------|------|------------|
| LLM 위키 관리자 스키마 | `WIKI-AGENTS.md` | 지식 ingest / query / lint / graph 오퍼레이션 수정 시 |
| 아키텍처/스택/모듈 경계·영향도 체크리스트·파일 변경 순서·검증 게이트 | `.claude/skills/jarvis-architecture/SKILL.md` | 거의 항상(진입점) |
| Drizzle / RBAC / sensitivity / 경계면 교차 비교 | `.claude/skills/jarvis-db-patterns/SKILL.md` | 스키마·권한·server action 변경 시 |
| i18n 키 추가·검증·경계면 검증 | `.claude/skills/jarvis-i18n/SKILL.md` | UI 문자열 작업 시 |
| Karpathy 4원칙·wiki-fs/wiki-agent 경계·ingest 4단계 | `.claude/skills/jarvis-wiki-feature/SKILL.md` | wiki/ask-AI 도메인 작업 시 |
| 하네스 진입점 (superpowers + 도메인 묶음) | `.claude/skills/jarvis-feature/SKILL.md` | 큰 기능을 계획할 때 전체 흐름 참조 |

**Codex도 이 markdown 파일들을 그대로 읽을 수 있습니다** — Claude Code 전용 확장이 아닙니다.

## Codex 사용자에게 특히

- **superpowers 플러그인 설치**: Codex CLI `/plugins` → `superpowers` 검색 → Install. 설치 후 본 문서 상단 "방법론 위임 매핑"의 스킬 이름을 그대로 활용할 수 있습니다.
- superpowers를 설치하지 못한 환경이라면, 최소한 `jarvis-architecture` 스킬의 "영향도 체크리스트 · 파일 변경 순서 · 검증 게이트" 세 섹션과 `jarvis-db-patterns` 스킬의 "경계면 교차 비교 체크리스트"를 직접 따라가세요. 그것만으로 shape 불일치·i18n 키 누락·권한/sensitivity 누락 버그 대부분을 막을 수 있습니다.
- **스키마 변경 시**: `packages/db/schema/*.ts` 수정 후 운영 DB에 해당 SQL을 직접 적용합니다. drizzle-kit은 사용하지 않습니다.
- Karpathy-first 피벗(2026-04-15) 이후로 **레거시 `ask.ts / embed.ts / document_chunks` 관련 코드는 비활성화 경로**입니다. `FEATURE_WIKI_FS_MODE=true` 상태에서 수정·참조 금지. 새 기능은 `packages/wiki-fs/`와 `packages/wiki-agent/` 경유.

## 변경 이력

| 날짜 | 변경 내용 | 사유 |
|------|----------|------|
| 2026-04-10 | 초기 하네스 구성 (3인 팀 + 4 스킬) | 사내 업무 시스템 + 사내 위키 통합 프로젝트 경량 하네스 |
| 2026-04-10 | Drizzle schema drift 훅 + Codex용 `AGENTS.md` 추가 | 훅 1(경고) 설치 + Codex도 동일 원칙 따르도록 지시문 미러링 |
| 2026-04-14 | `--ci`/`--precommit` blocking 모드 설명 추가 | Phase-7A PR#4: CI/pre-commit에서 동일 스크립트로 blocking 가능 |
| 2026-04-15 | Karpathy LLM Wiki 피벗 반영 (RAG AI 포털 → LLM 컴파일 위키) | `WIKI-AGENTS.md` 신설 + 레거시 RAG 설계 문서 `docs/_archive/2026-04-pivot/` 이동 |
| 2026-04-22 | **방법론을 superpowers 플러그인에 위임, 3인 에이전트 폐기에 맞춘 전면 재작성.** Phase 1/2/3 상세 체크리스트 섹션 → 도메인 스킬 포인터로 축소. Codex CLI용 superpowers 설치 안내 추가. 참조 표에서 삭제된 `jarvis-planner/builder/integrator.md` 제거. | CLAUDE.md와 동일한 위임 원칙을 Codex 환경에도 일관되게 적용. Codex CLI에서도 `/plugins`로 superpowers 설치 가능함을 확인 |
| 2026-04-24 | **Ask AI Harness-first 전환 완료 반영 (Phase A–G).** `## Ask AI 워크플로우` 섹션 신설 — 4-tool agent, RBAC/sensitivity 집행 방식, SSE 스트리밍, sources harvest, 레거시 @deprecated 상태 명시. 도메인 스킬 표의 "6-lane 라우터" 참조 → "tool-use agent"로 갱신. | Phase B3+B4 / Phase G 머지 후 Codex 에이전트가 구 RAG 설계를 계속 참조하는 drift 방지 |
| 2026-05-11 | React/Next.js 12 CVE 보안 패치 — `apps/web` 의존성 bump (`next 15.5.15 → 15.5.18`, `react 19.0.0 → 19.2.6`, `react-dom 19.0.0 → 19.2.6`, `eslint-config-next 15.5.15 → 15.5.16`). breaking change 없음. AGENTS.md 본문은 메이저 라인 표기(Next.js 15, React 19)이므로 본문 변경 없음 — 이력 행만 추가. 상세는 `README.md` §18 / `CLAUDE.md` 변경 이력 참조. | Cloudflare 보안 권고(2026-05) — WAF 차단 불가능한 High 6건(미들웨어 우회·SSRF·DoS) 포함 → 즉시 패치 필수 |
| 2026-05-12 | **Sensitivity row-level filter 폐기 — RBAC + workspaceId 단일화 반영.** §핵심 규칙 §DB 스키마 변경 — sensitivityEnum 줄 삭제. §권한 (RBAC) — sensitivity 4번째 bullet 삭제, 권한 카운트 34→47 갱신. server action 예제 주석 `// workspaceId + sensitivity 필터 필수` → `// workspaceId 필터 필수`. §Ask AI 워크플로우 — `withSensitivityFilter` → `withWorkspaceRbacFilter`, "RBAC + sensitivity 집행 방식" → "RBAC + workspaceId 격리". 도메인 스킬 표(jarvis-db-patterns 줄) — "sensitivity · Zod" → "Zod", 스키마 카운트 31→54, 권한 34→47. 본문 변경은 CLAUDE.md/README.md §18 entry와 정합. | 사용자 결정 "RBAC만 하고 화면 자체를 안 보여주는 방식" — 8 테이블 sensitivity 컬럼 + 14 helper drop을 코드/문서 양쪽에서 동시 반영. 자세한 이력은 `CLAUDE.md` 2026-05-12 entry. |
