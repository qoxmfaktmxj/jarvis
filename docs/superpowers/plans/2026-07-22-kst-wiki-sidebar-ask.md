# KST·Wiki·Sidebar·Ask UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 사용자 노출 시간을 KST 초 단위로 통일하고, HR Wiki 페이징/우측 패널, 전역 Sidebar rail, Ask 대화 관리 UX를 구현한다.

**Architecture:** 현재 DB/API 저장 계약은 유지하고 표시 계층에 공통 formatter를 둔다. Wiki는 DB projection으로 목록을 페이징하고 본문은 기존 wiki-fs API로 읽으며, Sidebar와 Ask 목록은 작은 client shell로 상호작용만 담당한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle, next-intl, Tailwind CSS 4, Lucide, Vitest, Playwright.

## Global Constraints

- 제품 표시는 정확히 `Jarvis`다.
- Sidebar 토글은 `PanelLeftClose`와 `PanelLeftOpen` 아이콘을 사용한다.
- 사용자 노출 date-time 형식은 `Asia/Seoul` 기준 `YYYY-MM-DD HH:mm:ss`다.
- HR Wiki 페이지 크기는 정확히 20건이다.
- 데스크톱 Wiki 상세는 오른쪽 split panel, 모바일과 modifier click은 전체 페이지 이동이다.
- `/ask` 최초 진입 시 전역 Sidebar만 rail로 자동 접고, 사용자가 같은 화면에서 다시 펼칠 수 있어야 한다.
- 대화 메뉴는 `이름 변경`과 빨간색 `삭제`만 제공한다.
- 모든 Ask mutation은 `workspaceId + userId + conversationId` 소유권 조건을 사용한다.
- Wiki 본문은 disk SSoT이며 DB는 projection only다.
- 외부 라이브러리를 추가하지 않는다.
- 모든 새 한국어 UI 문자열은 `apps/web/messages/ko.json`을 사용한다.

---

### Task 1: KST 공통 시간 표시

**Files:**
- Create: `apps/web/lib/format-date-time.ts`
- Create: `apps/web/lib/format-date-time.test.ts`
- Modify: `apps/web/components/dashboard/DashboardRecentConversations.tsx`
- Modify: `apps/web/components/dashboard/DashboardRecentEvidence.tsx`
- Modify: `apps/web/app/(app)/admin/llm-usage/_components/LlmUsageGridContainer.tsx`
- Modify: `apps/web/app/(app)/admin/audit/_components/AuditGridContainer.tsx`
- Modify: `apps/web/app/(app)/admin/users/_components/UsersGridContainer.tsx`
- Modify: `apps/web/app/(app)/admin/wiki-reviews/_components/WikiReviewsGridContainer.tsx`

**Interfaces:**
- Produces: `formatDateTimeKst(value: Date | string | number | null | undefined): string`.
- Output: valid input → `YYYY-MM-DD HH:mm:ss`, invalid/null → `""`.

- [ ] **Step 1: Write the failing formatter test**

```ts
expect(formatDateTimeKst("2026-07-22T06:01:02.999Z")).toBe("2026-07-22 15:01:02");
expect(formatDateTimeKst("invalid")).toBe("");
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @jarvis/web test -- lib/format-date-time.test.ts`

Expected: FAIL because `formatDateTimeKst` does not exist.

- [ ] **Step 3: Implement the formatter with `Intl.DateTimeFormat(...).formatToParts()`**

Use `locale: "en-CA"`, `timeZone: "Asia/Seoul"`, `hourCycle: "h23"`, and two-digit month/day/hour/minute/second. Assemble parts explicitly so milliseconds and timezone suffixes never appear.

- [ ] **Step 4: Format every currently visible timestamp before rendering**

Dashboard rows call the formatter directly. Admin grid containers map only the visible timestamp keys (`createdAt` or `updatedAt`) and preserve repository DTOs.

- [ ] **Step 5: Run GREEN and focused component tests**

Run: `pnpm --filter @jarvis/web test -- lib/format-date-time.test.ts components/dashboard`

Expected: all selected tests pass with no warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/format-date-time.ts apps/web/lib/format-date-time.test.ts apps/web/components/dashboard apps/web/app/\(app\)/admin
git commit -m "fix: display timestamps in Korea time"
```

### Task 2: 전역 Sidebar rail과 Jarvis 브랜드 링크

**Files:**
- Create: `apps/web/components/layout/SidebarClient.tsx`
- Create: `apps/web/components/layout/SidebarClient.test.tsx`
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Modify: `apps/web/components/layout/AppShell.tsx`
- Modify: `apps/web/messages/ko.json`

**Interfaces:**
- `Sidebar` remains an async server component and passes translated labels plus menu items to `SidebarClient`.
- `SidebarClient` stores `expanded | rail` under `jarvis.sidebar.mode`.

- [ ] **Step 1: Write failing interaction tests**

Cover exact brand text/link, `PanelLeftClose`→`PanelLeftOpen`, localStorage persistence, initial `/ask` collapse, and manual reopen on the same `/ask` pathname.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @jarvis/web test -- components/layout/SidebarClient.test.tsx`

Expected: FAIL because the client component does not exist.

- [ ] **Step 3: Implement server/client split**

Keep menu rendering and safe internal `Link` navigation. On `lg` screens expanded width is 16rem and rail width is 3.75rem; rail renders icons with title labels. On mobile preserve the current horizontal navigation.

- [ ] **Step 4: Implement Ask entry behavior without trapping the user**

Track the previous pathname in a ref. Collapse when pathname changes from a non-Ask route to `/ask` or when the component initially hydrates on `/ask`. Do not collapse again after a manual reopen while pathname is unchanged.

- [ ] **Step 5: Add i18n labels**

Add `Navigation.collapseSidebar`, `Navigation.expandSidebar`, and `Navigation.goDashboard`. Change `Navigation.productName` to `Jarvis`.

- [ ] **Step 6: Run GREEN**

Run: `pnpm --filter @jarvis/web test -- components/layout/SidebarClient.test.tsx components/layout`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/layout apps/web/messages/ko.json
git commit -m "feat: add collapsible Jarvis sidebar"
```

### Task 3: HR Wiki 서버 페이징과 우측 split panel

**Files:**
- Modify: `apps/web/lib/server/wiki-page-loader.ts`
- Modify: `apps/web/lib/server/wiki-page-loader.test.ts`
- Modify: `apps/web/app/(app)/wiki/page.tsx`
- Create: `apps/web/app/(app)/wiki/_components/WikiIndexShell.tsx`
- Create: `apps/web/app/(app)/wiki/_components/WikiIndexShell.test.tsx`
- Modify: `apps/web/messages/ko.json`

**Interfaces:**
- `listWikiPages({ workspaceId, page, limit })` returns `{ rows, total, page, totalPages }`.
- `WikiIndexShell` receives serialized rows and pagination metadata; it fetches `/api/wiki/page?path=<encoded path>` for panel detail.

- [ ] **Step 1: Write failing loader pagination tests**

Assert count query use, `limit(20)`, correct offsets for pages 1 and 2, and clamping page 999 to `totalPages`.

- [ ] **Step 2: Run loader RED**

Run: `pnpm --filter @jarvis/web test -- lib/server/wiki-page-loader.test.ts`

Expected: FAIL because `listWikiPages` returns an array and does not paginate.

- [ ] **Step 3: Implement count-first server pagination**

Reuse the exact workspace/zone/published/excluded-file predicate for count and rows. Parse `searchParams.page` in the page RSC, defaulting invalid input to 1, and pass `limit: 20`.

- [ ] **Step 4: Write failing Wiki shell interaction tests**

Assert ordinary desktop click opens the panel, close removes it, Ctrl/Meta/Shift/middle click is not prevented, and failed fetch exposes an alert.

- [ ] **Step 5: Run UI RED and implement the split panel**

Run: `pnpm --filter @jarvis/web test -- app/\(app\)/wiki/_components/WikiIndexShell.test.tsx`

Use `matchMedia("(min-width: 1024px)")`. The list and panel each scroll independently. Render body with `ReactMarkdown`/`remarkGfm`; keep the full-page href on every card.

- [ ] **Step 6: Add pagination links and i18n**

Add `Wiki.Index` keys for title, description, previous, next, page status, panel loading/error/close. Page links use `?page=N` and disable at boundaries.

- [ ] **Step 7: Run GREEN and wiki integrity checks**

Run: `pnpm --filter @jarvis/web test -- lib/server/wiki-page-loader.test.ts app/\(app\)/wiki/_components/WikiIndexShell.test.tsx`

Run: `pnpm wiki:check`

Expected: focused tests and wiki boundary checks pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/server/wiki-page-loader.ts apps/web/lib/server/wiki-page-loader.test.ts apps/web/app/\(app\)/wiki apps/web/messages/ko.json
git commit -m "feat: add paged Wiki split view"
```

### Task 4: Ask 새 대화·이름 변경·삭제 메뉴와 근거 우측 패널

**Files:**
- Modify: `apps/web/lib/server/conversation-repository.ts`
- Modify: `apps/web/lib/server/conversation-repository.test.ts`
- Create: `apps/web/app/(app)/ask/actions.ts`
- Modify: `apps/web/app/(app)/ask/_components/ConversationList.tsx`
- Create: `apps/web/app/(app)/ask/_components/ConversationListClient.tsx`
- Create: `apps/web/app/(app)/ask/_components/ConversationListClient.test.tsx`
- Create: `apps/web/app/(app)/ask/_components/AskWorkspace.tsx`
- Create: `apps/web/app/(app)/ask/_components/AskWorkspace.test.tsx`
- Modify: `apps/web/app/(app)/ask/page.tsx`
- Modify: `apps/web/app/(app)/ask/[conversationId]/page.tsx`
- Modify: `apps/web/components/ai/AnswerBody.tsx`
- Modify: `apps/web/components/ai/AnswerCard.tsx`
- Modify: `apps/web/components/ai/SourceRefCard.tsx`
- Modify: `apps/web/messages/ko.json`
- Modify: `apps/web/e2e/conversation-isolation.spec.ts`

**Interfaces:**
- `renameOwnedConversation({ workspaceId, userId, conversationId, title }): Promise<boolean>`.
- `deleteOwnedConversation({ workspaceId, userId, conversationId }): Promise<boolean>`.
- Server actions return `{ ok: true } | { ok: false; errorCode: "INVALID_TITLE" | "NOT_FOUND" }`.
- Wiki 근거가 있는 링크는 데스크톱 일반 좌클릭에서 `/api/wiki/page?path=<encoded path>` 우측 패널을 열고, 모바일·modifier·middle click은 기존 `/wiki/...` 전체 페이지 이동을 유지한다.

- [ ] **Step 1: Write failing repository ownership tests**

Assert rename/delete queries include workspace, user, and conversation id; empty or over-200 title is rejected before mutation; delete returns false when no row is returned.

- [ ] **Step 2: Run repository RED**

Run: `pnpm --filter @jarvis/web test -- lib/server/conversation-repository.test.ts`

Expected: FAIL because mutation functions do not exist.

- [ ] **Step 3: Implement minimal owner-scoped repository and server actions**

Server actions use the authenticated page/action session, never accept workspaceId/userId from the client, call `revalidatePath("/ask")`, and return typed error codes.

- [ ] **Step 4: Write failing conversation menu tests**

Assert `+` links to `/ask`, each row has an accessible menu trigger, rename dialog submits trimmed text, delete button uses destructive styling and confirmation, and deleting the active conversation calls `router.replace("/ask")`.

- [ ] **Step 5: Run UI RED and implement the client list**

Run: `pnpm --filter @jarvis/web test -- app/\(app\)/ask/_components/ConversationListClient.test.tsx`

Use native React state and the existing `Dialog`; do not add a dropdown dependency. The vertical-dot popover closes after action or Escape.

- [ ] **Step 6: Add Ask citation split panel**

Add an Ask workspace provider/shell around both Ask routes. Internal Wiki citations in the answer body and source cards open the right split panel on desktop; official external-only sources keep their safe new-tab behavior. Add focused tests for ordinary desktop click, close, mobile/modifier fallback, and fetch failure.

- [ ] **Step 7: Add i18n and E2E ownership coverage**

Add `Ask.Conversations` keys for menu, rename, rename title/label/save, delete, delete title/description/confirm, and action failures. Extend conversation isolation to verify another user's conversation cannot be renamed or deleted.

- [ ] **Step 8: Run GREEN**

Run: `pnpm --filter @jarvis/web test -- lib/server/conversation-repository.test.ts app/\(app\)/ask/_components/ConversationListClient.test.tsx app/\(app\)/ask/_components/AskWorkspace.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/server/conversation-repository.ts apps/web/lib/server/conversation-repository.test.ts apps/web/app/\(app\)/ask apps/web/messages/ko.json apps/web/e2e/conversation-isolation.spec.ts
git commit -m "feat: manage Ask conversations"
```

### Task 5: 통합 검증

**Files:**
- Modify only if a verification failure exposes a regression in the files above.

- [ ] **Step 1: Run web unit tests**

Run: `pnpm --filter @jarvis/web test`

- [ ] **Step 2: Run static gates**

Run: `pnpm --filter @jarvis/web type-check`

Run: `pnpm --filter @jarvis/web lint`

Run: `pnpm audit:rsc`

Run: `pnpm wiki:check`

- [ ] **Step 3: Run targeted Playwright**

Run: `pnpm --filter @jarvis/web exec playwright test e2e/conversation-isolation.spec.ts e2e/wiki-search.spec.ts`

- [ ] **Step 4: Manually verify browser behavior**

Check dashboard brand link/sidebar toggle, Ask auto rail and conversation menu, Wiki pagination/panel, and KST timestamp display at desktop and mobile widths.

- [ ] **Step 5: Final review and integration**

Generate a full branch diff, resolve all Critical/Important review findings, merge fast-forward to `main`, rerun focused smoke checks, and push `main`.
