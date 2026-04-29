# Ask AI RBAC + Citation Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask AI 도구가 권한 없는 페이지를 답변에 인용하지 못하도록 ACL을 통일하고, deprecated된 legacy ask 경로(~250 LoC)를 제거하며, live 답변에서 `[[slug]]` citation이 raw text로 노출되는 UX 버그를 수정한다.

**Architecture:** 세 개의 독립 PR로 분할. (1) wiki tool 4개의 sensitivity-only 필터를 `requiredPermission` + `publishedStatus`까지 확장하는 단일 helper(`canViewWikiPage`)로 통일하고 `wiki_grep`의 tenant 하드코딩과 검색 품질을 동시 개선. (2) `_legacyAskAI_unused` 함수와 그에만 의존하는 모듈(`router.ts`, `graph-context.ts`)을 burn-in 종료 시점(2026-05-01)에 맞춰 삭제. (3) `AskPanel`의 인라인 `AnswerText`를 제거하고 `AnswerCard`의 citation 파서를 별도 컴포넌트로 추출해 live/history 양쪽이 같은 렌더러를 사용하게 한다.

**Tech Stack:** TypeScript · Drizzle ORM · Vitest · React 19 · next-intl · pg-trgm · `@jarvis/auth/rbac` · `@jarvis/db/schema/wiki-page-index`

**영향도 (jarvis-architecture 17계층 매핑):**

| 계층 | PR-1 | PR-2 | PR-3 |
|------|------|------|------|
| DB 스키마 | 해당 없음 (`requiredPermission`/`publishedStatus` 컬럼 이미 존재) | 해당 없음 | 해당 없음 |
| Validation | 해당 없음 | 해당 없음 | 해당 없음 |
| 권한 (34 상수) | 기존 재사용 (KNOWLEDGE_READ/REVIEW, ADMIN_ALL, PROJECT_ACCESS_SECRET) | 해당 없음 | 해당 없음 |
| 세션 vs 권한 모델 | 해당 없음 (Ask AI는 세션 기반, 그대로 유지) | 해당 없음 | 해당 없음 |
| Sensitivity 필터 | **canViewWikiPage 단일 진입점 신설** + 4 도구에 적용 | 해당 없음 | 해당 없음 |
| Ask AI / tool-use agent | 4개 도구 (wiki_grep/read/follow_link/graph_query) ACL 강화 | `_legacyAskAI_unused` + legacy retrieval 모듈 삭제 | 해당 없음 |
| Wiki-fs (Karpathy) | 해당 없음 (디스크 I/O 변경 없음) | 해당 없음 | 해당 없음 |
| 검색 | wiki_grep aliases/tags/routeKey 검색 추가 | 해당 없음 | 해당 없음 |
| 서버 액션/API | 해당 없음 (route.ts 미변경) | 해당 없음 | 해당 없음 |
| 서버 lib | `apps/web/lib/queries/knowledge.ts`는 legacy knowledge 도메인이므로 제외 | 해당 없음 | 해당 없음 |
| UI 라우트 | 해당 없음 | 해당 없음 | `apps/web/components/ai/**` |
| UI 컴포넌트 | 해당 없음 | 해당 없음 | `AskPanel.tsx`, `AnswerCard.tsx`, 신규 `AnswerBody.tsx` |
| i18n 키 | 해당 없음 | 해당 없음 | 해당 없음 (citation은 컴포넌트 내부 logic) |
| 테스트 | 4 도구 테스트 갱신 + 회귀 테스트 1건 | legacy 테스트 블록 정리 | live citation 렌더 테스트 |
| 워커 잡 | 해당 없음 | 해당 없음 | 해당 없음 |
| LLM 호출 | 해당 없음 | 해당 없음 | 해당 없음 |
| Audit | 해당 없음 (조회만, 무 mutation) | 해당 없음 | 해당 없음 |

**검증 게이트:** PR-1/PR-2/PR-3 모두 `pnpm --filter @jarvis/web type-check` + `pnpm --filter @jarvis/web lint` + `pnpm --filter @jarvis/ai test` 필수. PR-3은 추가로 `pnpm --filter @jarvis/web test`. 머지 직전 PR-1/PR-3은 `pnpm --filter @jarvis/web exec playwright test apps/web/e2e/ask-harness.spec.ts`.

---

## PR-1: Ask AI 도구 ACL 통일 + wiki_grep 검색 품질·tenant fix

`packages/ai/agent/tools/{wiki-grep,wiki-read,wiki-follow-link,wiki-graph-query}.ts`가 sensitivity는 보지만 `requiredPermission`과 `publishedStatus`를 보지 않아 UI에서 안 보이는 draft/restricted 페이지를 AI가 답변에 인용할 수 있다. 같은 PR에서 `wiki_grep`의 `wiki/jarvis/${scope}/%` 하드코딩(멀티테넌트 버그)과 검색 품질(aliases/tags/routeKey 누락)도 함께 수정.

**File Structure:**
- Create: `packages/auth/wiki-acl.ts` — `canViewWikiPage()` 단일 진입점 + `buildWikiAclWhere()` Drizzle helper
- Create: `packages/auth/__tests__/wiki-acl.test.ts`
- Modify: `packages/ai/agent/tools/wiki-grep.ts` — ACL helper 사용 + tenant 제거 + alias/routeKey 검색
- Modify: `packages/ai/agent/tools/wiki-read.ts` — ACL helper 사용
- Modify: `packages/ai/agent/tools/wiki-follow-link.ts` — ACL helper 사용
- Modify: `packages/ai/agent/tools/wiki-graph-query.ts` — ACL helper 사용
- Modify: `packages/ai/agent/tools/__tests__/wiki-grep.test.ts`
- Modify: `packages/ai/agent/tools/__tests__/wiki-read.test.ts`
- Modify: `packages/ai/agent/tools/__tests__/wiki-follow-link.test.ts`
- Modify: `packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts`
- Create: `packages/ai/agent/tools/__tests__/wiki-acl-regression.test.ts` — "UI에서 안 보이는 페이지는 Ask에서도 안 보인다"
- Modify: `packages/auth/index.ts` — re-export `canViewWikiPage`, `buildWikiAclWhere`

### Task 1: `canViewWikiPage` 헬퍼 + 테스트 (TDD)

**Files:**
- Create: `packages/auth/wiki-acl.ts`
- Create: `packages/auth/__tests__/wiki-acl.test.ts`

이 헬퍼는 wiki tool 전체가 사용할 단일 진입점이다. `resolveAllowedWikiSensitivities`(rbac.ts:215, 이미 존재)를 재사용해 sensitivity를 해석하고, 추가로 `requiredPermission`(varchar 50)과 `publishedStatus`(default 'draft') 두 컬럼도 본다. `legacyCanAccessSensitivity`와 `canAccessKnowledgeSensitivityByPermissions`는 손대지 않는다 — 후자는 `apps/web/lib/queries/knowledge.ts` 등 legacy knowledge 도메인이 사용 중.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/auth/__tests__/wiki-acl.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canViewWikiPage } from "../wiki-acl.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

describe("canViewWikiPage", () => {
  const base = {
    sensitivity: "INTERNAL",
    requiredPermission: null as string | null,
    publishedStatus: "published",
  };

  it("draft 페이지는 ADMIN_ALL이 아니면 차단", () => {
    const draft = { ...base, publishedStatus: "draft" };
    expect(canViewWikiPage(draft, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(canViewWikiPage(draft, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("archived 페이지는 ADMIN_ALL이 아니면 차단", () => {
    const archived = { ...base, publishedStatus: "archived" };
    expect(canViewWikiPage(archived, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(canViewWikiPage(archived, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("requiredPermission이 있으면 그 권한이 있어야 통과", () => {
    const restricted = {
      ...base,
      requiredPermission: PERMISSIONS.PROJECT_ACCESS_SECRET,
    };
    expect(canViewWikiPage(restricted, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(
      canViewWikiPage(restricted, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.PROJECT_ACCESS_SECRET,
      ]),
    ).toBe(true);
    expect(canViewWikiPage(restricted, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("requiredPermission이 null이면 sensitivity만 본다", () => {
    expect(
      canViewWikiPage({ ...base, sensitivity: "RESTRICTED" }, [
        PERMISSIONS.KNOWLEDGE_READ,
      ]),
    ).toBe(false);
    expect(
      canViewWikiPage({ ...base, sensitivity: "RESTRICTED" }, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.KNOWLEDGE_REVIEW,
      ]),
    ).toBe(true);
  });

  it("SECRET_REF_ONLY는 PROJECT_ACCESS_SECRET 또는 ADMIN_ALL", () => {
    const secret = { ...base, sensitivity: "SECRET_REF_ONLY" };
    expect(canViewWikiPage(secret, [PERMISSIONS.KNOWLEDGE_READ])).toBe(false);
    expect(
      canViewWikiPage(secret, [
        PERMISSIONS.KNOWLEDGE_READ,
        PERMISSIONS.PROJECT_ACCESS_SECRET,
      ]),
    ).toBe(true);
    expect(canViewWikiPage(secret, [PERMISSIONS.ADMIN_ALL])).toBe(true);
  });

  it("권한 0개 → 전부 차단", () => {
    expect(canViewWikiPage(base, [])).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/auth test wiki-acl
```

기대: `Cannot find module '../wiki-acl.js'` 또는 `canViewWikiPage is not defined` 로 FAIL.

- [ ] **Step 3: `canViewWikiPage` 구현**

`packages/auth/wiki-acl.ts`:

```typescript
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { resolveAllowedWikiSensitivities } from "./rbac.js";

export interface WikiPageAclSubject {
  sensitivity: string;
  requiredPermission: string | null;
  publishedStatus: string;
}

/**
 * Wiki tool / wiki index UI / page-first shortlist 공통 ACL 진입점.
 *
 * 세 가지를 동시에 본다:
 *   1. publishedStatus — 'published'만 비-admin에게 노출
 *   2. requiredPermission — null이 아니면 그 permission 보유 필수
 *   3. sensitivity — resolveAllowedWikiSensitivities() 재사용
 *
 * ADMIN_ALL은 모든 단계 우회.
 */
export function canViewWikiPage(
  subject: WikiPageAclSubject,
  permissions: readonly string[],
): boolean {
  const perms = permissions as string[];
  const isAdmin = perms.includes(PERMISSIONS.ADMIN_ALL);

  if (!isAdmin && subject.publishedStatus !== "published") {
    return false;
  }

  if (
    !isAdmin &&
    subject.requiredPermission &&
    !perms.includes(subject.requiredPermission)
  ) {
    return false;
  }

  const allowed = resolveAllowedWikiSensitivities(perms);
  return allowed.includes(subject.sensitivity);
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
pnpm --filter @jarvis/auth test wiki-acl
```

연속 2회 실행해 flaky 차단 (CLAUDE.md 사용자 규칙).

기대: 6 tests passed.

- [ ] **Step 5: re-export 추가**

`packages/auth/index.ts`에 다음 한 줄 추가 (파일 끝):

```typescript
export { canViewWikiPage, type WikiPageAclSubject } from "./wiki-acl.js";
```

- [ ] **Step 6: 커밋**

```bash
git add packages/auth/wiki-acl.ts packages/auth/__tests__/wiki-acl.test.ts packages/auth/index.ts
git commit -m "feat(auth): canViewWikiPage helper unifies wiki ACL across tools

Single entry point that checks publishedStatus + requiredPermission +
sensitivity in one place. Reuses resolveAllowedWikiSensitivities for
sensitivity resolution. ADMIN_ALL bypasses all three gates.

Subsequent commits migrate wiki_grep / wiki_read / wiki_follow_link /
wiki_graph_query off legacy canAccessKnowledgeSensitivityByPermissions."
```

### Task 2: `wiki_grep` ACL 강화 + tenant 제거 + alias/routeKey 검색

**Files:**
- Modify: `packages/ai/agent/tools/wiki-grep.ts:6-127`
- Modify: `packages/ai/agent/tools/__tests__/wiki-grep.test.ts`

`scope` 필터의 `wiki/jarvis/${scope}/%` 하드코딩을 제거하고 `path LIKE '%/${zone}/%'`로 zone-relative 매칭으로 바꾼다. 같은 변경에서 `requiredPermission`/`publishedStatus`를 SELECT + WHERE에 추가하고, 검색 컬럼을 `title`/`slug` → `title`/`slug`/`routeKey`/`frontmatter->aliases` 로 확장한다.

- [ ] **Step 1: 회귀 테스트 추가 (TDD)**

`packages/ai/agent/tools/__tests__/wiki-grep.test.ts`에 다음 테스트 케이스 추가 (기존 describe 블록 안):

```typescript
it("draft 페이지는 결과에서 제외", async () => {
  const rows = [
    {
      slug: "published-page",
      title: "Published",
      path: "wiki/ws-1/auto/concepts/published-page.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "published",
    },
    {
      slug: "draft-page",
      title: "Published Draft",
      path: "wiki/ws-1/auto/concepts/draft-page.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "draft",
    },
  ];
  // SQL 레벨 필터를 검증하므로 db 모킹은 'published'만 반환하도록 설정
  // (이 테스트는 SQL filter가 publishedStatus='published'를 추가하는지 확인)
  // ... 기존 테스트 패턴 따라 makeSelectChain([...])
});

it("requiredPermission이 있는 페이지는 권한 없으면 제외", async () => {
  // ctx.permissions에 PROJECT_ACCESS_SECRET 없을 때 requiredPermission이
  // 'project.access:secret'인 row가 결과에 없어야 함.
});

it("scope filter는 workspace-relative", async () => {
  // path LIKE '%/manual/%' 같은 패턴이 적용되는지 검증.
  // 'wiki/jarvis/manual/' 하드코딩이 제거됐는지 확인.
});

it("aliases로 검색", async () => {
  // frontmatter->'aliases' GIN 인덱스를 활용한 검색이 되는지.
  // query='연차'가 frontmatter.aliases=['연차','휴가']인 페이지를 찾는지.
});
```

위 테스트의 정확한 mock 패턴은 기존 `wiki-grep.test.ts`의 `makeSelectChain` 헬퍼를 따른다.

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/ai test wiki-grep
```

기대: 새 4 테스트 FAIL.

- [ ] **Step 3: `wiki-grep.ts` 수정**

`packages/ai/agent/tools/wiki-grep.ts` 전체 교체:

```typescript
// packages/ai/agent/tools/wiki-grep.ts
//
// Ask AI harness tool: 위키 페이지를 keyword로 검색.
// 본문은 포함하지 않고 후보 리스트만 반환 — 본문은 wiki-read tool이 담당.

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  resolveAllowedWikiSensitivities,
  PERMISSIONS,
} from "@jarvis/auth";
import {
  ok,
  err,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from "./types.js";

export interface WikiGrepInput {
  query: string;
  scope?: "all" | "manual" | "auto" | "procedures";
  limit?: number;
}

export interface WikiGrepMatch {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
  /** Phase A3에서 wiki-fs를 읽어 채움. 현재는 빈 문자열. */
  snippet: string;
}

export interface WikiGrepOutput {
  matches: WikiGrepMatch[];
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const wikiGrep: ToolDefinition<WikiGrepInput, WikiGrepOutput> = {
  name: "wiki_grep",
  description:
    "위키 페이지를 title/slug/aliases/routeKey 키워드로 검색. 본문은 wiki-read 로 후속 조회.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 2 },
      scope: {
        type: "string",
        enum: ["all", "manual", "auto", "procedures"],
        default: "all",
      },
      limit: { type: "integer", minimum: 1, maximum: 30, default: 10 },
    },
  },

  async execute(
    { query, scope = "all", limit = 10 }: WikiGrepInput,
    ctx: ToolContext,
  ): Promise<ToolResult<WikiGrepOutput>> {
    const q = (query ?? "").trim();
    if (q.length < 2) {
      return err("invalid", "query must be at least 2 characters");
    }
    const lim = Math.min(30, Math.max(1, limit));
    const escaped = escapeIlike(q);
    const perms = ctx.permissions as string[];
    const isAdmin = perms.includes(PERMISSIONS.ADMIN_ALL);
    const allowedSensitivities = resolveAllowedWikiSensitivities(perms);

    if (allowedSensitivities.length === 0) {
      return ok({ matches: [] });
    }

    // workspace-relative scope: 'wiki/{anyWorkspace}/{zone}/' 형태와 매칭.
    const scopeCond =
      scope === "all"
        ? sql`true`
        : sql`${wikiPageIndex.path} LIKE ${`%/${scope}/%`}`;

    // ACL: requiredPermission이 null이거나, caller가 보유, 또는 ADMIN_ALL
    const requiredPermissionCond = isAdmin
      ? sql`true`
      : sql`(${wikiPageIndex.requiredPermission} IS NULL OR ${wikiPageIndex.requiredPermission} = ANY(${perms}))`;

    const publishedCond = isAdmin
      ? sql`true`
      : eq(wikiPageIndex.publishedStatus, "published");

    // aliases는 frontmatter->'aliases' (jsonb array of string)
    const aliasMatch = sql`(${wikiPageIndex.frontmatter} -> 'aliases') ?| ARRAY[${q}]`;

    try {
      const rows = await db
        .select({
          slug: wikiPageIndex.slug,
          title: wikiPageIndex.title,
          path: wikiPageIndex.path,
          sensitivity: wikiPageIndex.sensitivity,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            or(
              ilike(wikiPageIndex.title, `%${escaped}%`),
              ilike(wikiPageIndex.slug, `%${escaped}%`),
              ilike(wikiPageIndex.routeKey, `%${escaped}%`),
              aliasMatch,
            ),
            scopeCond,
            sql`${wikiPageIndex.sensitivity} = ANY(${allowedSensitivities})`,
            requiredPermissionCond,
            publishedCond,
          ),
        )
        .orderBy(wikiPageIndex.title)
        .limit(lim);

      return ok({
        matches: rows.map((r) => ({
          slug: r.slug,
          title: r.title,
          path: r.path,
          sensitivity: r.sensitivity,
          snippet: "",
        })),
      });
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
pnpm --filter @jarvis/ai test wiki-grep && pnpm --filter @jarvis/ai test wiki-grep
```

기대: 모든 wiki-grep 테스트 통과 (기존 + 신규 4개). 2회 연속 통과.

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/agent/tools/wiki-grep.ts \
        packages/ai/agent/tools/__tests__/wiki-grep.test.ts
git commit -m "fix(ask): wiki_grep ACL + tenant + alias search

- Add publishedStatus='published' filter (block draft/archived from agent)
- Add requiredPermission filter (block restricted pages by permission)
- Replace 'wiki/jarvis/\${scope}/' hardcode with workspace-relative
  '%/\${scope}/%' — was breaking multi-workspace deployments
- Search frontmatter->aliases and routeKey, not just title/slug
- Escape % and _ in user query (prevent ILIKE wildcard injection)

Backed by canViewWikiPage's same gate logic, applied at SQL level here
because grep returns multiple rows."
```

### Task 3: `wiki_read` ACL helper로 통합

**Files:**
- Modify: `packages/ai/agent/tools/wiki-read.ts`
- Modify: `packages/ai/agent/tools/__tests__/wiki-read.test.ts`

`canAccessKnowledgeSensitivityByPermissions` (legacy)를 `canViewWikiPage`로 교체. SELECT에 `requiredPermission`, `publishedStatus` 추가.

- [ ] **Step 1: 테스트 mock 업데이트**

`packages/ai/agent/tools/__tests__/wiki-read.test.ts:25-27` 모킹 변경:

```typescript
vi.mock("@jarvis/auth", () => ({
  canViewWikiPage: vi.fn(),
  PERMISSIONS: { ADMIN_ALL: "admin:all" },
}));
```

(기존 `vi.mock("@jarvis/auth/rbac", ...)` 블록을 위로 교체)

기존 `canAccessKnowledgeSensitivityByPermissions` import + mock 호출을 모두 `canViewWikiPage`로 교체. 각 테스트에서 row mock에 `requiredPermission: null, publishedStatus: "published"` 추가.

신규 테스트 2건 추가:

```typescript
it("draft 페이지 → forbidden", async () => {
  makeSelectChain([
    {
      slug: "draft-page",
      title: "Draft",
      path: "wiki/ws/draft.md",
      sensitivity: "INTERNAL",
      requiredPermission: null,
      publishedStatus: "draft",
    },
  ]);
  (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);
  const result = await wikiRead.execute({ slug: "draft-page" }, ctx);
  expect(result).toEqual({
    ok: false,
    code: "forbidden",
    error: expect.any(String),
  });
});

it("requiredPermission 부족 → forbidden", async () => {
  makeSelectChain([
    {
      slug: "secret-doc",
      title: "Secret",
      path: "wiki/ws/secret.md",
      sensitivity: "INTERNAL",
      requiredPermission: "project.access:secret",
      publishedStatus: "published",
    },
  ]);
  (canViewWikiPage as ReturnType<typeof vi.fn>).mockReturnValue(false);
  const result = await wikiRead.execute({ slug: "secret-doc" }, ctx);
  expect(result).toEqual({
    ok: false,
    code: "forbidden",
    error: expect.any(String),
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/ai test wiki-read
```

기대: import error 또는 mock 누락으로 FAIL.

- [ ] **Step 3: `wiki-read.ts` 수정**

`packages/ai/agent/tools/wiki-read.ts`의 import + execute 본문 교체:

```typescript
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { canViewWikiPage } from "@jarvis/auth";
import { readPage } from "@jarvis/wiki-fs";
import { splitFrontmatter } from "@jarvis/wiki-fs/frontmatter";
import { parseWikilinks } from "@jarvis/wiki-fs/wikilink";
import { ok, err, type ToolDefinition } from "./types.js";

// ... interface 정의 그대로 유지 ...

export const wikiRead: ToolDefinition<WikiReadInput, WikiReadOutput> = {
  name: "wiki_read",
  description:
    "slug 로 위키 페이지 본문 읽기. frontmatter + content + outbound wikilinks 반환.",
  parameters: {
    type: "object",
    required: ["slug"],
    properties: { slug: { type: "string", minLength: 1 } },
  },
  async execute({ slug }, ctx) {
    if (!slug || slug.trim().length === 0) {
      return err("invalid", "slug is required");
    }

    try {
      const [row] = await db
        .select({
          slug: wikiPageIndex.slug,
          title: wikiPageIndex.title,
          path: wikiPageIndex.path,
          sensitivity: wikiPageIndex.sensitivity,
          requiredPermission: wikiPageIndex.requiredPermission,
          publishedStatus: wikiPageIndex.publishedStatus,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            eq(wikiPageIndex.slug, slug),
          ),
        )
        .limit(1);

      if (!row) {
        return err("not_found", `slug "${slug}" not found`);
      }

      if (
        !canViewWikiPage(
          {
            sensitivity: row.sensitivity,
            requiredPermission: row.requiredPermission,
            publishedStatus: row.publishedStatus,
          },
          ctx.permissions as string[],
        )
      ) {
        return err("forbidden", "access denied");
      }

      const raw = await readPage(ctx.workspaceId, row.path);
      const { frontmatter, body } = splitFrontmatter(raw);
      const links = parseWikilinks(body);
      const outbound_wikilinks = Array.from(
        new Set(links.map((l) => l.target).filter(Boolean)),
      );

      return ok({
        slug: row.slug,
        title: row.title,
        path: row.path,
        sensitivity: row.sensitivity,
        frontmatter: frontmatter ?? null,
        content: body,
        outbound_wikilinks,
      });
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @jarvis/ai test wiki-read && pnpm --filter @jarvis/ai test wiki-read
```

기대: 모든 wiki-read 테스트 통과 (2회 연속).

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/agent/tools/wiki-read.ts \
        packages/ai/agent/tools/__tests__/wiki-read.test.ts
git commit -m "fix(ask): wiki_read uses canViewWikiPage (publishedStatus + requiredPermission)

Replaces canAccessKnowledgeSensitivityByPermissions (legacy knowledge_page
helper) with canViewWikiPage. Adds requiredPermission and publishedStatus
to SELECT so the helper can evaluate them.

Now: draft/archived pages return forbidden, and pages with a required
permission return forbidden when caller lacks it."
```

### Task 4: `wiki_follow_link` ACL helper로 통합

**Files:**
- Modify: `packages/ai/agent/tools/wiki-follow-link.ts`
- Modify: `packages/ai/agent/tools/__tests__/wiki-follow-link.test.ts`

source 페이지 + target 페이지 양쪽 모두 `canViewWikiPage` 적용. 권한 없는 link는 조용히 제거(기존 동작 유지).

- [ ] **Step 1: 테스트 mock 업데이트**

`packages/ai/agent/tools/__tests__/wiki-follow-link.test.ts`의 `vi.mock("@jarvis/auth/rbac", ...)`를 다음으로 교체:

```typescript
vi.mock("@jarvis/auth", () => ({
  canViewWikiPage: vi.fn(),
  PERMISSIONS: { ADMIN_ALL: "admin:all" },
}));
```

각 테스트의 row mock에 `requiredPermission: null, publishedStatus: "published"` 추가. 다음 신규 테스트 2건 추가:

```typescript
it("source가 draft면 forbidden", async () => {
  // 동일 패턴: source row의 publishedStatus='draft', canViewWikiPage 첫 호출 false
});

it("target 중 requiredPermission 있는 것은 silent drop", async () => {
  // source는 published+권한OK, targets는 mixed: 일부는 requiredPermission='project.access:secret'
  // canViewWikiPage가 일부만 true 반환하도록 mock
  // 결과 links 배열에서 막힌 것 빠져 있는지 검증
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/ai test wiki-follow-link
```

- [ ] **Step 3: `wiki-follow-link.ts` 수정**

`packages/ai/agent/tools/wiki-follow-link.ts`의 imports + execute 본문 교체:

```typescript
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { canViewWikiPage } from "@jarvis/auth";
import { readPage } from "@jarvis/wiki-fs";
import { splitFrontmatter } from "@jarvis/wiki-fs/frontmatter";
import { parseWikilinks } from "@jarvis/wiki-fs/wikilink";
import { ok, err, type ToolDefinition } from "./types.js";

// ... interface 정의 그대로 ...

export const wikiFollowLink: ToolDefinition<
  WikiFollowLinkInput,
  WikiFollowLinkOutput
> = {
  name: "wiki_follow_link",
  description:
    "slug에서 outbound wikilinks (1-hop) 목록. 접근 권한 없는 링크는 자동 제외.",
  parameters: {
    type: "object",
    required: ["from_slug"],
    properties: {
      from_slug: { type: "string", minLength: 1 },
      direction: { type: "string", enum: ["outbound"], default: "outbound" },
    },
  },
  async execute({ from_slug }, ctx) {
    if (!from_slug || from_slug.trim().length === 0) {
      return err("invalid", "from_slug required");
    }

    try {
      const [source] = await db
        .select({
          path: wikiPageIndex.path,
          sensitivity: wikiPageIndex.sensitivity,
          requiredPermission: wikiPageIndex.requiredPermission,
          publishedStatus: wikiPageIndex.publishedStatus,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            eq(wikiPageIndex.slug, from_slug),
          ),
        )
        .limit(1);

      if (!source) {
        return err("not_found", `slug "${from_slug}" not found`);
      }
      if (
        !canViewWikiPage(
          {
            sensitivity: source.sensitivity,
            requiredPermission: source.requiredPermission,
            publishedStatus: source.publishedStatus,
          },
          ctx.permissions as string[],
        )
      ) {
        return err("forbidden", "access denied");
      }

      const raw = await readPage(ctx.workspaceId, source.path);
      const { body } = splitFrontmatter(raw);
      const linkObjs = parseWikilinks(body);
      const uniqueSlugs = Array.from(
        new Set(linkObjs.map((l) => l.target).filter(Boolean)),
      );

      if (uniqueSlugs.length === 0) {
        return ok({ links: [] });
      }

      const targets = await db
        .select({
          slug: wikiPageIndex.slug,
          title: wikiPageIndex.title,
          sensitivity: wikiPageIndex.sensitivity,
          requiredPermission: wikiPageIndex.requiredPermission,
          publishedStatus: wikiPageIndex.publishedStatus,
        })
        .from(wikiPageIndex)
        .where(
          and(
            eq(wikiPageIndex.workspaceId, ctx.workspaceId),
            inArray(wikiPageIndex.slug, uniqueSlugs),
          ),
        );

      const visible = targets
        .filter((t) =>
          canViewWikiPage(
            {
              sensitivity: t.sensitivity,
              requiredPermission: t.requiredPermission,
              publishedStatus: t.publishedStatus,
            },
            ctx.permissions as string[],
          ),
        )
        .map((t) => ({
          slug: t.slug,
          title: t.title,
          direction: "outbound" as const,
        }));

      return ok({ links: visible });
    } catch (e) {
      return err("unknown", e instanceof Error ? e.message : String(e));
    }
  },
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @jarvis/ai test wiki-follow-link && pnpm --filter @jarvis/ai test wiki-follow-link
```

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/agent/tools/wiki-follow-link.ts \
        packages/ai/agent/tools/__tests__/wiki-follow-link.test.ts
git commit -m "fix(ask): wiki_follow_link uses canViewWikiPage on source + targets

Source page must pass full ACL (was sensitivity-only). Target pages
silently drop when blocked — preserves agent UX (graph still traversable
through allowed neighbors)."
```

### Task 5: `wiki_graph_query` ACL helper로 통합

**Files:**
- Modify: `packages/ai/agent/tools/wiki-graph-query.ts:9-184`
- Modify: `packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts`

기존 sensitivity 필터를 `canViewWikiPage`로 교체. SELECT에 `requiredPermission`, `publishedStatus` 추가. 첫 리뷰 P1 #4 자동 해결.

- [ ] **Step 1: 테스트 mock 업데이트**

`packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts`에서 `canAccessKnowledgeSensitivityByPermissions` mock을 `canViewWikiPage`로 교체. 신규 테스트:

```typescript
it("그래프 노드 중 draft인 wiki-page는 visible 집합에서 제외", async () => {
  // graphify CLI mock: nodes에 wiki-page kind 2개 (published 1, draft 1)
  // canViewWikiPage가 published rows에만 true 반환
  // 결과: draft node는 nodes에 없고, draft을 endpoint로 갖는 edge도 빠져야 함
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/ai test wiki-graph-query
```

- [ ] **Step 3: `wiki-graph-query.ts:142-162` 수정**

`packages/ai/agent/tools/wiki-graph-query.ts:142-162` (rows fetch + filter 부분) 교체:

```typescript
      let allowedSlugs = new Set<string>();
      if (wikiPageSlugs.length > 0) {
        const rows = await db
          .select({
            slug: wikiPageIndex.slug,
            sensitivity: wikiPageIndex.sensitivity,
            requiredPermission: wikiPageIndex.requiredPermission,
            publishedStatus: wikiPageIndex.publishedStatus,
          })
          .from(wikiPageIndex)
          .where(
            and(
              eq(wikiPageIndex.workspaceId, ctx.workspaceId),
              inArray(wikiPageIndex.slug, wikiPageSlugs),
            ),
          );
        allowedSlugs = new Set(
          rows
            .filter((r) =>
              canViewWikiPage(
                {
                  sensitivity: r.sensitivity,
                  requiredPermission: r.requiredPermission,
                  publishedStatus: r.publishedStatus,
                },
                ctx.permissions as string[],
              ),
            )
            .map((r) => r.slug),
        );
      }
```

`canAccessKnowledgeSensitivityByPermissions` import를 `canViewWikiPage`로 교체 (line 12).

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @jarvis/ai test wiki-graph-query && pnpm --filter @jarvis/ai test wiki-graph-query
```

- [ ] **Step 5: 커밋**

```bash
git add packages/ai/agent/tools/wiki-graph-query.ts \
        packages/ai/agent/tools/__tests__/wiki-graph-query.test.ts
git commit -m "fix(ask): wiki_graph_query uses canViewWikiPage on wiki-page nodes

Graph nodes with kind='wiki-page' now go through the same ACL helper as
wiki_grep / wiki_read / wiki_follow_link. Resolves the legacy permission
helper inconsistency that left draft + restricted pages reachable through
graph traversal even though the wiki index UI hides them."
```

### Task 6: 회귀 테스트 — "UI에서 안 보이는 페이지는 Ask에서도 안 보인다"

**Files:**
- Create: `packages/ai/agent/tools/__tests__/wiki-acl-regression.test.ts`

4개 도구가 같은 fixture에 대해 동일한 visibility를 보장하는지 단일 테스트.

- [ ] **Step 1: 통합 회귀 테스트 작성**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@jarvis/db/client", () => ({ db: { select: vi.fn() } }));
vi.mock("@jarvis/db/schema", () => ({
  wikiPageIndex: {
    slug: "slug", title: "title", path: "path",
    sensitivity: "sensitivity", workspaceId: "workspaceId",
    requiredPermission: "requiredPermission",
    publishedStatus: "publishedStatus",
    routeKey: "routeKey", frontmatter: "frontmatter",
  },
}));
// drizzle, wiki-fs mocks 동일 패턴

import { wikiGrep } from "../wiki-grep.js";
import { wikiRead } from "../wiki-read.js";
import { wikiFollowLink } from "../wiki-follow-link.js";

const ctx = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["knowledge:read"],
};

const blockedFixtures = [
  {
    label: "draft 페이지",
    row: {
      slug: "draft", title: "Draft", path: "wiki/ws/draft.md",
      sensitivity: "INTERNAL", requiredPermission: null,
      publishedStatus: "draft",
    },
  },
  {
    label: "archived 페이지",
    row: {
      slug: "old", title: "Old", path: "wiki/ws/old.md",
      sensitivity: "INTERNAL", requiredPermission: null,
      publishedStatus: "archived",
    },
  },
  {
    label: "requiredPermission 부족",
    row: {
      slug: "secret", title: "Secret", path: "wiki/ws/secret.md",
      sensitivity: "INTERNAL",
      requiredPermission: "project.access:secret",
      publishedStatus: "published",
    },
  },
  {
    label: "RESTRICTED + KNOWLEDGE_REVIEW 미보유",
    row: {
      slug: "restricted", title: "Restricted",
      path: "wiki/ws/restricted.md",
      sensitivity: "RESTRICTED", requiredPermission: null,
      publishedStatus: "published",
    },
  },
];

describe("wiki tool ACL 회귀 — UI에서 안 보이는 페이지는 Ask에서도 안 보인다", () => {
  for (const fx of blockedFixtures) {
    it(`wiki_read: ${fx.label} → forbidden`, async () => {
      // makeSelectChain([fx.row])
      const result = await wikiRead.execute({ slug: fx.row.slug }, ctx);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("forbidden");
      }
    });

    it(`wiki_follow_link: source가 ${fx.label} → forbidden`, async () => {
      const result = await wikiFollowLink.execute(
        { from_slug: fx.row.slug },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("forbidden");
      }
    });
  }
});
```

(precise mock 헬퍼는 기존 wiki-read.test.ts의 `makeSelectChain` 패턴을 모듈 레벨로 끌어내 사용)

- [ ] **Step 2: 테스트 실행**

```bash
pnpm --filter @jarvis/ai test wiki-acl-regression
```

기대: 모든 케이스 통과 (각 도구 4개 fixture × 2개 도구 = 8 케이스).

- [ ] **Step 3: 전체 ai 패키지 테스트 + lint + type-check**

```bash
pnpm --filter @jarvis/ai test && \
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint
```

연속 2회 ai test (CLAUDE.md 규칙).

- [ ] **Step 4: 커밋**

```bash
git add packages/ai/agent/tools/__tests__/wiki-acl-regression.test.ts
git commit -m "test(ask): regression — UI-hidden pages are unreachable via Ask tools

Every page that the wiki index UI filters out (draft, archived,
requiredPermission-gated, RESTRICTED-without-review) must also be
unreachable through wiki_read and wiki_follow_link. Locks in the
canViewWikiPage contract across all tool surfaces."
```

### Task 7: PR-1 머지 전 통합 검증

- [ ] **Step 1: 전체 게이트**

```bash
pnpm --filter @jarvis/auth test && \
pnpm --filter @jarvis/ai test && \
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint
```

연속 2회 (flaky 차단). 모두 통과.

- [ ] **Step 2: e2e 스모크**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/ask-harness.spec.ts
```

기대: 기존 ask-harness 시나리오 그대로 통과 (회귀 없음).

- [ ] **Step 3: PR 본문 작성 + 머지 준비**

PR 제목: `fix(ask): unify wiki tool ACL via canViewWikiPage + wiki_grep tenant/quality fix`

본문 요약:
- canViewWikiPage 단일 헬퍼 (publishedStatus + requiredPermission + sensitivity)
- wiki_grep, wiki_read, wiki_follow_link, wiki_graph_query 4개 도구 동시 적용
- wiki_grep `wiki/jarvis/${scope}/` 하드코딩 제거 (multi-tenant bug)
- wiki_grep aliases/routeKey 검색 + ILIKE wildcard escape
- 회귀 테스트: UI에서 hidden인 페이지는 Ask에서도 unreachable

---

## PR-2: Legacy Ask AI 경로 제거 + entrypoint 명료화

`_legacyAskAI_unused`(ask.ts:519-729, 211 LoC), `retrieveRelevantClaims` stub(ask.ts:104-131), 그에만 의존하는 `router.ts` + `graph-context.ts`를 삭제. `case-context.ts`/`directory-context.ts`/`page-first/**`는 `tutor.ts`가 사용 중이므로 유지. 2026-04-24 burn-in SLA(1주, 만료 2026-05-01)에 부합.

**File Structure:**
- Delete: `packages/ai/router.ts`
- Delete: `packages/ai/graph-context.ts`
- Delete: `packages/ai/__tests__/graph-context.test.ts`
- Modify: `packages/ai/ask.ts` — `_legacyAskAI_unused`/`retrieveRelevantClaims`/legacy imports 제거
- Modify: `packages/ai/ask.test.ts` — legacy describe 블록 제거
- Modify: `packages/ai/__tests__/ask-default-path.test.ts` — page-first/legacy 경로 검증을 agent 경로 검증으로 갱신 또는 삭제
- Modify: `packages/db/feature-flags.ts` — `featurePageFirstQuery` flag 제거 (호출 사이트가 0)

### Task 1: legacy 사용처 사전 검증

- [ ] **Step 1: 삭제 대상이 정말 unused인지 확인**

```bash
# router.ts 사용처
grep -rn "from.*ai/router\|from '@jarvis/ai/router\|routeQuestion\|LANE_SOURCE_WEIGHTS" --include="*.ts" --include="*.tsx" packages apps | grep -v "packages/ai/router.ts" | grep -v "packages/ai/ask.ts" | grep -v "node_modules"

# graph-context.ts 사용처
grep -rn "from.*ai/graph-context\|retrieveRelevantGraphContext\|GraphContext" --include="*.ts" --include="*.tsx" packages apps | grep -v "packages/ai/graph-context.ts" | grep -v "packages/ai/ask.ts" | grep -v "node_modules"

# featurePageFirstQuery 사용처
grep -rn "featurePageFirstQuery" --include="*.ts" --include="*.tsx" packages apps | grep -v "node_modules"
```

기대 결과: 각 결과가 ask.ts 또는 자기 파일 내부 + 테스트에만 등장. 다른 active 모듈에 등장하면 plan 수정 필요(아래 Step 2).

- [ ] **Step 2: 예상 외 사용처가 발견되면 plan 수정**

만약 위 grep 결과에 `tutor.ts`, `page-first/**`, `apps/**`가 등장하면 그 파일도 수정 범위에 추가. plan을 그대로 진행하지 말고 사용자에게 보고.

### Task 2: `_legacyAskAI_unused` + legacy imports 제거 (ask.ts)

**Files:** Modify `packages/ai/ask.ts`

- [ ] **Step 1: ask.ts 상단 imports 정리**

`packages/ai/ask.ts:7-46` 교체 — legacy imports 제거:

```typescript
// packages/ai/ask.ts  (retrieval + generation)
// 2026-04-24 (Phase B3): askAI delegates to ask-agent tool-use loop.
// 2026-04-29: legacy retrieval modules (router/graph-context/page-first) removed
//             — only the tool-use agent path remains.

import OpenAI from 'openai';
import { getProvider } from './provider.js';
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError, recordBlocked } from './budget.js';
import { makeCacheKey, getCached, setCached } from './cache.js';
import { askAgentStream } from './agent/ask-agent.js';
import { askAgentToSSE } from './agent/sse-adapter.js';
import { createChatWithTokenFallback } from './openai-compat.js';
import type {
  SSEEvent,
  SourceRef,
  TextSourceRef,
  GraphSourceRef,
  CaseSourceRef,
  DirectorySourceRef,
  RetrievedClaim,
} from './types.js';
```

`db`/`sql`/`buildLegacyKnowledgeSensitivitySqlFilter`/`retrieveRelevantGraphContext`/`retrieveRelevantCases`/`searchDirectory`/`routeQuestion`/`LANE_SOURCE_WEIGHTS`/`featurePageFirstQuery`/`pageFirstAsk` import 제거.

`generateAnswer` (line 279)와 `assembleContext` (line 201)는 다른 모듈(tutor 등)에서 사용 가능 — Task 1 grep으로 확인 후 결정. 사용처 없으면 함께 제거, 있으면 유지.

- [ ] **Step 2: `retrieveRelevantClaims` stub 함수 제거**

`packages/ai/ask.ts:104-131` 전체 블록 삭제. `RetrievedClaim` 타입 import는 `assembleContext`/`toGraphSourceRefs` 등 다른 함수가 쓰면 유지.

- [ ] **Step 3: `_legacyAskAI_unused` 함수 제거**

`packages/ai/ask.ts:519-729` 전체 블록 삭제 (구분 주석 `---- legacy (unused after Phase B3) ----` 포함).

- [ ] **Step 4: `assembleContext`/`toGraphSourceRefs`/`generateAnswer` 사용처 재확인**

```bash
grep -rn "assembleContext\|toGraphSourceRefs\|generateAnswer" --include="*.ts" packages apps | grep -v "packages/ai/ask.ts" | grep -v "node_modules"
```

`tutor.ts`나 테스트만 사용하면 그 위치에 인라인하거나 export 유지. ask.ts 외 사용처가 없으면 함께 삭제.

- [ ] **Step 5: type-check 통과 확인**

```bash
pnpm --filter @jarvis/ai type-check && pnpm --filter @jarvis/web type-check
```

기대: 모든 import 끊긴 곳이 처리됐으면 통과.

- [ ] **Step 6: 커밋**

```bash
git add packages/ai/ask.ts
git commit -m "refactor(ask): remove _legacyAskAI_unused and stub helpers

- Drops the 211-LoC legacy 6-lane ask path that has been unused since
  Phase B3 (2026-04-24). One-week burn-in SLA expired.
- Removes retrieveRelevantClaims stub (returned [] only).
- Drops imports of router, graph-context, featurePageFirstQuery,
  pageFirstAsk that are no longer reachable from askAI.

The agent tool-use loop in askAI() is now the sole entry point. Cache,
budget gate, logLlmCall behavior preserved verbatim."
```

### Task 3: `router.ts` 삭제

**Files:** Delete `packages/ai/router.ts`

- [ ] **Step 1: 사용처 재확인**

```bash
grep -rn "ai/router\|routeQuestion\|LANE_SOURCE_WEIGHTS" --include="*.ts" --include="*.tsx" packages apps | grep -v "node_modules"
```

기대: 결과 0건 (Task 2에서 ask.ts import 제거 후).

- [ ] **Step 2: 파일 삭제**

```bash
rm packages/ai/router.ts
```

테스트 파일이 있으면 함께 삭제: `rm packages/ai/__tests__/router.test.ts` (존재 시).

- [ ] **Step 3: type-check + ai test**

```bash
pnpm --filter @jarvis/ai type-check && pnpm --filter @jarvis/ai test
```

- [ ] **Step 4: 커밋**

```bash
git add -u packages/ai/router.ts
git commit -m "refactor(ask): delete packages/ai/router.ts (unreachable)

6-lane router was only invoked from _legacyAskAI_unused, which was
removed in the previous commit. No remaining call sites."
```

### Task 4: `graph-context.ts` 삭제

**Files:** Delete `packages/ai/graph-context.ts` + `packages/ai/__tests__/graph-context.test.ts`

- [ ] **Step 1: 사용처 재확인**

```bash
grep -rn "ai/graph-context\|retrieveRelevantGraphContext" --include="*.ts" --include="*.tsx" packages apps | grep -v "node_modules"
```

기대: 결과 0건. 만약 `packages/ai/types.ts`에서 `GraphContext` 타입을 export하고 외부가 쓴다면 타입만 별도 파일로 옮긴다.

- [ ] **Step 2: 파일 삭제**

```bash
rm packages/ai/graph-context.ts
rm packages/ai/__tests__/graph-context.test.ts
```

- [ ] **Step 3: type-check + 전체 ai test**

```bash
pnpm --filter @jarvis/ai type-check && pnpm --filter @jarvis/ai test && pnpm --filter @jarvis/ai test
```

연속 2회 ai test.

- [ ] **Step 4: 커밋**

```bash
git add -u packages/ai/graph-context.ts packages/ai/__tests__/graph-context.test.ts
git commit -m "refactor(ask): delete packages/ai/graph-context.ts (unreachable)

retrieveRelevantGraphContext was only invoked from _legacyAskAI_unused.
The agent's wiki_graph_query tool replaces this surface for new code."
```

### Task 5: `featurePageFirstQuery` flag 제거

**Files:** Modify `packages/db/feature-flags.ts` + 관련 테스트

- [ ] **Step 1: 사용처 재확인**

```bash
grep -rn "featurePageFirstQuery\|FEATURE_PAGE_FIRST_QUERY" --include="*.ts" packages apps | grep -v "node_modules"
```

기대: `packages/db/feature-flags.ts` 자기 파일 + 테스트만 등장.

- [ ] **Step 2: feature-flags.ts에서 flag 제거**

`packages/db/feature-flags.ts`를 열고 `featurePageFirstQuery` 함수 + `FEATURE_PAGE_FIRST_QUERY` 상수 부분 제거 (함수의 정확한 라인은 파일 열어 확인).

- [ ] **Step 3: 관련 unit 테스트 정리**

`packages/db/__tests__/feature-flags.test.ts`(있다면)에서 page-first 분기 테스트 제거.

- [ ] **Step 4: ask.test.ts / ask-default-path.test.ts 정리**

`packages/ai/ask.test.ts`에서 `featurePageFirstQuery`/`pageFirstAsk`를 mock하거나 호출하는 describe 블록 제거. agent 경로 단독 테스트만 남김.

`packages/ai/__tests__/ask-default-path.test.ts`도 동일. 만약 이 테스트가 "page-first가 default 경로"를 검증하는 것이면, "agent가 default 경로"로 의도 갱신.

- [ ] **Step 5: 전체 검증 게이트**

```bash
pnpm --filter @jarvis/ai test && \
pnpm --filter @jarvis/db test && \
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint
```

연속 2회 ai test.

- [ ] **Step 6: 커밋**

```bash
git add packages/db/feature-flags.ts packages/ai/ask.test.ts \
        packages/ai/__tests__/ask-default-path.test.ts
git commit -m "refactor(flags): drop FEATURE_PAGE_FIRST_QUERY flag (no callers)

The flag's only consumer was the deleted _legacyAskAI_unused path.
askAI() now unconditionally delegates to the tool-use agent — flipping
this flag had no effect for the past week of burn-in.

Updates ask-default-path.test.ts to assert 'agent is the default path'
instead of 'page-first is the default path'."
```

### Task 6: PR-2 머지 전 통합 검증

- [ ] **Step 1: 전체 검증**

```bash
pnpm --filter @jarvis/auth test && \
pnpm --filter @jarvis/ai test && \
pnpm --filter @jarvis/db test && \
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint
```

연속 2회 ai test.

- [ ] **Step 2: ask 기능 e2e 스모크**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/ask-harness.spec.ts
```

기대: 사용자 입장에서 동작 차이 없음 (legacy 경로는 이미 unused였음).

- [ ] **Step 3: PR 본문**

PR 제목: `refactor(ask): drop legacy 6-lane ask path after burn-in`

본문 요약:
- `_legacyAskAI_unused` 함수 + `retrieveRelevantClaims` stub 제거 (~250 LoC)
- `packages/ai/router.ts`, `packages/ai/graph-context.ts` 삭제
- `FEATURE_PAGE_FIRST_QUERY` flag 제거
- 관련 테스트 블록 정리
- Phase B3 (2026-04-24) 이후 1주 burn-in 종료, agent 경로가 유일 entrypoint

---

## PR-3: Citation 렌더링 통합 (live answer가 [[slug]] raw text로 보이는 버그)

`AskPanel`이 live answer를 인라인 `AnswerText`로 그리는데 `[source:N]`만 분리하고 `[[slug]]`는 raw text로 출력 (`AskPanel.tsx:66-87, 377`). `AnswerCard`의 `AnswerBody`(AnswerCard.tsx:181-237)는 양쪽 다 처리하지만 `AnswerCard` 내부 함수라 재사용 불가. `AnswerBody`를 별도 컴포넌트로 추출해 live와 history 양쪽이 같은 렌더러를 쓰게 한다.

**File Structure:**
- Create: `apps/web/components/ai/AnswerBody.tsx` — 추출된 단일 citation 렌더러
- Create: `apps/web/components/ai/AnswerBody.test.tsx`
- Modify: `apps/web/components/ai/AnswerCard.tsx` — `AnswerBody` import해서 사용 (인라인 정의 제거)
- Modify: `apps/web/components/ai/AskPanel.tsx` — 인라인 `AnswerText` 제거, `AnswerBody` 사용

### Task 1: `AnswerBody` 컴포넌트 추출 + 테스트 (TDD)

**Files:**
- Create: `apps/web/components/ai/AnswerBody.tsx`
- Create: `apps/web/components/ai/AnswerBody.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/components/ai/AnswerBody.test.tsx`:

```typescript
/// <reference types="vitest" />
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SourceRef, WikiPageSourceRef } from "@jarvis/ai/types";
import { AnswerBody } from "./AnswerBody";

vi.mock("./WikiPanelContext", () => ({
  useWikiPanel: () => ({ hasProvider: false, open: vi.fn() }),
}));

const wikiSource: WikiPageSourceRef = {
  kind: "wiki-page",
  pageId: "p1",
  slug: "leave-policy",
  title: "휴가 정책",
  path: "wiki/ws/auto/concepts/leave-policy.md",
  confidence: 0.9,
};

describe("AnswerBody", () => {
  it("[[slug]] citation은 sources에 있으면 ClaimBadge로 렌더", () => {
    render(
      <AnswerBody
        text="휴가는 [[leave-policy]]에 따른다."
        sources={[wikiSource]}
        workspaceId="ws-1"
      />,
    );
    // ClaimBadge는 sourceNumber=1을 노출
    expect(screen.getByText(/1/)).toBeInTheDocument();
    // raw [[leave-policy]] 텍스트는 노출되지 않아야 함
    expect(screen.queryByText("[[leave-policy]]")).toBeNull();
  });

  it("[[slug]]가 sources에 없으면 wiki link로 fallback", () => {
    render(
      <AnswerBody
        text="휴가는 [[unknown-page]]를 참고."
        sources={[]}
        workspaceId="ws-1"
      />,
    );
    const link = screen.getByRole("link", { name: "unknown-page" });
    expect(link).toHaveAttribute("href", "/wiki/ws-1/unknown-page");
  });

  it("[source:N] legacy citation도 처리", () => {
    const textSource: SourceRef = {
      kind: "text",
      pageId: "p2",
      title: "정책",
      url: "/k/p2",
      excerpt: "내용",
      confidence: 0.8,
    };
    render(
      <AnswerBody
        text="규정은 [source:1]에 명시."
        sources={[textSource]}
        workspaceId="ws-1"
      />,
    );
    expect(screen.queryByText("[source:1]")).toBeNull();
  });

  it("citation이 전혀 없으면 텍스트 그대로", () => {
    render(
      <AnswerBody
        text="안녕하세요"
        sources={[]}
        workspaceId="ws-1"
      />,
    );
    expect(screen.getByText("안녕하세요")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
pnpm --filter @jarvis/web test AnswerBody
```

기대: `Cannot find module './AnswerBody'`로 FAIL.

- [ ] **Step 3: `AnswerBody.tsx` 작성**

`apps/web/components/ai/AnswerBody.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import type { SourceRef } from "@jarvis/ai/types";
import { ClaimBadge } from "./ClaimBadge";
import { useWikiPanel } from "./WikiPanelContext";

function WikiLink({
  workspaceId,
  slug,
  className,
  children,
}: {
  workspaceId: string;
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const panel = useWikiPanel();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLargeScreen(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const href = `/wiki/${workspaceId}/${encodeURIComponent(slug)}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!isLargeScreen || !panel.hasProvider) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        panel.open({ slug });
      }}
    >
      {children}
    </a>
  );
}

interface AnswerBodyProps {
  text: string;
  sources: SourceRef[];
  workspaceId: string;
}

/**
 * Single citation renderer used by both live streaming (AskPanel) and
 * history rendering (AnswerCard). Handles two formats:
 *   [source:N]   — legacy 1-based index
 *   [[slug]]     — Phase B3/B4 agent format, resolved against wiki-page sources
 */
export function AnswerBody({ text, sources, workspaceId }: AnswerBodyProps) {
  const slugToIndex = new Map<string, number>();
  sources.forEach((s, i) => {
    if (s.kind === "wiki-page") {
      slugToIndex.set(s.slug, i + 1);
    }
  });

  const parts = text.split(/(\[source:\d+\]|\[\[[^\]]+\]\])/g);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[--fg-primary]">
      {parts.map((part, index) => {
        const legacyMatch = part.match(/^\[source:(\d+)\]$/);
        if (legacyMatch?.[1]) {
          return (
            <ClaimBadge
              key={index}
              sourceNumber={parseInt(legacyMatch[1], 10)}
              sources={sources}
            />
          );
        }
        const wikilinkMatch = part.match(/^\[\[([^\]]+)\]\]$/);
        if (wikilinkMatch?.[1]) {
          const slug = wikilinkMatch[1];
          const sourceNumber = slugToIndex.get(slug);
          if (sourceNumber !== undefined) {
            return (
              <ClaimBadge
                key={index}
                sourceNumber={sourceNumber}
                sources={sources}
              />
            );
          }
          return (
            <WikiLink
              key={index}
              workspaceId={workspaceId}
              slug={slug}
              className="text-[--brand-primary-text] underline decoration-[--brand-primary-bg] underline-offset-2 hover:decoration-[--brand-primary]"
            >
              {slug}
            </WikiLink>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @jarvis/web test AnswerBody && pnpm --filter @jarvis/web test AnswerBody
```

기대: 4 tests passed (2회).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/components/ai/AnswerBody.tsx \
        apps/web/components/ai/AnswerBody.test.tsx
git commit -m "feat(ask): extract AnswerBody as shared citation renderer

Single component handles both [source:N] (legacy) and [[slug]] (agent)
citation formats. Will be reused by AnswerCard (history) and AskPanel
(live streaming) so both surfaces show identical citation rendering."
```

### Task 2: `AnswerCard`가 추출된 `AnswerBody` 사용

**Files:** Modify `apps/web/components/ai/AnswerCard.tsx:181-237, 532, 539`

- [ ] **Step 1: AnswerCard 수정**

`apps/web/components/ai/AnswerCard.tsx`에서:
- Line 181-237의 인라인 `AnswerBody` 함수와 그 위 `WikiLink` (line 31-71) 정의 제거
- 상단 import에 `import { AnswerBody } from "./AnswerBody";` 추가
- `useState`, `useEffect`가 이 파일에서 더 이상 필요 없으면 import에서 제거 (`AnswerBody`로 옮겼음)
- `Link` from next/link, `lucide-react` icons 등 다른 import는 그대로 (다른 섹션이 사용)
- Line 532 `<AnswerBody text={answer} sources={sources} workspaceId={workspaceId} />` 호출은 그대로 유지 (이제 import된 컴포넌트)
- Line 539 `<AnswerBody ... />` 호출도 그대로 유지

- [ ] **Step 2: AnswerCard 테스트 실행 (회귀 없음 확인)**

```bash
pnpm --filter @jarvis/web test AnswerCard && pnpm --filter @jarvis/web test AnswerCard
```

기대: 모든 기존 AnswerCard 테스트 통과 (citation 동작은 동일).

- [ ] **Step 3: 커밋**

```bash
git add apps/web/components/ai/AnswerCard.tsx
git commit -m "refactor(ask): AnswerCard imports shared AnswerBody

Removes the inline AnswerBody + WikiLink definitions in favor of the
shared component. No behavioral change — pixels and DOM identical."
```

### Task 3: `AskPanel`이 `AnswerBody` 사용 (live citation 버그 수정)

**Files:** Modify `apps/web/components/ai/AskPanel.tsx:66-87, 377`

- [ ] **Step 1: AskPanel 수정**

`apps/web/components/ai/AskPanel.tsx`에서:

1. Line 66-87의 인라인 `AnswerText` 함수 정의 전체 제거.
2. Line 14 `import { AnswerCard } from "./AnswerCard";` 아래에 `import { AnswerBody } from "./AnswerBody";` 추가.
3. Line 15 `import { ClaimBadge } from "./ClaimBadge";` — `ClaimBadge`가 AskPanel 내부 다른 위치에서 사용 안 되면 제거. 사용하면 유지 (Grep으로 확인).
4. Line 376-378의 live answer 렌더 부분:

기존 (line 375-382):
```tsx
<div className="prose prose-sm max-w-none text-sm leading-relaxed text-[--fg-primary]">
  {answer ? (
    <AnswerText text={answer} sources={sources} />
  ) : null}
  {isStreaming && answer && (
    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse align-text-bottom bg-[--brand-primary-text]" />
  )}
</div>
```

교체:
```tsx
{answer ? (
  <div className="relative">
    <AnswerBody text={answer} sources={sources} workspaceId={workspaceId} />
    {isStreaming && (
      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse align-text-bottom bg-[--brand-primary-text]" />
    )}
  </div>
) : null}
```

(`AnswerBody`는 이미 prose wrapper를 자체 포함하므로 외부 div의 prose 클래스 중복 제거.)

- [ ] **Step 2: 신규 회귀 테스트**

`apps/web/components/ai/AskPanel.test.tsx`(존재 시) 또는 신규 케이스 추가:

```typescript
// AskPanel.test.tsx 또는 새 파일 AskPanel-citation.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AskPanel } from "./AskPanel";

// 필요한 mocks: useAskAI, useTranslations, getConversationTokenUsageAction, useRouter
// (기존 AskPanel 테스트가 있다면 그 mock 패턴 재사용)

describe("AskPanel — live citation rendering", () => {
  it("live answer의 [[slug]]가 raw text로 보이지 않음 (sources 도착 후)", async () => {
    // useAskAI mock: streaming 끝난 상태로 answer + wiki-page sources 반환
    render(<AskPanel workspaceId="ws-1" />);
    // 기존엔 [[leave-policy]] raw text가 노출됐음 — 이제는 ClaimBadge 또는 link
    expect(screen.queryByText(/\[\[leave-policy\]\]/)).toBeNull();
  });
});
```

테스트 작성에 필요한 hook mock 패턴은 기존 AskPanel 테스트 또는 e2e가 있다면 그 패턴을 따른다.

- [ ] **Step 3: 테스트 + 게이트**

```bash
pnpm --filter @jarvis/web test AskPanel && pnpm --filter @jarvis/web test AskPanel
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web lint
```

- [ ] **Step 4: 커밋**

```bash
git add apps/web/components/ai/AskPanel.tsx \
        apps/web/components/ai/AskPanel.test.tsx
git commit -m "fix(ask): live answer renders [[slug]] citations correctly

Replaces the inline AnswerText (which only handled [source:N]) with the
shared AnswerBody component. Live streaming and history now use the
same citation renderer — no more raw [[slug]] text leaking to users
during the live response phase."
```

### Task 4: PR-3 머지 전 통합 검증

- [ ] **Step 1: 전체 게이트**

```bash
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint && \
pnpm --filter @jarvis/web test && \
pnpm --filter @jarvis/web test
```

연속 2회 web test.

- [ ] **Step 2: e2e 스모크 (필수, UI 변경)**

```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/ask-harness.spec.ts
```

- [ ] **Step 3: 수동 dev 서버 확인 (golden path)**

CLAUDE.md "UI 변경은 dev 서버에서 직접 확인" 규칙. 다음 시나리오:

```bash
pnpm dev
# 브라우저: /ask 진입 → wiki에 등록된 페이지에 대한 질문 (예: "휴가 정책 알려줘")
# 답변 스트리밍 중 [[휴가-정책]] 같은 텍스트가 raw로 보이지 않는지 확인
# 답변 완료 후 history로 이동했을 때도 동일하게 보이는지 확인
```

- [ ] **Step 4: PR 본문**

PR 제목: `fix(ask): live answer renders [[slug]] citations via shared AnswerBody`

본문 요약:
- `AnswerCard` 내부의 `AnswerBody` + `WikiLink`를 별도 컴포넌트로 추출
- `AskPanel`의 인라인 `AnswerText`(legacy `[source:N]` only) 제거
- live streaming과 history 양쪽이 같은 citation renderer 사용
- 추출 외 동작 변화 없음 (AnswerCard 픽셀 동일)

---

## 머지 순서 + 의존성

1. **PR-1 → 머지** — 단독 (보안 차단)
2. **PR-2 → 머지** — PR-1과 독립 가능, 순서 무관 (둘 다 packages/ai만 건드림)
3. **PR-3 → 머지** — UI만 건드림, 1/2와 독립

병렬 가능. PR-1과 PR-2가 같은 파일을 안 건드리는지 worktree 시작 시 한 번 더 확인 (PR-1: agent/tools/**, PR-2: ask.ts/router.ts/graph-context.ts).

세 PR 모두 머지 후 main에서:

```bash
pnpm --filter @jarvis/auth test && \
pnpm --filter @jarvis/ai test && \
pnpm --filter @jarvis/web test && \
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint && \
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/ask-harness.spec.ts
```

연속 2회 (CLAUDE.md 규칙). 모두 통과하면 P2/P3 작업 단계로 이동.
