---
name: jarvis-db-patterns
description: Jarvis(사내 업무 시스템 + LLM 컴파일 위키)의 Drizzle 스키마·마이그레이션·RBAC(34 권한, 5 역할)·sensitivity·Zod validation·트랜잭션 패턴 레퍼런스 + 경계면 교차 비교 체크리스트(shape/권한/sensitivity/nullable/마이그레이션/i18n). Drizzle 테이블 추가·수정, 마이그레이션 생성, 권한/민감도 필터 적용, server action 작성, Ask AI 세션 모델, Wiki projection 무결성, Case 독립 벡터 공간 등 DB와 닿는 모든 작업에서 반드시 이 스킬을 Read하라. superpowers:writing-plans가 계획을 작성하거나 superpowers:subagent-driven-development의 spec-reviewer가 경계면 검증을 수행할 때도 이 스킬의 섹션을 컨텍스트로 주입한다. "스키마 추가", "컬럼", "권한", "민감도", "마이그레이션", "Zod", "server action" 표현에서도 트리거된다.
---

# Jarvis DB · RBAC · Validation Patterns

Jarvis의 DB 레이어는 `packages/db/schema/*.ts`에 도메인별로 분리되어 있고(**31 파일 / 52 테이블**), 변경은 Drizzle → Zod validation → 권한 체크 → sensitivity 필터까지 연쇄된다. 이 스킬은 그 체인을 한 번에 올바르게 다루기 위한 참조다.

## 0. 스키마 파일 인벤토리 (현재 31개)

| 도메인 그룹 | 파일 | 주요 테이블 | sensitivity |
|------------|------|-----------|-------------|
| **Core/Tenancy** | `tenant.ts` | workspace, organization | — |
| **RBAC/User** | `user.ts`, `user-session.ts` | user, role, permission, user_role, role_permission, user_session | — |
| **Knowledge** | `knowledge.ts`, `review.ts` | knowledge_page, knowledge_page_version, knowledge_claim, owner, tag, review_request | **Yes** |
| **Wiki projection** | `wiki-page-index.ts`, `wiki-page-link.ts`, `wiki-page-source-ref.ts`, `wiki-commit-log.ts`, `wiki-lint-report.ts`, `review-queue.ts`(wiki_review_queue) | 6 테이블 | Yes (page-level) |
| **Ask AI** | `ask-conversation.ts`, `feedback.ts`, `directory.ts`, `llm-call-log.ts` | ask_conversation, ask_message, answer_feedback, directory_entry, llm_call_log | No (knowledge layer 경유) |
| **Project/Work** | `project.ts`, `additional-development.ts` | project, project_task, project_inquiry, project_staff, additional_development(+effort/revenue/staff) | No |
| **System Registry** | `system.ts` | system, system_access | Yes |
| **Case/Precedent** | `case.ts` | precedent_case, case_cluster | Yes (독립 벡터 공간) |
| **Graph** | `graph.ts` | graph_snapshot, graph_node, graph_edge, graph_community | Yes |
| **HR/근태** | `attendance.ts` | attendance, out_manage, out_manage_detail | No |
| **Master Data** | `company.ts`, `menu.ts`, `code.ts`, `notice.ts` | company, menu_item, code_group/item, notice | 일부 (notice) |
| **File/Audit/Search** | `file.ts`, `audit.ts`, `search.ts` | raw_source, attachment, audit_log, search_log, search_synonym, popular_search | file Yes |
| **Infra** | `embed-cache.ts` | embed_cache | — |

`packages/db/schema/index.ts`에서 모든 export를 확인한다. 도메인 분기가 애매하면 `index.ts`를 먼저 읽는다.

## 1. 스키마 추가·수정 워크플로우

### 1.1 스키마 파일 편집

```ts
// packages/db/schema/knowledge.ts
import { pgTable, text, timestamp, uuid, pgEnum, index } from "drizzle-orm/pg-core";

export const sensitivityEnum = pgEnum("sensitivity", [
  "PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY",
]);

export const knowledgePage = pgTable("knowledge_page", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  title: text("title").notNull(),
  sensitivity: sensitivityEnum("sensitivity").notNull().default("INTERNAL"),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  wsIdx: index("knowledge_page_ws_idx").on(t.workspaceId),
  wsSensIdx: index("knowledge_page_ws_sens_idx").on(t.workspaceId, t.sensitivity),
}));
```

**규칙:**
- `id`는 `uuid().primaryKey().defaultRandom()`
- `workspaceId`는 모든 테넌시 대상 테이블에 필수 (multi-tenant 격리)
- timestamp는 **항상** `{ withTimezone: true }`
- enum은 `pgEnum`으로 타입 안전성 확보 — 값 추가 시 마이그레이션 필요
- nullable/not null 명시적 결정 (애매하면 nullable)
- sensitivity 컬럼이 자주 필터되면 `(workspaceId, sensitivity)` 복합 인덱스

### 1.2 마이그레이션 생성

```bash
pnpm db:generate
```

→ `packages/db/drizzle/NNNN_*.sql` + `meta/NNNN_snapshot.json` 생성.

**절대 금지:**
- `drizzle/*.sql` 수동 편집
- `_journal.json` 직접 편집
- 기존 마이그레이션 번호 덮어쓰기

**꼭 할 것:**
- 생성된 SQL을 열어 `ALTER TABLE` / `CREATE INDEX`가 의도대로 나왔는지 확인
- 파괴적 변경(DROP COLUMN/TABLE)은 데이터 손실 여부 판단
- `scripts/check-schema-drift.mjs --precommit`로 drift 재확인 (CI 블로킹)

### 1.3 Zod validation 동기화

```ts
// packages/shared/validation/knowledge.ts
import { z } from "zod";

export const pinPageInput = z.object({ pageId: z.string().uuid() });
export const pinPageOutput = z.object({
  ok: z.boolean(),
  pinnedAt: z.string().datetime().nullable(),
});
```

- 입력·출력 스키마 쌍으로 정의 (server action 양쪽에서 사용)
- `.nullable()`(DB nullable) vs `.optional()`(입력 생략 가능) 구별
- 재사용 sub-schema(`sensitivityEnum`, `workspaceIdSchema`)는 별도 파일

## 2. 권한 상수 전수 (34개 · 5역할)

**모든 권한**은 `packages/shared/constants/permissions.ts`의 `PERMISSIONS` 상수에 정의.

```
도메인              상수 (합 34)
----------------  -----------------------------------------------------------------
Knowledge (6)     KNOWLEDGE_READ, _CREATE, _UPDATE, _DELETE, _REVIEW, _ADMIN
Project (5)       PROJECT_READ, _CREATE, _UPDATE, _DELETE, _ADMIN
System (5)        SYSTEM_READ, _CREATE, _UPDATE, _DELETE, SYSTEM_ACCESS_SECRET
Notice (4)        NOTICE_READ, _CREATE, _UPDATE, _DELETE
Additional Dev(4) ADDITIONAL_DEV_READ, _CREATE, _UPDATE, _DELETE
Attendance (3)    ATTENDANCE_READ, _WRITE, _ADMIN
Graph (2)         GRAPH_READ, GRAPH_BUILD
User (2)          USER_READ, USER_WRITE
Admin (2)         AUDIT_READ, ADMIN_ALL
Files (1)         FILES_WRITE
```

### 2.1 ROLE_PERMISSIONS 매핑 (5 역할)

| 역할 | 권한 개수 | 핵심 특이점 |
|------|----------|-------------|
| ADMIN | 34 (전부) | `Object.values(PERMISSIONS)` |
| MANAGER | 23 | Knowledge read/create/update/review, Project read/create/update, System read/create/update, Attendance read/admin, User read, Notice read/create/update, Graph full, Additional Dev full, Files write |
| DEVELOPER | 16 | **KNOWLEDGE_REVIEW 의도적 제외** (→ wiki_page_index RESTRICTED 차단), **SYSTEM_ACCESS_SECRET 명시적 포함**, Additional Dev read/update만 |
| HR | 일부 | Knowledge read, User read, Attendance admin, Notice full, Graph read |
| VIEWER | 일부 | read-only 전반 (Knowledge/Project/System/Attendance/Graph/Notice/Additional Dev) |

새 권한 추가 시:
- 네이밍: `{domain}:{action}` (콜론 구분)
- `ADMIN`은 자동 포함, 다른 역할은 명시 추가
- 관련 UI·audit·테스트 업데이트

### 2.2 권한 체크 헬퍼 (`packages/auth/rbac.ts`)

```ts
hasPermission(userRoles, PERMISSIONS.X)
isAdmin(userRoles)
canAccessKnowledgeSensitivity(userMaxSensitivity, row.sensitivity)
buildLegacyKnowledgeSensitivitySqlFilter(userMaxSensitivity)  // 쿼리 레벨
```

`requirePermission(PERMISSIONS.X)`은 `packages/auth/session.ts`에서 export. 세션 + 권한을 한 번에 해결.

## 3. Server Action 두 가지 패턴

### 3.1 권한 기반 도메인 (Knowledge, Project, System, Notice 등)

```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { db } from "@jarvis/db";
import { knowledgePage } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { pinPageInput, pinPageOutput } from "@jarvis/shared/validation";

export async function pinPage(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE);
  const { pageId } = pinPageInput.parse(raw);

  const [updated] = await db
    .update(knowledgePage)
    .set({ pinnedAt: new Date() })
    .where(and(
      eq(knowledgePage.id, pageId),
      eq(knowledgePage.workspaceId, session.workspaceId),
      // sensitivity 필터: 쿼리 레벨 필수
      canAccessKnowledgeSensitivity(knowledgePage.sensitivity, session.maxSensitivity),
    ))
    .returning({ pinnedAt: knowledgePage.pinnedAt });

  return pinPageOutput.parse({
    ok: !!updated,
    pinnedAt: updated?.pinnedAt?.toISOString() ?? null,
  });
}
```

체크리스트:
- [x] 첫 줄 `requirePermission`
- [x] 입력 `.parse()`
- [x] `workspaceId` 필터
- [x] sensitivity 필터 (엔티티에 있을 경우)
- [x] 출력 `.parse()` (shape 보장)

### 3.2 세션 기반 도메인 (Ask AI, Feedback 등)

Ask는 권한이 아닌 **세션·workspace·user 스코프** 모델이다. 권한 체크 대신 `requireSession`.

```ts
"use server";
import { requireSession } from "@jarvis/auth";
import { db } from "@jarvis/db";
import { askConversation, askMessage } from "@jarvis/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

export async function listConversations() {
  const session = await requireSession();

  const [rows, [countRow]] = await Promise.all([
    db.select({ id: askConversation.id, title: askConversation.title })
      .from(askConversation)
      .where(and(
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),   // 이중 필터 필수
      ))
      .orderBy(desc(askConversation.updatedAt)),
    db.select({ count: count() })
      .from(askConversation)
      .where(and(
        eq(askConversation.workspaceId, session.workspaceId),
        eq(askConversation.userId, session.userId),
      )),
  ]);

  return { rows, total: countRow?.count ?? 0 };
}
```

체크리스트:
- [x] `requireSession` (권한 아님)
- [x] `workspaceId` + `userId` 이중 필터
- [x] sensitivity 필터는 knowledge layer에서 간접적용 (page-first retrieval이 이미 sensitivity 거침)
- [x] Conversation FIFO 삭제 정책 지키기 (`MAX_CONVERSATIONS_PER_USER`)

## 4. Sensitivity 필터 적용

sensitivity 컬럼이 있는 엔티티: `knowledge_page`, `wiki_page_index`, `system`, `graph_snapshot`, `precedent_case`, `raw_source`, `notice`(PUBLIC/INTERNAL만).

**규칙:**
- 쿼리 WHERE 절에서 필터 (애플리케이션 레벨 `rows.filter()` 금지 — count/pagination 어긋남)
- `SECRET_REF_ONLY` 페이지는 본문 대신 `secretRef` ID만 반환 (별도 분기)
- Admin은 전체 허용 (`canAccessKnowledgeSensitivity` 내부에서 처리)

금지:
- 클라이언트에서 sensitivity 필터링
- `SELECT *` 후 앱 레벨 필터링

## 5. 도메인별 특수 패턴

### 5.1 Wiki projection 무결성

Wiki 테이블은 **워커 sync 잡만** INSERT/UPDATE한다. UI server action은 **조회만**.

- `wiki_page_index.commitSha` = git HEAD (`pnpm wiki:check`가 검증)
- `wiki_page_index.body` 컬럼에 본문 쓰지 않음 (디스크 SSoT)
- `kind` enum이 있는 리뷰 큐(`wiki_review_queue`): `contradiction | lint | heal | sensitivity_promotion | boundary_violation` 등
- `affectedPages`는 jsonb로 복수 페이지 저장

상세는 `jarvis-wiki-feature` 스킬.

### 5.2 Case/Precedent 독립 벡터 공간

`precedent_case`는 **pg-search와 분리된** 벡터 공간(TF-IDF+SVD). 절대 knowledge 검색과 혼합하지 않는다. clustering:
- `case_cluster.numericClusterId` = workspace-scoped UNIQUE
- application-level FK: `precedent_case.clusterId` → `case_cluster.numericClusterId`
- digest 페이지: `isDigest=true` + `digestPageId`(wiki 페이지 참조)

### 5.3 Ask AI Conversation 모델

- `ask_conversation`: workspace + user 스코프
- `ask_message`: conversation 하위, role(user/assistant/system)·content·sources(jsonb)·cost(llm_call_log 참조)
- 삭제 정책: user당 최대 N개 유지(FIFO). 초과 시 오래된 것부터 cascade 삭제
- sensitivity 필터는 page-first retrieval 단계에서 처리되므로, ask 테이블 자체엔 sensitivity 없음

### 5.4 LLM Call Log

`llm_call_log`에 모든 LLM 호출 기록. 내용:
- provider(anthropic/openai), model, phase(analyze/generate/synth/tutor 등), promptVersion
- inputTokens, outputTokens, latencyMs, costUsd
- workspaceId + userId + conversationId(optional) 태깅

`packages/ai/budget.ts`가 여기를 집계해 일일 예산 검증(`pnpm eval:budget-test`).

### 5.5 additional_development 4-테이블 모델

```
additional_development            (프로젝트 메타)
├─ additional_development_effort  (공수)
├─ additional_development_revenue (매출)
└─ additional_development_staff   (투입 인력)
```

- FK는 드리즐 레벨 선언 + 애플리케이션 레벨 cascade delete
- 모든 하위 테이블에 workspaceId 중복 저장(쿼리 격리 강화)

### 5.6 Notice의 제한된 sensitivity

`notice.sensitivity`는 `PUBLIC` 또는 `INTERNAL`만 허용(enum 범위 제한). `RESTRICTED`/`SECRET_REF_ONLY` 쓰지 않는다 — 공지 목적상 의도적.

## 6. 트랜잭션 + Audit

거의 모든 mutation은 `audit_log` 기록과 함께 트랜잭션.

```ts
await db.transaction(async (tx) => {
  const [page] = await tx.update(knowledgePage).set({ ... }).where(...).returning();
  await tx.insert(knowledgePageVersion).values({ ... });
  await tx.insert(auditLog).values({
    workspaceId: session.workspaceId,
    userId: session.userId,
    action: "knowledge.update",
    targetType: "knowledge_page",
    targetId: page.id,
    diff: { ... },
  });
});
```

`audit_log`는 **불변**. UPDATE/DELETE 하지 말 것.

## 7. 인덱싱 가이드

- 외래 키 컬럼은 항상 인덱스
- 검색 컬럼은 `pg_trgm` 인덱스
- 전문 검색은 `search_vector`(tsvector) + GIN
- 벡터는 `pgvector`의 `ivfflat` 또는 `hnsw`
- sensitivity 필터가 잦은 테이블은 `(workspaceId, sensitivity)` 복합 인덱스
- Ask AI conversation 목록은 `(workspaceId, userId, updatedAt desc)` 복합 인덱스

## 8. 흔한 실수

| 실수 | 증상 | 해결 |
|------|------|------|
| `pnpm db:generate` 누락 | 앱이 구 스키마로 동작 | 스키마 변경 후 반드시 실행 |
| `workspaceId` 필터 누락 | 다른 테넌트 데이터 노출 | 모든 쿼리에 필수 |
| sensitivity 필터 누락 | 권한 없는 문서 노출 | 쿼리 WHERE 레벨 필터 + 헬퍼 재사용 |
| 클라이언트 sensitivity 필터 | pagination/count 틀어짐 + 누수 | 서버에서만 |
| Zod output parse 생략 | 클라이언트가 잘못된 shape 수신 | `.parse()` 후 반환 |
| 마이그레이션 파일 수동 편집 | 다음 `db:generate`에서 충돌 | 스키마 파일만 수정 |
| enum 값 추가 후 앱만 배포 | DB enum 없어 에러 | 마이그레이션 먼저 |
| Ask AI에 `requirePermission` 사용 | Ask는 권한 기반 아님 → 과다 권한 | `requireSession` 사용 |
| Wiki server action에서 `wiki_page_index` 쓰기 | projection 무결성 파괴 | 워커 sync 잡만 쓰기 |
| precedent_case를 knowledge 검색과 혼합 | 벡터 공간 오염 | `packages/search/precedent-search.ts` 전용 |
| timestamp에 timezone 누락 | 시간 불일치 | `{ withTimezone: true }` |

## 9. 경계면 교차 비교 체크리스트 (리뷰 단계)

superpowers:requesting-code-review / superpowers:subagent-driven-development의 spec-reviewer가 Jarvis DB 계층 변경을 검증할 때 반드시 확인할 체크리스트. "파일이 존재하는가"가 아니라 "양쪽이 같은 shape을 기대하는가"를 검사한다 — 타입체커만으로는 잡히지 않는 silent bug를 잡기 위함.

### 9.1 Server action shape ↔ 클라이언트 훅

server action의 **반환 타입**과 클라이언트에서 구조분해하는 **필드명**이 1:1로 일치해야 한다. `undefined` vs `null`도 구분한다.

| server 쪽 | client 쪽 | 검증 |
|-----------|-----------|------|
| `pinPage()` returns `{ ok: boolean; pinnedAt: string \| null }` | `PinButton.tsx` destructures `{ ok, pinnedAt }` | 양쪽 파일 동시 Read → 필드명/nullable 일치 |
| Zod `pinPageOutput` schema | 클라이언트가 기대하는 prop 타입 | schema와 prop 타입이 같은 source of truth를 공유하는지 |

검증 방법: server action 파일과 그 결과를 소비하는 client component를 **동시에 Read한 뒤 비교**. 한쪽만 읽으면 경계면 버그를 놓친다.

### 9.2 권한 상수 ↔ server action 호출

계획 단계에서 결정한 RBAC(예: `KNOWLEDGE_UPDATE` 필요)과 실제 코드의 `requirePermission(PERMISSIONS.X)` 호출이 정확히 맞아야 한다. 타입체커가 잡아주지 않는 silent bug.

| 계획 | 구현 | 검증 |
|------|------|------|
| "이 action은 `KNOWLEDGE_UPDATE` 필요" | `requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE)` 첫 줄 호출 | 계획 문서와 실제 코드 대조 |
| Ask AI 계열 | `requireSession` (권한 아님) + `workspaceId + userId` 이중 필터 | 잘못 `requirePermission`을 쓰면 과다 권한 |

server action 파일의 **첫 번째 await 호출**을 반드시 확인한다. 권한 체크가 누락되면 P0 이슈.

### 9.3 sensitivity 필터 ↔ 조회 쿼리

`sensitivity` 컬럼을 가진 엔티티(`knowledge_page`, `wiki_page_index`, `system`, `graph_snapshot`, `precedent_case`, `raw_source`, `notice`)의 조회는 **쿼리 WHERE 절**에 sensitivity 필터가 있어야 한다.

| 조회 | sensitivity 필터 | 검증 |
|------|------------------|------|
| `listKnowledgePages` | `canAccessKnowledgeSensitivity(...)` 또는 `buildLegacyKnowledgeSensitivitySqlFilter(...)` 쿼리에 포함 | `.filter(...)` 같은 애플리케이션 레벨 필터 있으면 실패 |
| `SELECT * FROM knowledge_page WHERE workspaceId = ...` | sensitivity 절 없음 | **위험 신호**, 즉시 반려 |

`rows.filter(...)` 같은 앱 레벨 필터는 count/pagination을 무너뜨리고 RESTRICTED 누수를 일으킨다. 발견 즉시 P0.

### 9.4 Drizzle nullable ↔ validation/UI null 처리

스키마가 nullable로 선언한 컬럼은 validation(Zod `.nullable()`)과 UI(옵셔널 렌더링) 양쪽에서 null을 명시적으로 다뤄야 한다.

| Drizzle | Zod | UI |
|---------|-----|-----|
| `pinnedAt: timestamp(...).nullable()` | `pinnedAt: z.string().datetime().nullable()` | `pinnedAt ? <Tag>{...}</Tag> : null` |

한 쪽만 nullable이면 런타임 에러 가능.

### 9.5 마이그레이션 ↔ 스키마 파일

`pnpm db:generate` 실행 후 `drizzle/NNNN_*.sql`이 스키마 파일 변경과 일치하는지 diff 확인. `node scripts/check-schema-drift.mjs --precommit`으로 blocking 검증.

| 상태 | 의미 |
|------|------|
| `exit 0` | 스키마 ↔ drizzle/ 동기화됨 |
| `exit 1` | drift 존재 → `pnpm db:generate` 재실행 또는 스키마 수정 |

### 9.6 i18n 보간 변수 교차 비교

DB 변경이 UI 문자열(예: "{count}건 선택됨")에 영향 주면 i18n 키·보간 변수 일치 확인은 `jarvis-i18n` 스킬 "경계면 검증" 섹션 따라 수행.

### 9.7 리뷰 수행 원칙 — 리뷰어는 수정하지 않는다

spec-reviewer는 **발견만** 하고 수정은 implementer에게 되돌린다. 이유:

- 책임 분리: reviewer가 코드를 직접 고치면 다음 리뷰를 누가 수행할지 경계가 흐려진다
- 학습 기회: implementer가 같은 실수를 반복하지 않게 되돌림으로 신호를 준다
- 감사 추적: "누가 무엇을 고쳤는가"가 명확하려면 한 역할만 쓰기를 담당

예외: 명백한 타이포 1자 수정처럼 reviewer가 고쳐도 손해가 없는 경우. 판단이 애매하면 implementer에게 넘긴다. superpowers:subagent-driven-development의 기본 루프("implementer fixes → reviewer re-reviews")와 부합한다.

### 9.8 리뷰 보고서 표 템플릿

spec-reviewer는 결과를 산문이 아니라 아래 5개 표로 구조화해 보고한다. 체크리스트가 아닌 "채워지지 않은 표"는 검증 누락 신호다.

```markdown
## 자동화 통과 여부
- [x/FAIL] pnpm --filter @jarvis/web type-check
- [x/FAIL] pnpm --filter @jarvis/web lint
- [x/FAIL] pnpm test (영향 범위)
- [x/FAIL] node scripts/check-schema-drift.mjs --precommit (스키마 변경 시)
- [x/FAIL] pnpm wiki:check (wiki 도메인 변경 시)
- [x/FAIL] pnpm audit:rsc (RSC 경계 변경 시)
- [x/FAIL] pnpm eval:budget-test (AI 파이프라인 변경 시)

## Shape 일치
| server 쪽 | client 쪽 | 상태 | 비고 |
|-----------|-----------|------|------|
| `pinPage()` returns `{ ok, pinnedAt: string \| null }` | `PinButton.tsx` destructures `{ ok, pinnedAt }` | OK | — |

## i18n 키·보간 변수 일치
| ko.json 경로 | 사용처 | 보간 변수 | 상태 |
|-------------|--------|-----------|------|
| `Knowledge.Detail.pin` | `PinButton.tsx:23` | 없음 | OK |

## 권한 검증
| server action | 필요 권한 | 실제 코드 | 상태 |
|--------------|-----------|-----------|------|
| `pinPage` | `KNOWLEDGE_UPDATE` | `requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE)` | OK |

## sensitivity 필터 검증
| 조회 | sensitivity 필터 | 상태 |
|------|------------------|------|
| `listKnowledgePages` | `canAccessKnowledgeSensitivity(...)` 쿼리에 포함 | OK |
```

Wiki 도메인이 포함된 PR에서는 아래 표도 추가:

```markdown
## Wiki 경계 검증
| 항목 | 상태 |
|------|------|
| auto/ 경로에 사람 편집 UI 노출 안 함 (viewer only) | |
| manual/ 경로에 LLM 출력 직접 쓰기 안 함 (review-queue 경유) | |
| wiki-fs API 경유 (fs.writeFile / child_process.exec('git') 직접 호출 없음) | |
| wiki_page_index projection 테이블에 본문 쓰기 없음 | |
| raw chunk RAG 패턴 사용 없음 (page-first만) | |
```

**빈 셀이 있으면** 해당 항목이 검증되지 않은 것 — spec-reviewer는 빈 셀을 남기지 말고 모든 셀을 OK 또는 FAIL로 채워야 한다.

## 10. 참고 파일

- `packages/db/schema/index.ts` — 모든 도메인 export 진입점
- `packages/db/drizzle.config.ts` — drizzle-kit 설정
- `packages/db/seed/dev.ts` — 시드 데이터 예시
- `packages/shared/validation/` — 도메인별 Zod 스키마
- `packages/shared/constants/permissions.ts` — 34 권한 + 5 역할 매핑
- `packages/auth/rbac.ts` — 권한/민감도 헬퍼
- `packages/auth/session.ts` — `requireSession`, `requirePermission`, `getSession`
- `scripts/check-schema-drift.mjs` — drift 검증(`--hook|--precommit|--ci`)
