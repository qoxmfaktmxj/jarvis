---
name: jarvis-architecture
description: Jarvis(사내 업무 시스템 + 사내 위키 + RAG AI 포털)의 모노레포 구조·기술 스택·모듈 경계·주요 패턴을 요약한 아키텍처 참조. Jarvis 프로젝트에서 기능을 추가·수정하거나, 어느 패키지에 코드를 넣을지 결정하거나, 아키텍처 맥락이 필요할 때 반드시 이 스킬을 먼저 로드하라. jarvis-planner, jarvis-builder, jarvis-integrator 모두 진입점으로 사용한다.
---

# Jarvis Architecture Reference

Jarvis는 사내 업무 시스템·사내 위키·프로젝트·근태·RAG AI 포털을 하나의 TypeScript 모노레포로 통합한 제품이다. 이 문서는 "어느 파일이 어느 책임을 지는가"를 빠르게 파악하기 위한 참조.

## 모노레포 레이아웃

```
jarvis/
├─ apps/
│  ├─ web/          # Next.js 15 App Router (port 3010)
│  │  ├─ app/       # RSC pages + server actions + API routes
│  │  ├─ components/  # 공통 UI 컴포넌트 (도메인 횡단)
│  │  ├─ lib/       # 서버용 쿼리·헬퍼·auth 브릿지
│  │  ├─ messages/  # next-intl ko.json (단일 로케일, 한국어)
│  │  ├─ i18n/      # next-intl 설정
│  │  ├─ e2e/       # Playwright
│  │  └─ middleware.ts
│  └─ worker/       # pg-boss 기반 백그라운드 워커
│     └─ src/jobs/  # ingest, embed, compile, cleanup, freshness, popular
├─ packages/
│  ├─ ai/           # RAG, embedding, citation stream (Anthropic + OpenAI)
│  ├─ auth/         # OIDC + Redis session + RBAC
│  ├─ db/           # Drizzle schema, migrations, Postgres/Redis client
│  ├─ search/       # Hybrid search adapter (FTS + trigram + pgvector)
│  ├─ secret/       # secret reference abstraction
│  └─ shared/       # 권한 상수, 공통 타입, Zod validation
├─ docker/          # compose + Dockerfiles + init-db SQL
└─ docs/            # 설계 메모, adr, plan, superpowers
```

## 기술 스택 (빠른 참조)

| 영역 | 기술 | 비고 |
|------|------|------|
| 모노레포 | pnpm workspace + Turborepo | `pnpm dev` / `pnpm build` |
| 프레임워크 | Next.js 15 (App Router) | React 19, server actions |
| DB | PostgreSQL 16 + Drizzle | `pgvector`, `pg_trgm`, `unaccent` 확장 |
| 세션/캐시 | Redis | `sessionId` 쿠키 |
| 오브젝트 스토리지 | MinIO | 버킷: `jarvis-files` |
| 잡 큐 | pg-boss | 워커 프로세스 분리 |
| AI | Anthropic (생성) + OpenAI (임베딩) | citation 포함 SSE |
| 인증 | OIDC (`openid-client`) | Authorization Code + PKCE |
| i18n | next-intl | 단일 로케일(ko), 네임스페이스 기반 |
| 테스트 | Vitest + Playwright | E2E는 Redis session inject |
| 스타일 | Tailwind CSS 4 | 디자인 재구성 예정 |

## 핵심 도메인

`packages/db/schema/*.ts`에 도메인별로 분리:

- **knowledge** — 사내 위키. page / version / claim / owner / tag / sensitivity(PUBLIC/INTERNAL/RESTRICTED/SECRET_REF_ONLY)
- **project** — 프로젝트 / task / inquiry / staff
- **system** — 사내 시스템 카탈로그 + 접근 정보(secret_ref)
- **attendance** — 근태 / 외근 관리
- **graph** — 아키텍처 그래프 / 관계 추출
- **audit** — 감사 로그 (불변)
- **search** — search_log / synonym / popular
- **file** — raw_source / attachment
- **review** — review_request
- **tenant / user / company / menu / code** — 조직·사용자·메뉴 트리·코드 마스터

## 주요 패턴

### 1. 페이지 구조 (Next.js App Router)

```
apps/web/app/(app)/{domain}/
├─ page.tsx              # Server Component, 기본 진입
├─ layout.tsx            # 도메인 layout (있을 수 있음)
├─ actions.ts            # server actions (use server)
├─ _components/
│  ├─ FooWidget.tsx      # client component ("use client")
│  └─ BarList.tsx
└─ [id]/
   ├─ page.tsx
   └─ edit/
      └─ page.tsx
```

- `(app)` 그룹 = 인증 필요 라우트
- `(auth)` 그룹 = 로그인/SSO 등 공개 라우트
- `_components` = 해당 페이지 전용 클라이언트 컴포넌트 (언더스코어 prefix로 라우트에서 제외)
- 전역 공통 컴포넌트는 `apps/web/components/`

### 2. 서버 액션 컨벤션

```ts
// apps/web/app/(app)/knowledge/[pageId]/actions.ts
"use server";

import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export async function pinPage(pageId: string): Promise<{ ok: boolean; pinnedAt: string | null }> {
  await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  // ... DB 쿼리
  return { ok: true, pinnedAt: new Date().toISOString() };
}
```

**필수:**
- 반환 타입 명시
- 첫 줄에 권한 체크
- null/undefined 구별
- sensitivity 필드 있는 엔티티는 sensitivity 필터도 적용

### 3. 검색 파이프라인 (`packages/search`)

Hybrid: FTS → trigram → freshness → sensitivity 필터 → synonym 확장 → 랭킹.

`SearchAdapter` 추상화를 통해 추후 외부 검색엔진으로 교체 가능.

### 4. Ask AI (`packages/ai`)

1. 질문 임베딩 (OpenAI)
2. `knowledge_claim` 벡터 유사도 검색
3. page에 대한 FTS 재랭킹
4. sensitivity/권한 필터
5. 상위 claim을 context로 조립
6. Anthropic 생성
7. `[source:N]` citation 추출
8. SSE 스트리밍 (text/source/done)

### 5. 파일 인제스트 파이프라인

```
웹 API (raw_source + attachment 저장) 
  → pg-boss `ingest` 잡 
  → 워커 (MinIO에서 파일 읽기 + 텍스트 추출)
  → parsed_content 저장
  → `embed` 잡 (claim 임베딩)
  → `compile` 잡 (summary 생성)
```

### 6. 권한 (RBAC + sensitivity)

- **RBAC**: `packages/shared/constants/permissions.ts`의 `PERMISSIONS` 상수, 역할별 매핑은 `ROLE_PERMISSIONS`
- **sensitivity**: `knowledge_page.sensitivity` 등 엔티티 자체 필드. RBAC 위에 추가로 적용.
- **시크릿 참조**: system access는 비밀번호 직접 저장 대신 `*_ref` 참조값 사용 (`packages/secret/`)

### 7. i18n

- 단일 로케일: `apps/web/messages/ko.json`
- next-intl 사용
- 네임스페이스 구조: `{Domain}.{Section}.{key}` (예: `Admin.Users.title`)
- 보간 변수: `"{count}개"`, `"{name}님"`
- 상세 규칙은 `jarvis-i18n` 스킬 참조

### 8. 워커 잡 스케줄

```
stale page check       : 매일 09:00
popular search aggregate: 매주 일요일 00:00
cleanup (로그/버전)     : 매월 1일 00:00
```

## 주요 명령어

```bash
# 개발 (web + worker 동시)
pnpm dev

# 개별 실행
pnpm --filter @jarvis/web dev
pnpm --filter @jarvis/worker dev

# 타입 체크 (web만)
pnpm --filter @jarvis/web type-check

# 전체 타입 체크
pnpm type-check

# Lint
pnpm --filter @jarvis/web lint

# 테스트
pnpm test
pnpm --filter @jarvis/web test -- --run

# DB
pnpm db:generate   # 스키마 → migration 파일 생성
pnpm db:migrate    # 마이그레이션 실행
pnpm db:push       # prod 직접 push (주의)
pnpm db:studio     # Drizzle Studio GUI
pnpm db:seed       # 시드 데이터

# E2E
pnpm --filter @jarvis/web exec playwright test
```

## 인프라 포트 (개발)

| 서비스 | 호스트 포트 |
|-------|------------|
| Next.js web | 3010 |
| PostgreSQL | 5436 |
| Redis | 6380 |
| MinIO API | 9100 |
| MinIO Console | 9101 |

## 자주 혼동되는 것

- **`apps/web/lib/`** vs **`packages/{auth,shared,ai}/`**:
  - `apps/web/lib/` = 웹 앱 전용 서버 헬퍼, 다른 앱이 import하지 않는 코드
  - `packages/*` = web과 worker가 공유하는 코드

- **server action** vs **route handler**:
  - form submit, 폼 기반 mutation → server action
  - REST API, 외부에서 호출 가능해야 함 → `route.ts`

- **`apps/web/components/`** vs **`apps/web/app/(app)/**/_components/`**:
  - 전자 = 전역 공통 (Button, Input, Layout)
  - 후자 = 해당 페이지 전용

- **Drizzle schema 변경 시**: 수동으로 `drizzle/*.sql`을 편집하지 말고 `pnpm db:generate` 사용.

## 상태 / 진행 중 이슈

- 디자인 전면 재구성 예정 — UI 스타일에 시간 쓰지 말 것
- 한국어 i18n 마이그레이션이 최근 진행됨 (`ko.json` 단일 파일)
- 5000명 엔터프라이즈 스케일을 1주 스프린트로 구축 중 — 속도 우선, 품질 유지
