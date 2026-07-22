# Dashboard Question Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드를 질문 시작점과 실제 최근 대화·Wiki 근거로 채우고, 질문은 Ask AI 화면에서만 실행한다.

**Architecture:** Dashboard는 server component에서 두 개의 bounded query를 병렬 실행하고 client launcher에는 표시 데이터만 전달한다. 질문 draft는 URL이나 새 API 없이 `sessionStorage`를 통해 기존 `AskPanel`로 한 번 전달하며, 기존 `/api/ask` 스트림이 대화 생성과 LLM 호출을 전담한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM, next-intl, Vitest, Tailwind CSS

---

### Task 1: 최근 대화와 최근 Wiki 조회를 제한한다

**Files:**
- Modify: `apps/web/lib/server/conversation-repository.ts`
- Modify: `apps/web/lib/server/wiki-page-loader.ts`
- Test: `apps/web/lib/server/conversation-repository.test.ts`
- Test: `apps/web/lib/server/wiki-page-loader.test.ts`

- [ ] **Step 1: 최대 조회 개수를 검증하는 실패 테스트 작성**

`listOwnedConversations`와 새 `listRecentWikiPages`가 `limit: 5`를 query builder에 전달하는지 repository mock으로 검증한다.

- [ ] **Step 2: 테스트가 함수 또는 limit 부재로 실패하는지 확인**

Run: `pnpm --filter @jarvis/web test -- conversation-repository.test.ts wiki-page-loader.test.ts`

Expected: FAIL because `listRecentWikiPages` 또는 limit 옵션이 없다.

- [ ] **Step 3: 최소 조회 API 구현**

```ts
export async function listOwnedConversations(input: {
  workspaceId: string;
  userId: string;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const query = db.select({
    id: askConversation.id,
    title: askConversation.title,
    updatedAt: askConversation.updatedAt,
  })
    .from(askConversation)
    .where(and(
      eq(askConversation.workspaceId, input.workspaceId),
      eq(askConversation.userId, input.userId),
    ))
    .orderBy(desc(askConversation.updatedAt));
  return input.limit ? query.limit(input.limit) : query;
}

export async function listRecentWikiPages(input: {
  workspaceId: string;
  limit: number;
}): Promise<WikiListItem[]> {
  return db.select({
    id: wikiPageIndex.id,
    title: wikiPageIndex.title,
    slug: wikiPageIndex.slug,
    path: wikiPageIndex.path,
    zone: wikiPageIndex.zone,
    pageType: wikiPageIndex.pageType,
    snippet: wikiPageIndex.snippet,
    stale: wikiPageIndex.stale,
  })
    .from(wikiPageIndex)
    .where(and(
      eq(wikiPageIndex.workspaceId, input.workspaceId),
      inArray(wikiPageIndex.zone, ["auto", "manual"]),
      eq(wikiPageIndex.publishedStatus, "published"),
      notInArray(wikiPageIndex.path, Array.from(EXCLUDED_FILES)),
    ))
    .orderBy(desc(wikiPageIndex.updatedAt), asc(wikiPageIndex.title))
    .limit(input.limit);
}
```

- [ ] **Step 4: repository 테스트 통과 확인**

Run: `pnpm --filter @jarvis/web test -- conversation-repository.test.ts wiki-page-loader.test.ts`

Expected: PASS.

### Task 2: Dashboard 질문 launcher를 구현한다

**Files:**
- Create: `apps/web/components/dashboard/DashboardAskLauncher.tsx`
- Create: `apps/web/components/dashboard/DashboardAskLauncher.test.tsx`
- Reuse: `apps/web/components/ai/ask-keyboard.ts`

- [ ] **Step 1: 추천 질문과 키보드 동작 실패 테스트 작성**

```tsx
it("fills a suggestion without navigating", () => {
  render(<DashboardAskLauncher />);
  click("식대 비과세 한도는?");
  expect(textarea).toHaveValue("식대 비과세 한도는?");
  expect(router.push).not.toHaveBeenCalled();
});

it("stores the draft and navigates only on Enter", () => {
  changeTextarea("퇴직소득 원천징수 절차는?");
  keydown({ key: "Enter" });
  expect(sessionStorage.getItem(DASHBOARD_ASK_DRAFT_KEY)).toBe("퇴직소득 원천징수 절차는?");
  expect(router.push).toHaveBeenCalledWith("/ask");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jarvis/web test -- DashboardAskLauncher.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: launcher 최소 구현**

```tsx
export const DASHBOARD_ASK_DRAFT_KEY = "jarvis.ask.dashboard-draft";

function submit() {
  const draft = question.trim();
  if (!draft) return;
  try {
    sessionStorage.setItem(DASHBOARD_ASK_DRAFT_KEY, draft);
    router.push("/ask");
  } catch {
    setError(t("launcher.storageFailed"));
  }
}
```

Textarea는 `maxLength={2000}`과 기존 `shouldSubmitQuestion`을 사용하고, 추천 질문 button은 입력값만 변경한다.

- [ ] **Step 4: launcher 테스트 통과 확인**

Run: `pnpm --filter @jarvis/web test -- DashboardAskLauncher.test.tsx`

Expected: PASS.

### Task 3: AskPanel이 dashboard draft를 한 번만 소비한다

**Files:**
- Modify: `apps/web/components/ai/AskPanel.tsx`
- Modify: `apps/web/components/ai/AskPanel.test.tsx`
- Import: `apps/web/components/dashboard/DashboardAskLauncher.tsx`

- [ ] **Step 1: draft 단일 소비 실패 테스트 작성**

```tsx
sessionStorage.setItem(DASHBOARD_ASK_DRAFT_KEY, "식대 비과세 한도는?");
render(<AskPanel />);
await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
expect(sessionStorage.getItem(DASHBOARD_ASK_DRAFT_KEY)).toBeNull();
```

컴포넌트를 다시 render해도 동일 draft가 재전송되지 않는지 함께 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @jarvis/web test -- AskPanel.test.tsx`

Expected: FAIL because AskPanel does not consume dashboard draft.

- [ ] **Step 3: 기존 submit 함수 재사용 구현**

`submit(questionOverride?: string)`으로 변경하고 mount effect에서 storage 값을 먼저 삭제한 뒤 `submit(draft)`를 한 번 호출한다. 기존 사용자가 직접 입력한 질문, SSE 처리, router replacement는 변경하지 않는다.

- [ ] **Step 4: AskPanel 테스트 통과 확인**

Run: `pnpm --filter @jarvis/web test -- AskPanel.test.tsx`

Expected: PASS.

### Task 4: 실제 데이터로 Dashboard 화면을 조립한다

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/components/dashboard/DashboardRecentConversations.tsx`
- Create: `apps/web/components/dashboard/DashboardRecentEvidence.tsx`
- Modify: `apps/web/messages/ko.json`
- Test: `apps/web/app/(app)/dashboard/page.test.tsx`

- [ ] **Step 1: Dashboard 렌더 실패 테스트 작성**

테스트는 다음을 확인한다.

```ts
expect(screen.getByText("무엇을 확인할까요?")).toBeVisible();
expect(screen.getByText("최근 질문")).toBeVisible();
expect(screen.getByText("최근 근거")).toBeVisible();
expect(listOwnedConversations).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
expect(listRecentWikiPages).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
```

- [ ] **Step 2: 현재 단일 카드 Dashboard에서 테스트 실패 확인**

Run: `pnpm --filter @jarvis/web test -- dashboard/page.test.tsx`

Expected: FAIL because the three dashboard sections are absent.

- [ ] **Step 3: server page와 표시 컴포넌트 구현**

```tsx
const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/dashboard");
const [conversations, evidence] = await Promise.all([
  listOwnedConversations({ workspaceId: session.workspaceId, userId: session.userId, limit: 5 }),
  listRecentWikiPages({ workspaceId: session.workspaceId, limit: 5 }),
]);
```

상단에는 `DashboardAskLauncher`, 하단에는 데스크톱 2열로 최근 대화와 최근 근거를 배치한다. Wiki 링크는 기존 `wikiPathToRoute`를 사용한다.

- [ ] **Step 4: Dashboard와 관련 컴포넌트 테스트 통과 확인**

Run: `pnpm --filter @jarvis/web test -- dashboard DashboardAskLauncher AskPanel conversation-repository wiki-page-loader`

Expected: PASS.

### Task 5: 통합 검증과 배포

**Files:**
- Verify only

- [ ] **Step 1: 변경 파일 lint와 type-check 실행**

Run: `pnpm --filter @jarvis/web lint && pnpm --filter @jarvis/web type-check`

Expected: PASS with zero warnings.

- [ ] **Step 2: Web unit test 실행**

Run: `pnpm --filter @jarvis/web test`

Expected: PASS.

- [ ] **Step 3: production build 실행**

Run: `pnpm --filter @jarvis/web build`

Expected: PASS and dashboard/ask routes generated.

- [ ] **Step 4: 변경사항 커밋과 main push**

```bash
git add apps/web docs/superpowers/plans/2026-07-22-dashboard-question-launcher.md
git commit -m "feat(web): turn dashboard into Ask launcher"
git push origin main
```
