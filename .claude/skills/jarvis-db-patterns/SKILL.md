---
name: jarvis-db-patterns
description: Jarvis 프로젝트의 Drizzle 스키마·마이그레이션·RBAC·sensitivity 적용 패턴. Drizzle 테이블 추가·수정, 마이그레이션 생성, 권한/민감도 필터 적용, Zod validation 동기화가 필요할 때 반드시 이 스킬을 사용하라. jarvis-planner, jarvis-builder가 DB 변경을 다룰 때 트리거된다.
---

# Jarvis DB + RBAC + Validation Patterns

Jarvis의 DB 스키마는 `packages/db/schema/*.ts`에 도메인별로 분리되어 있고, 모든 변경은 Drizzle → Zod validation → 권한 체크 → sensitivity 필터까지 연쇄된다. 이 스킬은 그 전체 체인을 한 번에 올바르게 다루기 위한 참조다.

## 스키마 추가·수정 워크플로우

### 1. 스키마 파일 편집

파일은 `packages/db/schema/{domain}.ts`. 도메인 구분은 `packages/db/schema/index.ts`에서 확인.

```ts
// packages/db/schema/knowledge.ts
import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";

export const sensitivityEnum = pgEnum("sensitivity", [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY"
]);

export const knowledgePage = pgTable("knowledge_page", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  title: text("title").notNull(),
  sensitivity: sensitivityEnum("sensitivity").notNull().default("INTERNAL"),
  // 새 컬럼 추가 예시:
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**규칙:**
- `id`는 `uuid().primaryKey().defaultRandom()`
- `workspaceId`는 모든 테넌시 대상 테이블에 필수 (multi-tenant)
- timestamp는 `{ withTimezone: true }` 사용
- enum은 `pgEnum`으로 타입 안전성 확보
- nullable/not null을 명시적으로 결정 (애매하면 nullable)

### 2. 마이그레이션 생성

```bash
pnpm db:generate
```

→ `packages/db/drizzle/NNNN_*.sql`과 `packages/db/drizzle/meta/NNNN_snapshot.json`이 생성된다.

**절대 하지 말 것:**
- `drizzle/*.sql`을 수동 편집. 스키마 파일을 고치고 재생성한다.
- `_journal.json`을 직접 편집.
- 기존 마이그레이션 번호를 덮어쓰기.

**해야 할 것:**
- 생성된 SQL을 열어보고 `ALTER TABLE` / `CREATE INDEX`가 의도한 대로 나왔는지 확인
- 파괴적 변경(DROP COLUMN, DROP TABLE)은 데이터 손실 여부 검토
- 복합 인덱스가 필요하면 스키마에 `index()` / `uniqueIndex()` 추가

### 3. Zod validation 동기화

스키마가 바뀌면 `packages/shared/validation/*.ts`도 같이 업데이트.

```ts
// packages/shared/validation/knowledge.ts
import { z } from "zod";

export const pinPageInput = z.object({
  pageId: z.string().uuid(),
});

export const pinPageOutput = z.object({
  ok: z.boolean(),
  pinnedAt: z.string().datetime().nullable(),
});
```

**규칙:**
- 입력·출력 스키마를 모두 정의 (server action 양쪽에서 사용)
- `.nullable()`과 `.optional()`을 구별 — DB의 nullable 컬럼은 `.nullable()`, 입력의 생략 가능은 `.optional()`
- 재사용 가능한 sub-schema는 분리 (`sensitivityEnum`, `workspaceIdSchema` 등)

### 4. 권한 상수 추가 (필요 시)

새 action이 기존 권한으로 커버되지 않으면 `packages/shared/constants/permissions.ts`에 추가:

```ts
export const PERMISSIONS = {
  KNOWLEDGE_READ: "knowledge:read",
  // ...
  KNOWLEDGE_PIN: "knowledge:pin",  // 새 권한
} as const;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: Object.values(PERMISSIONS) as Permission[],  // 자동 포함
  MANAGER: [
    // 기존 권한들...
    PERMISSIONS.KNOWLEDGE_PIN,  // 명시적 추가
  ],
  // ...
};
```

**규칙:**
- 네이밍: `{domain}:{action}` (콜론 구분)
- `ADMIN`은 `Object.values(PERMISSIONS)`로 자동 모든 권한
- 다른 역할은 개별 명시
- 새 권한을 추가하면 관련 테스트·문서 업데이트

### 5. Server action / route에서 사용

```ts
// apps/web/app/(app)/knowledge/[pageId]/actions.ts
"use server";
import { requirePermission, getSession } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { db } from "@jarvis/db";
import { knowledgePage } from "@jarvis/db/schema";
import { eq, and } from "drizzle-orm";
import { pinPageInput, pinPageOutput } from "@jarvis/shared/validation";

export async function pinPage(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.KNOWLEDGE_PIN);
  const { pageId } = pinPageInput.parse(raw);

  const [updated] = await db
    .update(knowledgePage)
    .set({ pinnedAt: new Date() })
    .where(and(
      eq(knowledgePage.id, pageId),
      eq(knowledgePage.workspaceId, session.workspaceId),
      // sensitivity 필터도 적용:
      canAccessSensitivity(knowledgePage.sensitivity, session.maxSensitivity)
    ))
    .returning({ pinnedAt: knowledgePage.pinnedAt });

  return pinPageOutput.parse({
    ok: !!updated,
    pinnedAt: updated?.pinnedAt?.toISOString() ?? null,
  });
}
```

**체크리스트:**
- [x] 첫 줄에 `requirePermission`
- [x] 입력을 `parse()`로 validation
- [x] `workspaceId` 필터 (multi-tenant 격리)
- [x] sensitivity 필터 (엔티티에 있을 경우)
- [x] 출력을 `parse()`로 validation (shape 보장)
- [x] 반환 타입이 클라이언트가 기대하는 shape과 일치

## Sensitivity 필터 적용 규칙

sensitivity 컬럼이 있는 엔티티: `knowledge_page`, 필요 시 `file`, `raw_source` 등.

**필터 로직 (의사코드):**
```
session.role == ADMIN → 모든 sensitivity 허용
session.maxSensitivity >= row.sensitivity → 허용
SECRET_REF_ONLY → 본문은 가리고 메타만 반환 (별도 처리)
```

구체적 구현은 `packages/auth/rbac.ts` 또는 유사 헬퍼를 재사용.

**절대 하지 말 것:**
- 클라이언트에서 sensitivity 필터링 (서버에서 해야 함)
- `SELECT *` 후 앱 레벨에서 필터링 (쿼리 자체에 WHERE 조건으로 넣어야 함)

## 트랜잭션

여러 테이블을 함께 수정할 때:

```ts
await db.transaction(async (tx) => {
  await tx.insert(knowledgePage).values({ ... });
  await tx.insert(knowledgePageVersion).values({ ... });
  await tx.insert(auditLog).values({ ... });
});
```

`audit_log` 기록은 거의 모든 mutation에서 필요.

## 인덱싱 가이드

- 외래 키 컬럼은 항상 인덱스
- 검색에 쓰이는 컬럼은 `pg_trgm` 인덱스
- 전문 검색은 `search_vector` (tsvector) 컬럼 + GIN 인덱스
- 벡터는 `pgvector`의 `ivfflat` 또는 `hnsw` 인덱스
- sensitivity 필터가 자주 쓰이면 `(workspaceId, sensitivity)` 복합 인덱스

## 흔한 실수

| 실수 | 증상 | 해결 |
|------|------|------|
| `pnpm db:generate` 안 돌림 | 앱이 구 스키마로 동작 | 스키마 변경 후 반드시 실행 |
| `workspaceId` 필터 누락 | 다른 테넌트 데이터 노출 | 모든 쿼리에 `eq(workspaceId, ...)` |
| sensitivity 필터 누락 | 권한 없는 문서 노출 | 엔티티별 sensitivity 헬퍼 재사용 |
| Zod output parse 생략 | 클라이언트가 잘못된 shape 수신 | `.parse()` 후 반환 |
| 마이그레이션 파일 직접 편집 | 다음 `db:generate`에서 충돌 | 스키마 파일만 수정 |
| enum 값 추가 후 앱만 배포 | DB enum 없어 에러 | 마이그레이션 먼저 |
| timestamp에 timezone 누락 | 서버/클라이언트 시간 불일치 | `{ withTimezone: true }` 기본 |

## 참고 파일

- `packages/db/schema/index.ts` — 모든 도메인 export
- `packages/db/drizzle.config.ts` — drizzle-kit 설정
- `packages/db/seed/dev.ts` — 시드 데이터 예시
- `packages/shared/validation/` — 도메인별 Zod 스키마
- `packages/shared/constants/permissions.ts` — 권한 상수
- `packages/auth/rbac.ts` — 권한 체크 헬퍼
