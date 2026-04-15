# Jarvis — Agent Instructions

> 이 파일은 Codex CLI, Claude Code, 그리고 이 프로젝트에서 일하는 모든 AI 에이전트를 위한 최상위 지시문입니다.
> Claude Code 사용자라면 `CLAUDE.md`가 자동 로드되지만, **이 파일도 같은 원칙을 담고 있으니 충돌 시 양쪽을 모두 참조**하세요.
> Codex CLI 사용자라면 이 파일이 일차 진입점입니다.

## 프로젝트 개요

Jarvis = **사내 업무 시스템 + LLM 컴파일 위키**를 하나의 TypeScript 모노레포로 통합한 엔터프라이즈 지식 플랫폼. 2026-04-15부터 Karpathy LLM Wiki 방식 + Graphify 구조보조 + Git 단일 진실원천으로 피벗 중. 상세는 `WIKI-AGENTS.md` 참조. Next.js 15 App Router + Drizzle + PostgreSQL 16 (+pg_trgm, unaccent; pgvector는 레거시 호환용 비활성) + Redis + MinIO + pg-boss. 5000명 규모 배포를 목표로 한다.

- 웹 앱: `apps/web` (Next.js, port 3010)
- 백그라운드 워커: `apps/worker` (pg-boss)
- 공유 패키지: `packages/{ai,auth,db,search,secret,shared}`

**상태:** 디자인은 전면 재구성 예정. UI 스타일을 완성형으로 만드는 데 시간 쓰지 말고 **구조와 데이터 흐름의 정합성을 우선**한다.

## 개발 명령어

```bash
pnpm dev                            # web + worker 동시 실행
pnpm --filter @jarvis/web dev       # web만
pnpm --filter @jarvis/worker dev    # worker만
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test
pnpm db:generate                    # drizzle schema → migration
pnpm db:migrate                     # migration 실행
pnpm db:studio                      # Drizzle Studio
node scripts/check-schema-drift.mjs # 스키마 drift 수동 확인
```

## 하네스: 3인 역할 사고 프레임

이 프로젝트에는 Claude Code용 3인 에이전트 팀 하네스가 구축되어 있습니다 (`.claude/agents/`, `.claude/skills/`). Codex처럼 **단일 에이전트로 작업**할 때도, 기능 구현이 간단한 1~2줄 수정이 아니라면 아래 세 역할을 **순서대로 연쇄 수행**하세요. 역할 전환은 속으로 해도 되지만, 각 단계의 체크리스트는 빠뜨리지 말 것.

### Phase 1 — Planner 역할 (먼저 계획)

**질문하지 말고 먼저 코드를 읽어라.** 추측 금지.

영향도 체크리스트 (해당 없는 항목도 명시):

| 계층 | 파일 위치 | 확인 |
|------|-----------|------|
| DB 스키마 | `packages/db/schema/*.ts`, `packages/db/drizzle/` | 테이블/컬럼/인덱스 추가? 마이그레이션 필요? |
| Validation | `packages/shared/validation/*.ts` | Zod 스키마 추가/수정? |
| 권한 | `packages/shared/constants/permissions.ts`, `packages/auth/rbac.ts` | 새 PERMISSION 필요? 어떤 역할에 부여? |
| AI/검색 | `packages/ai/`, `packages/wiki-agent/`, `apps/worker/` | LLM ingest / lint / graph 오퍼레이션 중 어느 것? feature flag 확인? |
| 위키 페이지 | `wiki/{workspaceId}/auto/**`, `wiki/{workspaceId}/manual/**` | 어느 페이지가 생성·수정되는가? auto vs manual 영역 확인? |
| 위키 스키마 | `packages/db/schema/wiki-*.ts` (projection 테이블) | `wiki_page_index`, `wiki_page_link`, `wiki_commit_log` 갱신 필요? |
| 서버 액션/API | `apps/web/app/(app)/{domain}/**/actions.ts`, `route.ts` | 어느 파일? 응답 shape? |
| UI 페이지 | `apps/web/app/(app)/{domain}/` | 어느 라우트? layout 수정? |
| UI 컴포넌트 | `apps/web/app/(app)/**/_components/`, `apps/web/components/` | client/server component? |
| i18n 키 | `apps/web/messages/ko.json` | 어느 네임스페이스? 보간 변수? |
| 테스트 | `*.test.ts`, `apps/web/e2e/` | unit / integration / e2e? |
| 워커 잡 | `apps/worker/src/jobs/` | 새 잡? 스케줄? |

RBAC과 sensitivity는 계획 단계에서 **명시적으로 확정**한다. "나중에 권한 체크" 금지.

### Phase 2 — Builder 역할 (그다음 구현)

**파일 변경 순서는 의존성 순서.** 이 순서를 지키면 중간 상태 에러가 거의 생기지 않는다.

```
1. packages/db/schema/*.ts           (스키마)
2. pnpm db:generate                  (마이그레이션 생성)
3. packages/shared/validation/*.ts   (Zod)
4. packages/shared/constants/*.ts    (권한 등 상수)
5. packages/wiki-fs/**                   (디스크 write / git commit / frontmatter / wikilink)
6. packages/wiki-agent/**                (ingest / query / lint 오퍼레이션)
7. packages/{ai,search,auth}/**      (비즈니스 로직)
8. apps/web/lib/**                   (쿼리/헬퍼)
9. apps/web/app/(app)/**/actions.ts  (server action)
10. apps/web/app/(app)/**/page.tsx    (server component)
11. apps/web/app/(app)/**/_components/*.tsx  (client component)
12. apps/web/messages/ko.json        (i18n — 마지막에 몰아서)
13. apps/worker/src/jobs/*.ts        (워커 잡, 필요 시)
14. 테스트 파일 (*.test.ts, e2e/*.spec.ts)
```

**필수 규칙:**
- 기존 패턴을 먼저 찾아 따라간다. 유사한 기존 페이지/액션을 읽지 않고 새로 설계하지 않는다.
- 한국어 텍스트는 **하드코딩 금지**. `t("Namespace.key")`를 쓰고 `apps/web/messages/ko.json`에 키를 추가한다.
- server action 첫 줄에 `requirePermission(PERMISSIONS.X)`.
- sensitivity 필드가 있는 엔티티는 쿼리 WHERE에 sensitivity 필터를 포함.
- server action 반환 타입을 명시하고 클라이언트가 기대하는 shape과 일치시킨다.
- Drizzle 스키마 파일 수정 후 `pnpm db:generate` 필수. 수동으로 SQL 편집 금지.
- 디자인 재구성 예정이므로 Tailwind 클래스·레이아웃은 기존 스타일을 복사.
- 위키 페이지 생성·수정은 반드시 `packages/wiki-fs` 경유. 직접 `fs.writeFile`로 `wiki/**` 쓰지 말 것.
- `FEATURE_WIKI_FS_MODE=true` 모드에서는 `knowledge_page.mdxContent`를 **읽지도 쓰지도 말 것**. 본문은 디스크에서 Read.

### Phase 3 — Integrator 역할 (마지막 검증)

**"파일이 존재하는가?"가 아니라 "양쪽이 같은 shape을 기대하는가?"** 를 확인한다.

1. **자동화 먼저:**
   ```bash
   pnpm --filter @jarvis/web type-check
   pnpm --filter @jarvis/web lint
   pnpm test      # 관련 범위
   node scripts/check-schema-drift.mjs
   ```

2. **경계면 교차 비교 (수동):**
   - server action 반환 타입 ↔ 클라이언트 훅이 구조분해하는 필드
   - i18n 키의 `ko.json` 경로 ↔ 컴포넌트 `t("...")` 참조 경로
   - i18n 키의 `{변수}` ↔ 컴포넌트가 전달하는 객체 키
   - 권한 상수 정의 ↔ server action에서 실제 사용한 상수
   - nullable 필드 ↔ validation/UI의 null 처리

3. **sensitivity/RBAC 누락은 P0 이슈.** 발견 시 즉시 수정.

## 핵심 규칙 (요약)

### DB 스키마 변경

- `packages/db/schema/*.ts` 편집 → 반드시 `pnpm db:generate`
- 수동으로 `drizzle/*.sql` 편집 금지
- `workspaceId` 필터는 모든 쿼리에 필수 (multi-tenant 격리)
- `sensitivityEnum`: `PUBLIC / INTERNAL / RESTRICTED / SECRET_REF_ONLY`
- **Wiki 관련 테이블은 projection 전용**: `wiki_page_index`, `wiki_page_link`, `wiki_page_source_ref`, `wiki_commit_log`, `wiki_review_queue`, `wiki_lint_report`. 본문 컬럼(body, mdxContent 등) 추가 금지.
- `document_chunks`, `knowledge_claim.embedding` 등 레거시 RAG 테이블은 **쓰기·읽기 경로 차단 예정** (Phase-W3-T3, `FEATURE_RAW_CHUNK_QUERY=false` 전환 시점). 신규 코드가 참조하지 말 것. `knowledge_page.mdxContent`·`wiki_sources.body`·`wiki_concepts.body` SELECT도 동일 금지 (G11 게이트로 application-layer assert).
- timestamp는 `{ withTimezone: true }`
- 확인: `node scripts/check-schema-drift.mjs`

### 권한 (RBAC)

- 상수: `packages/shared/constants/permissions.ts` (`PERMISSIONS`)
- 역할 매핑: 같은 파일의 `ROLE_PERMISSIONS`
- 네이밍: `{domain}:{action}` (예: `knowledge:update`)
- server action 시작: `await requirePermission(PERMISSIONS.X)`
- sensitivity 필터는 RBAC **위에** 추가로 적용

### i18n (한국어, next-intl)

- 단일 로케일 파일: `apps/web/messages/ko.json`
- 네임스페이스 구조: `{Domain}.{Section}.{key}` (camelCase key)
- 클라이언트: `useTranslations("Admin.Users")` → `t("title")`
- 서버: `await getTranslations("Admin.Users")`
- 보간 변수명은 **ko.json과 컴포넌트가 완전 일치**해야 함
- 새 키는 **컴포넌트에서 쓰기 전에** ko.json에 먼저 추가
- 이전 세션에서 보간 변수 불일치 버그가 반복 발생 → 구현 후 반드시 교차 검증

### 서버 액션

```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export async function pinPage(
  pageId: string
): Promise<{ ok: boolean; pinnedAt: string | null }> {
  await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  // ... 구현
  return { ok: true, pinnedAt: new Date().toISOString() };
}
```

체크리스트:
- [ ] 첫 줄 권한 체크
- [ ] 반환 타입 명시
- [ ] `workspaceId` 필터
- [ ] sensitivity 필터 (해당 엔티티에 한해)
- [ ] null vs undefined 구별
- [ ] 클라이언트 훅과 shape 일치

## 자주 혼동되는 것

- **`apps/web/lib/`** (웹 전용 서버 헬퍼) vs **`packages/{auth,shared,ai}/`** (web + worker 공유)
- **server action** (form mutation, RSC) vs **route handler `route.ts`** (외부 API)
- **`apps/web/components/`** (전역 공통) vs **`apps/web/app/(app)/**/_components/`** (페이지 전용)
- 드리즐 schema ↔ `_journal.json` 동기화: `pnpm db:generate`

## 참조 문서

더 상세한 가이드는 아래 파일을 필요할 때 참조합니다. **Codex도 이 파일들을 읽을 수 있습니다** — Claude Code 전용 파일이라 표시되어 있어도 내용 자체는 범용이며 그대로 적용됩니다.

| 주제 | 파일 | 언제 읽는가 |
|------|------|------------|
| LLM 위키 관리자 스키마 | `WIKI-AGENTS.md` | 지식 ingest / query / lint / graph 어떤 오퍼레이션이든 수정할 때 필수 |
| 아키텍처/스택/모듈 경계 | `.claude/skills/jarvis-architecture/SKILL.md` | 새 기능이 어느 패키지에 들어가야 하는지 모를 때 |
| Drizzle / RBAC / sensitivity 패턴 | `.claude/skills/jarvis-db-patterns/SKILL.md` | 스키마·권한 변경 시 |
| i18n 키 추가·검증 규칙 | `.claude/skills/jarvis-i18n/SKILL.md` | UI 문자열 작업 시 |
| 3인 팀 전체 워크플로우 | `.claude/skills/jarvis-feature/SKILL.md` | 큰 기능을 계획할 때 전체 흐름 참조 |
| 각 역할의 원칙 | `.claude/agents/jarvis-{planner,builder,integrator}.md` | 역할별 프로토콜 확인 |

## Codex 사용자에게 특히

- Claude Code는 `.claude/settings.json`의 PostToolUse 훅으로 스키마 drift를 **자동 감지**합니다 (`--hook`, advisory).
- Codex는 훅이 없으므로, **스키마 파일을 수정한 세션 말미에 수동으로** 실행하세요:
  ```bash
  node scripts/check-schema-drift.mjs
  ```
  drift가 있으면 exit 1로 알려줍니다.
- CI/pre-commit에서는 blocking 모드를 사용합니다:
  ```bash
  node scripts/check-schema-drift.mjs --ci         # CI 파이프라인 (exit 1 on drift)
  node scripts/check-schema-drift.mjs --precommit  # 로컬 pre-commit hook (exit 1 on drift)
  ```
- Codex가 3인 팀 통신(`SendMessage`, `TaskCreate`)을 가질 수는 없지만, **역할 순서를 직접 따라가는 것**만으로도 경계면 버그(shape 불일치, i18n 키 누락, 권한 누락)의 대부분을 막을 수 있습니다.
- 의심스러우면 `.claude/skills/`의 해당 스킬 파일을 열어 보세요. 내용은 Codex도 그대로 읽을 수 있는 markdown입니다.
- Karpathy-first 피벗(2026-04-15) 이후로 **ask.ts / embed.ts / document_chunks 관련 코드는 비활성화 경로**입니다. `FEATURE_WIKI_FS_MODE=true` 상태에서 수정·참조 금지. 새 기능은 `packages/wiki-fs/`와 `packages/wiki-agent/` 경유.

## 변경 이력

| 날짜 | 변경 내용 | 사유 |
|------|----------|------|
| 2026-04-10 | 초기 하네스 구성 (3인 팀 + 4 스킬) | 사내 업무 시스템 + 사내 위키 통합 프로젝트 경량 하네스 |
| 2026-04-10 | Drizzle schema drift 훅 + Codex용 `AGENTS.md` 추가 | 훅 1(경고) 설치 + Codex도 동일 원칙 따르도록 지시문 미러링 |
| 2026-04-14 | `--ci`/`--precommit` blocking 모드 설명 추가 | Phase-7A PR#4: CI/pre-commit에서 동일 스크립트로 blocking 가능 |
| 2026-04-15 | Karpathy LLM Wiki 피벗 반영 (RAG AI 포털 → LLM 컴파일 위키) | `WIKI-AGENTS.md` 신설 + 레거시 RAG 설계 문서 `docs/_archive/2026-04-pivot/` 이동 |
