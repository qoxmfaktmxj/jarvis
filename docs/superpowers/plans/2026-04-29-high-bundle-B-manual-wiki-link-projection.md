# 2026-04-29 — HIGH Bundle B: Manual Wiki Save Link Projection

## 배경

P0 PR #31 머지 후 follow-up. Architect 리뷰의 [CRIT-2] (이번 분류상 HIGH-2): manual wiki save가 `wiki_page_link` projection을 갱신하지 않아 outbound link drift 발생. ingest 경로(`write-and-commit.ts`의 `projectLinks`)는 항상 재계산하지만, manual save는 `wiki_page_index`만 upsert.

브랜치: `claude/high-B-manual-wiki-projection` / 베이스: `main` (84432d2)
워크트리: `C:\Users\kms\Desktop\dev\jarvis\.claude\worktrees\high-b-manual-wiki-projection`

## 결함 요약

- 위치: `apps/web/app/(app)/wiki/manual/[workspaceId]/edit/[...path]/actions.ts:161-204` (`saveWikiPage` 함수의 projection 단계)
- 결함:
  1. `wiki_page_link` 테이블이 manual save 후 stale 상태 유지
  2. 사용자가 `[[other-page]]` 링크 추가/삭제해도 link projection 미갱신
  3. → page-first `expandOneHop` (Ask AI), lint의 broken-link/orphan 분석 모두 부정확한 1-hop 그래프에서 동작
- 영향: Karpathy 위키 projection 무결성 위반 (원칙 1 — DB는 projection only지만 정확성 보장 의무).

## 핵심 수정

`saveWikiPage`의 wiki_page_index upsert 트랜잭션에 link projection 동기화 추가.

### 참조: ingest 경로의 projectLinks (이미 존재)
- 위치: `apps/worker/src/jobs/ingest/write-and-commit.ts` `projectLinks` 함수
- 동작: `parseWikilinks(body)` → 동일 트랜잭션 안에서 `wiki_page_link` DELETE WHERE source=workspace+path → INSERT 새 outbound 링크
- 통합 테스트: `apps/worker/src/__tests__/integration/wiki-link-projection.test.ts`

### 수정안

1. `parseWikilinks` 호출을 위한 import 추가 (`@jarvis/wiki-fs`)
2. wiki_page_index upsert를 `db.transaction`으로 감싸기
3. 같은 tx 안에서:
   - `tx.delete(wikiPageLink).where(and(eq(wikiPageLink.workspaceId, ws), eq(wikiPageLink.sourcePath, repoRelPath)))`
   - `parseWikilinks(incomingBody)` → 정상 슬러그만 (manual save도 ingest처럼 broken link 검증할지 결정 필요 — 이번 PR scope: **검증 X, 그냥 모두 INSERT**. broken link 검증은 별도 follow-up)
   - `tx.insert(wikiPageLink).values([{...}])`
4. 트랜잭션 실패 시 기존 `projection_failed` 에러로 일관 처리

### 옵션: 공유 유틸 추출
- `projectLinks`를 `apps/worker/src/jobs/ingest/write-and-commit.ts`에서 추출해 `packages/wiki-agent/src/projection.ts` (또는 `packages/wiki-fs/src/projection.ts` — wiki-fs는 fs+git만이므로 wiki-agent가 적합)에 export
- web과 worker 양쪽에서 import
- **결정 필요**: 추출 vs 인라인 복제. 추출이 유지보수 우월하나 PR 범위 증가.
- **권장: 추출** (DRY + 향후 lint 검증 통일 시 단일 진입점)

### parseWikilinks 동작 확인
- `packages/wiki-fs/src/wikilink.ts` 정의 위치 확인 + return shape (slug 배열? 객체?)
- 기존 사용처: `apps/worker/src/jobs/ingest/write-and-commit.ts`, `scripts/wiki-reproject.ts`, `scripts/weave-wikilinks.ts`

## 영향도 체크리스트 (17계층)

| 계층 | 영향 |
|------|------|
| DB 스키마 | 없음 (wiki_page_link 테이블 기존) |
| Validation | 없음 |
| 권한 (34) | 없음 |
| 세션 vs 권한 | 없음 |
| Sensitivity 필터 | 없음 |
| Ask AI agent | 간접 (page-first 1-hop 그래프 정확도 향상) |
| Wiki-fs | 공유 유틸 추출 시 `packages/wiki-agent/src/projection.ts` 신규 또는 `wiki-fs` 확장 |
| 검색 | 없음 |
| 서버 액션/API | **수정** `apps/web/app/(app)/wiki/manual/.../actions.ts` |
| 서버 lib | 없음 |
| UI 라우트 | 없음 |
| UI 컴포넌트 | 없음 |
| i18n 키 | 없음 |
| 테스트 | manual-save link projection 신규 / 공유 유틸 단위 테스트 |
| 워커 잡 | `write-and-commit.ts`가 공유 유틸 사용으로 변경 (refactor only) |
| LLM 호출 | 없음 |
| Audit | 없음 |

## 파일 변경 순서 (20단계)

```
 7. packages/wiki-fs/src/wikilink.ts          (parseWikilinks 동작 확인 — 변경 없을 가능성)
 8. packages/wiki-agent/src/projection.ts     (신규: projectLinks 공유 유틸 추출)
13. apps/web/app/(app)/wiki/manual/[workspaceId]/edit/[...path]/actions.ts (saveWikiPage 트랜잭션화)
18. apps/worker/src/jobs/ingest/write-and-commit.ts (projectLinks 호출을 공유 유틸로 교체)
20. **테스트**
    - packages/wiki-agent/src/__tests__/projection.test.ts (신규 단위)
    - apps/web/app/(app)/wiki/manual/.../actions.test.ts (manual save link projection)
    - ingest 경로(apps/worker/src/jobs/ingest/write-and-commit.ts) 코드는 **무변경**.
      따라서 별도 회귀 테스트 추가 없이 "diff 0줄 + ingest 단위 테스트 PASS"로 충족한다.
      (워크스페이스 통합 테스트 `wiki-link-projection.test.ts`는 현재 레포에 존재하지 않으며,
      local PG 부재 환경에서는 어차피 skip된다. 향후 시그니처 통일 시점에 신설 권장.)
```

## TDD 순서

### red 1: 공유 유틸 단위 테스트
`packages/wiki-agent/src/__tests__/projection.test.ts`:
- `parseWikilinks(body)` 결과를 `wiki_page_link` row로 매핑하는 순수 함수 시그니처 정의
- 동일 source path 중복 링크는 dedup
- broken link(존재하지 않는 slug)는 그대로 INSERT (lint가 별도로 잡음)

### red 2: manual save 통합
`apps/web/app/(app)/wiki/manual/.../actions.test.ts` 신규 또는 기존 보강:
- saveWikiPage 호출 후 mock db.transaction이 호출되는지
- transaction 안에서 wiki_page_link DELETE + INSERT가 호출되는지
- body에 `[[foo]]` 1개 + `[[bar]]` 1개 → 2개 row INSERT 기대
- body에 link 0개 → DELETE만 호출 (이전 링크 정리)

### green 구현

**packages/wiki-agent/src/projection.ts** (신규):
```ts
import { parseWikilinks } from "@jarvis/wiki-fs";
import { wikiPageLink } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
// or use `Tx` type from drizzle-orm/postgres for transaction context

export interface ProjectLinksInput {
  workspaceId: string;
  sourcePath: string;        // wiki/{ws}/manual/foo.md
  body: string;              // markdown body (frontmatter 제거된 본문)
}

export async function projectLinks(
  tx: { delete: any; insert: any }, // drizzle Tx
  input: ProjectLinksInput,
): Promise<void> {
  await tx
    .delete(wikiPageLink)
    .where(
      and(
        eq(wikiPageLink.workspaceId, input.workspaceId),
        eq(wikiPageLink.sourcePath, input.sourcePath),
      ),
    );

  const links = parseWikilinks(input.body); // [{slug, alias?, raw, ...}]
  if (links.length === 0) return;

  // dedup by slug — 같은 페이지를 여러 번 링크해도 1 row
  const uniqueSlugs = new Set(links.map((l) => l.slug));
  await tx.insert(wikiPageLink).values(
    [...uniqueSlugs].map((slug) => ({
      workspaceId: input.workspaceId,
      sourcePath: input.sourcePath,
      targetSlug: slug,
    })),
  );
}
```

`wiki_page_link` 스키마 read 후 정확한 필드명 조정. `linkType` / `aliases` 등 추가 필드가 있다면 ingest 경로에서 어떻게 채우는지 동일하게 따라.

**apps/web/app/(app)/wiki/manual/.../actions.ts**:
- 기존 try/catch 안의 `db.insert(wikiPageIndex).values(...).onConflictDoUpdate(...)`를 `db.transaction(async tx => { ... })`로 감쌈
- tx 안에서: index upsert → `await projectLinks(tx, { workspaceId, sourcePath: repoRelPath, body: incomingBody })`
- 실패 시 기존 `projection_failed` 반환

**apps/worker/src/jobs/ingest/write-and-commit.ts**:
- 기존 inline projectLinks 함수를 공유 유틸 `@jarvis/wiki-agent/projection`의 `projectLinks` 호출로 교체
- 시그니처가 일치하지 않으면 wrapper로 어댑트

## 검증 게이트

```
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm --filter @jarvis/web test --run wiki && pnpm --filter @jarvis/web test --run wiki
pnpm --filter @jarvis/worker type-check && pnpm --filter @jarvis/worker type-check
pnpm --filter @jarvis/worker test --run wiki-link-projection write-and-commit
pnpm --filter @jarvis/wiki-agent type-check (있으면)
pnpm wiki:check (필수 — wiki-fs ↔ DB projection 무결성)
```

## 위험 / 주의

1. **공유 유틸 추출 시 worker `write-and-commit.ts` 회귀 위험**: ingest integration test (`wiki-link-projection.test.ts`)가 PASS 유지되는지 반드시 확인. 차이가 있다면 추출 포기 → 인라인 복제로 fallback.
2. **wiki_page_link 스키마**: `linkType` enum, `position` 등 부가 필드가 있을 수 있음. ingest가 어떻게 채우는지 정확히 복제.
3. **트랜잭션 실패 시 git commit은 이미 완료됨**: 기존 코드는 git commit 성공 후 projection 실패 시 `projection_failed` 반환. 신규 link projection 실패도 동일하게 처리. wiki-fs SSoT 원칙상 git이 진실 source — projection은 다음 lint/sync에서 복구 가능.
4. **broken link 검증 비범위**: `[[존재하지 않는 페이지]]`도 그대로 INSERT. lint가 보고. 만약 ingest처럼 차단하려면 `parseWikilinks` 결과 + `wiki_page_index` 조회로 검증 — 이건 follow-up.

## 비범위

- HIGH-1, HIGH-3, HIGH-4, HIGH-5, HIGH-6, HIGH-7: 별도 PR
- broken-wikilink 검증 (manual save 시 차단): follow-up
- aliases<3 / missing-title 검증: follow-up
