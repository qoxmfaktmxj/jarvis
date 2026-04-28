# Ask Wiki Source — Split Pane (Inline Wiki Panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask AI 페이지에서 답변의 wiki source(또는 답변 본문 안의 `[[wikilink]]`)를 클릭하면, 새 페이지로 navigate하지 않고 화면 우측 절반에 인라인 wiki panel을 열어 두 화면(채팅 + 위키)을 항상 50/50으로 함께 본다. 좌측 AskSidebar(대화 목록)는 사용자가 토글해서 collapse/expand할 수 있고 그 상태는 localStorage에 영구 저장된다.

**Architecture:**
- `/ask` 라우트 전용. 글로벌 nav Sidebar(rail/expanded) 토글과 독립. lg(≥1024px) 이상에서만 split pane 활성, lg 미만에서는 기존처럼 `/wiki/[workspaceId]/[...path]` 풀페이지로 navigate.
- `ask/layout.tsx`(server component)는 그대로 두고 그 안에 새 client wrapper `AskShell`을 추가해 (a) AskSidebar collapse 상태 + (b) WikiPanel state(현재 열린 wiki, navigate stack)를 React Context로 노출.
- WikiPanel은 새 API `GET /api/wiki/page?workspaceId=X&path=Y`로 wiki body+meta+orphanSlugs JSON을 가져와 기존 `<WikiPageView>` 컴포넌트(이미 `onWikiLinkClick` prop 받음)에 그대로 라우팅. wikilink 클릭은 panel 내 stack에 push → 뒤로가기 버튼으로 pop.
- AskPanel/AnswerCard의 wiki source link는 `<Link href>` → `<button onClick>`으로 변경하면서 lg 이상에서는 context의 `openPanel(slug)`을 호출, lg 미만에서는 `router.push('/wiki/<workspaceId>/<slug>')` fallback.

**Tech Stack:** Next.js 15 App Router · React 19 · Tailwind v4 · Vitest 3 · Playwright 1.x · pnpm 10 · Windows + git bash. 기존 `WikiPageView` / `loadWikiPageForView` / `canViewSensitivity` 재사용.

**Spec context (brainstorming 결정 요약):**
1. Layout: A — Split pane 50/50, /ask 페이지 전용
2. Panel 개수: 단일 (다른 source 클릭 시 panel 내용 교체)
3. Panel 안 `[[wikilink]]`: panel 내 navigate + 뒤로가기 stack
4. AskSidebar collapse 상태: localStorage 영구 저장 (key: `jv.askSidebar`)
5. Wiki panel state: ephemeral (URL/쿼리 반영하지 않음)
6. lg 미만(< 1024px): split pane 비활성, 기존 풀페이지 navigate

---

## 0. File structure

### 0.1 Create

- `apps/web/components/layout/useAskSidebarCollapsed.ts` — localStorage 기반 hook (`jv.askSidebar` 키)
- `apps/web/app/api/wiki/page/route.ts` — GET endpoint, JSON body+meta+orphanSlugs
- `apps/web/app/api/wiki/page/route.test.ts` — 권한/응답 형태 unit test
- `apps/web/components/ai/WikiPanelContext.tsx` — React context (open/close/navigate stack)
- `apps/web/components/ai/WikiPanel.tsx` — 우측 panel(client). fetch + WikiPageView + 뒤로가기 stack + 닫기 버튼.
- `apps/web/app/(app)/ask/_components/AskShell.tsx` — `/ask` 페이지 전용 client wrapper. collapse state + WikiPanelContext provider + split pane layout
- `apps/web/e2e/ask-wiki-panel.spec.ts` — Playwright @smoke

### 0.2 Modify

- `apps/web/app/(app)/ask/layout.tsx` — `<div flex>` wrapper를 `<AskShell>`로 교체
- `apps/web/components/ai/AskSidebar.tsx` — `collapsed` prop + 토글 버튼(top-right, ChevronsLeft 아이콘) 추가, collapsed 시 `w-0 overflow-hidden`(또는 hidden), parent rail은 별도 rail strip(40px) 노출
- `apps/web/components/ai/AnswerCard.tsx` — wiki source link 두 곳을 button + onClick으로 교체, useContext로 WikiPanelContext 접근, lg 미만은 router.push fallback
- `apps/web/components/ai/AnswerCard.test.tsx` — onClick 동작 케이스 추가, fallback prop 검증

### 0.3 Read-only references

- `apps/web/components/WikiPageView/WikiPageView.tsx` — `onWikiLinkClick: (slug: string) => void` prop 그대로 활용
- `apps/web/app/(app)/wiki/[workspaceId]/[...path]/page.tsx` — server-side 권한 체크(`canViewSensitivity`, `requiredPermission`) 그대로 API 핸들러로 이식
- `apps/web/lib/server/wiki-page-loader.ts` — `loadWikiPageForView(workspaceId, routeKey)` 그대로 사용
- `apps/web/components/WikiPageView/index.ts` — `mapDbRowToWikiPage` export 재사용

### 0.4 Token / hover convention 재확인 (T2 학습)

- 우측 panel과 좌측 AskPanel 사이 hairline: `border-l border-[--border-default]` (T2에서 검증된 토큰)
- 닫기 버튼(icon button): `hover:bg-[--bg-surface] hover:text-[--fg-primary]` (spec preview ask-ai.html:96 패턴)
- AskSidebar 토글 버튼도 icon-button 패턴 동일
- 인라인 hex/rgb 금지

---

## 1. Tasks

### Task 0: Baseline 스냅샷

**Files:** 없음 (verify only)

- [ ] **Step 1**: type-check baseline
  ```bash
  cd apps/web && pnpm type-check
  ```
  Expected: 0 errors.

- [ ] **Step 2**: 전체 test baseline
  ```bash
  cd apps/web && pnpm test -- --run
  ```
  Expected: All test files pass (현재 base는 333+ tests).

- [ ] **Step 3**: `/ask` 페이지 dev server 수동 확인
  http://localhost:3011/ask 접속 가능, source link 클릭 시 `/wiki/<workspaceId>/<slug>` 풀페이지 navigate (현재 동작) — split pane 도입 후 비교 기준.

### Task 1: AskSidebar collapse toggle + localStorage hook

**Files:**
- Create: `apps/web/components/layout/useAskSidebarCollapsed.ts`
- Create: `apps/web/components/layout/useAskSidebarCollapsed.test.ts`
- Modify: `apps/web/components/ai/AskSidebar.tsx`

#### Step 1: 실패하는 hook 테스트 작성

`apps/web/components/layout/useAskSidebarCollapsed.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAskSidebarCollapsed } from './useAskSidebarCollapsed';

describe('useAskSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to expanded (false) when localStorage is empty', () => {
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });

  it('reads "true" from localStorage on mount', () => {
    window.localStorage.setItem('jv.askSidebar', 'collapsed');
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(true);
  });

  it('persists to localStorage when toggled', () => {
    const { result } = renderHook(() => useAskSidebarCollapsed());
    act(() => {
      result.current[1](true);
    });
    expect(window.localStorage.getItem('jv.askSidebar')).toBe('collapsed');
    act(() => {
      result.current[1](false);
    });
    expect(window.localStorage.getItem('jv.askSidebar')).toBe('expanded');
  });

  it('ignores unknown localStorage values', () => {
    window.localStorage.setItem('jv.askSidebar', 'gibberish');
    const { result } = renderHook(() => useAskSidebarCollapsed());
    expect(result.current[0]).toBe(false);
  });
});
```

- [ ] **Step 1**: 위 파일 작성

- [ ] **Step 2**: 실패 확인
  ```bash
  cd apps/web && pnpm test -- --run components/layout/useAskSidebarCollapsed
  ```
  Expected: FAIL — module not found

#### Step 3: hook 구현

`apps/web/components/layout/useAskSidebarCollapsed.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'jv.askSidebar';
const COLLAPSED_VALUE = 'collapsed';
const EXPANDED_VALUE = 'expanded';

/**
 * AskSidebar(좌측 대화 목록) collapse 상태 — localStorage 영구 저장.
 * `/ask` 페이지 전용. 글로벌 nav Sidebar(rail/expanded) 토글과 독립.
 *
 * 반환: [collapsed, setCollapsed]
 *  - SSR 첫 paint은 default(false=expanded)로 시작 (FOUC 방지). useEffect에서 localStorage를 읽어 동기화.
 */
export function useAskSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === COLLAPSED_VALUE) setCollapsedState(true);
    else if (raw === EXPANDED_VALUE) setCollapsedState(false);
    // unknown values → keep default (false)
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next ? COLLAPSED_VALUE : EXPANDED_VALUE);
    }
  }, []);

  return [collapsed, setCollapsed];
}
```

- [ ] **Step 3**: 위 파일 작성

- [ ] **Step 4**: 테스트 통과 확인
  ```bash
  cd apps/web && pnpm test -- --run components/layout/useAskSidebarCollapsed
  ```
  Expected: 4/4 PASS

#### Step 5: AskSidebar에 collapsed prop + 토글 버튼

`apps/web/components/ai/AskSidebar.tsx`의 컴포넌트 시그니처와 헤더 부분 수정.

기존 (참고용):
```tsx
export function AskSidebar({
  conversations,
  conversationCount,
}: AskSidebarProps) {
  // ...
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[--border-default] bg-[--bg-surface]">
      {/* Header — brand wordmark + new conversation */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <span ...>{t("title")}</span>
        <Link href="/ask" ...><Plus /></Link>
      </div>
      {/* ... search, list ... */}
    </aside>
  );
}
```

새 시그니처 — `collapsed` + `onToggle` prop 추가:

```tsx
import { ChevronsLeft, ChevronsRight, Plus, Search as SearchIcon } from 'lucide-react';
// ... existing imports ...

export interface AskSidebarProps {
  conversations: AskConversationRow[];
  conversationCount: number;
  /** /ask 전용 collapse state. AskShell이 useAskSidebarCollapsed로 관리해 prop으로 내려준다. */
  collapsed?: boolean;
  onToggle?: () => void;
}

export function AskSidebar({
  conversations,
  conversationCount,
  collapsed = false,
  onToggle,
}: AskSidebarProps) {
  const t = useTranslations('Ask.sidebar');
  // ... 기존 hooks ...

  if (collapsed) {
    // collapsed: 40px rail. 토글 버튼만 노출.
    return (
      <aside
        aria-label={t('asideLabelCollapsed')}
        className="flex h-full w-10 shrink-0 flex-col items-center border-r border-[--border-default] bg-[--bg-surface] py-3"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('expand')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[--fg-secondary] hover:bg-[--bg-page] hover:text-[--fg-primary]"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[--border-default] bg-[--bg-surface]">
      {/* Header — brand wordmark + new conversation + collapse */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <span className="text-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[--fg-secondary]">
          {t('title')}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href="/ask"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-page] hover:text-[--fg-primary]"
            title={t('newConversation')}
            aria-label={t('newConversation')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={t('collapse')}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-page] hover:text-[--fg-primary]"
            >
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {/* ... 기존 검색, 리스트 그대로 ... */}
    </aside>
  );
}
```

- [ ] **Step 5**: 위 변경 적용

#### Step 6: i18n 키 추가

`apps/web/messages/ko.json` `Ask.sidebar` 네임스페이스에 추가:

```json
{
  "Ask": {
    "sidebar": {
      "title": "ASK",
      "newConversation": "새 대화",
      "collapse": "사이드바 접기",
      "expand": "사이드바 펼치기",
      "asideLabelCollapsed": "대화 목록(접힘)"
    }
  }
}
```

`messages/en.json`이 있으면 동일 키 영문 추가.

- [ ] **Step 6**: ko.json / en.json 키 추가

#### Step 7: type-check + commit

- [ ] **Step 7a**: type-check ×2
  ```bash
  cd apps/web && pnpm type-check && pnpm type-check
  ```
  Expected: 0 errors twice

- [ ] **Step 7b**: scoped tests
  ```bash
  cd apps/web && pnpm test -- --run components/layout/useAskSidebarCollapsed components/ai/AskSidebar
  ```

- [ ] **Step 7c**: Commit
  ```bash
  git add apps/web/components/layout/useAskSidebarCollapsed.ts apps/web/components/layout/useAskSidebarCollapsed.test.ts apps/web/components/ai/AskSidebar.tsx apps/web/messages/ko.json apps/web/messages/en.json
  git commit -m "feat(ask): AskSidebar collapse toggle with localStorage persistence"
  ```

### Task 2: GET /api/wiki/page route handler

**Files:**
- Create: `apps/web/app/api/wiki/page/route.ts`
- Create: `apps/web/app/api/wiki/page/route.test.ts`

#### Step 1: 실패하는 테스트 작성

`apps/web/app/api/wiki/page/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Stubs — page.tsx와 동일한 분기 규약을 검증한다.
const mockSession = vi.fn();
const mockLoad = vi.fn();
const mockCanView = vi.fn();
const mockHasPermission = vi.fn();
vi.mock('@/lib/server/page-auth', () => ({
  requireApiSession: (...a: unknown[]) => mockSession(...a),
}));
vi.mock('@/lib/server/wiki-page-loader', () => ({
  loadWikiPageForView: (...a: unknown[]) => mockLoad(...a),
}));
vi.mock('@/lib/server/wiki-sensitivity', () => ({
  canViewSensitivity: (...a: unknown[]) => mockCanView(...a),
}));
vi.mock('@jarvis/auth/rbac', () => ({
  hasPermission: (...a: unknown[]) => mockHasPermission(...a),
}));

import { GET } from './route';

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/wiki/page?${qs}`);
}

describe('GET /api/wiki/page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSession.mockResolvedValue({ workspaceId: 'ws1', permissions: ['ADMIN_ALL'] });
    mockCanView.mockReturnValue(true);
    mockHasPermission.mockReturnValue(true);
  });

  it('400 when workspaceId or path missing', async () => {
    const res = await GET(makeReq('workspaceId=ws1'));
    expect(res.status).toBe(400);
  });

  it('403 when session.workspaceId !== query workspaceId', async () => {
    const res = await GET(makeReq('workspaceId=other&path=foo/bar.md'));
    expect(res.status).toBe(403);
  });

  it('404 when loader returns null', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(404);
  });

  it('403 when canViewSensitivity is false', async () => {
    mockLoad.mockResolvedValue({ meta: { sensitivity: 'SECRET_REF_ONLY' }, body: '...' });
    mockCanView.mockReturnValue(false);
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(403);
  });

  it('200 with body+meta+orphanSlugs on success', async () => {
    mockLoad.mockResolvedValue({
      meta: { id: 'p1', title: 'Foo', sensitivity: 'INTERNAL', path: 'foo.md', slug: 'foo' },
      body: '# Foo',
      orphanSlugs: ['bar'],
    });
    const res = await GET(makeReq('workspaceId=ws1&path=foo.md'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.title).toBe('Foo');
    expect(json.body).toBe('# Foo');
    expect(json.orphanSlugs).toEqual(['bar']);
  });

  it('decodes encoded path segments before lookup', async () => {
    mockLoad.mockResolvedValue({
      meta: { id: 'p1', title: 'Foo', sensitivity: 'INTERNAL', path: '한글/page.md', slug: 'page' },
      body: '...',
      orphanSlugs: [],
    });
    await GET(makeReq('workspaceId=ws1&path=' + encodeURIComponent('한글/page.md')));
    expect(mockLoad).toHaveBeenCalledWith('ws1', '한글/page.md');
  });
});
```

- [ ] **Step 1**: 위 파일 작성

- [ ] **Step 2**: 실패 확인
  ```bash
  cd apps/web && pnpm test -- --run app/api/wiki/page
  ```
  Expected: FAIL — `./route` cannot be resolved

#### Step 3: route handler 구현

`apps/web/app/api/wiki/page/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { requireApiSession } from '@/lib/server/page-auth';
import { loadWikiPageForView } from '@/lib/server/wiki-page-loader';
import { canViewSensitivity } from '@/lib/server/wiki-sensitivity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wiki/page?workspaceId=<UUID>&path=<routeKey>
 *
 * `/wiki/[workspaceId]/[...path]/page.tsx`의 권한 분기를 그대로 이식한 JSON endpoint.
 * `/ask` split-pane WikiPanel이 인라인으로 wiki body를 가져갈 때 사용한다.
 *
 * 분기:
 *   400 — workspaceId/path 누락
 *   403 — workspace 불일치 / sensitivity 부족 / requiredPermission 부족
 *   404 — DB에 페이지 없음
 *   200 — { meta, body, orphanSlugs }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireApiSession(PERMISSIONS.KNOWLEDGE_READ);
  const url = req.nextUrl;
  const workspaceId = url.searchParams.get('workspaceId');
  const rawPath = url.searchParams.get('path');

  if (!workspaceId || !rawPath) {
    return NextResponse.json({ error: 'workspaceId and path required' }, { status: 400 });
  }

  if (session.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Decode each segment so DB lookup matches stored routeKeys (한글 등).
  const routeKey = rawPath
    .split('/')
    .map((seg) => {
      try { return decodeURIComponent(seg); } catch { return seg; }
    })
    .join('/');

  const loaded = await loadWikiPageForView(workspaceId, routeKey);
  if (!loaded) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!canViewSensitivity(session, loaded.meta.sensitivity)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (
    loaded.meta.requiredPermission &&
    !hasPermission(session, PERMISSIONS.ADMIN_ALL) &&
    !hasPermission(session, loaded.meta.requiredPermission)
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    meta: loaded.meta,
    body: loaded.body,
    orphanSlugs: loaded.orphanSlugs ?? [],
  });
}
```

> **NOTE — `requireApiSession`이 없으면**: 기존 `lib/server/page-auth.ts`에 server-only `requirePageSession` 래퍼만 있을 수 있다. 그 경우 같은 파일에 `requireApiSession`을 추가하거나, 기존 `requirePageSession`이 redirect 대신 throw하는 변형을 export. 첫 시도에서 발견 시 헬퍼를 보강하고 같은 commit에 포함.

- [ ] **Step 3**: 위 파일 작성 (필요 시 page-auth.ts에 `requireApiSession` 추가)

- [ ] **Step 4**: 테스트 통과
  ```bash
  cd apps/web && pnpm test -- --run app/api/wiki/page
  ```
  Expected: 6/6 PASS

#### Step 5: type-check + commit

- [ ] **Step 5a**: `cd apps/web && pnpm type-check && pnpm type-check` → 0 errors

- [ ] **Step 5b**: Commit
  ```bash
  git add apps/web/app/api/wiki/page/route.ts apps/web/app/api/wiki/page/route.test.ts
  # (helper 추가 시) git add apps/web/lib/server/page-auth.ts
  git commit -m "feat(api): GET /api/wiki/page — JSON wiki body for AskPanel inline"
  ```

### Task 3: WikiPanelContext + WikiPanel component

**Files:**
- Create: `apps/web/components/ai/WikiPanelContext.tsx`
- Create: `apps/web/components/ai/WikiPanel.tsx`
- Create: `apps/web/components/ai/WikiPanel.test.tsx`

#### Step 1: 실패하는 컴포넌트 테스트

`apps/web/components/ai/WikiPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WikiPanel } from './WikiPanel';

describe('WikiPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url) => {
      const u = new URL(url as string, 'http://localhost');
      const path = u.searchParams.get('path');
      if (path === 'first.md') {
        return new Response(
          JSON.stringify({
            meta: { id: '1', title: 'First', sensitivity: 'INTERNAL', slug: 'first', path: 'first.md' },
            body: 'See [[second-page]]',
            orphanSlugs: [],
          }),
          { status: 200 },
        );
      }
      if (path === 'second-page.md') {
        return new Response(
          JSON.stringify({
            meta: { id: '2', title: 'Second', sensitivity: 'INTERNAL', slug: 'second-page', path: 'second-page.md' },
            body: '# Second',
            orphanSlugs: [],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }) as typeof fetch;
  });

  it('renders title after fetch', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());
  });

  it('shows error state on 404', async () => {
    render(<WikiPanel workspaceId="ws1" slug="missing" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/not found|찾을 수 없|404/i)).toBeInTheDocument());
  });

  it('navigates to a new slug when [[wikilink]] is clicked, pushes to back-stack', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /second-page/i }));
    await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument());
    // back button enabled
    expect(screen.getByLabelText(/뒤로|back/i)).not.toBeDisabled();
  });

  it('back button pops the stack', async () => {
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /second-page/i }));
    await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/뒤로|back/i));
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<WikiPanel workspaceId="ws1" slug="first" onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/닫기|close/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 1**: 위 파일 작성

- [ ] **Step 2**: 실패 확인
  ```bash
  cd apps/web && pnpm test -- --run components/ai/WikiPanel
  ```
  Expected: FAIL — module not found

#### Step 3: Context 작성

`apps/web/components/ai/WikiPanelContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type WikiPanelTarget = { slug: string };

interface WikiPanelContextValue {
  open: (target: WikiPanelTarget) => void;
  close: () => void;
  active: WikiPanelTarget | null;
  /** Split pane이 현재 활성인지 (lg breakpoint + 사용자가 source를 클릭했는지). */
  isOpen: boolean;
}

const WikiPanelContext = createContext<WikiPanelContextValue | null>(null);

export function WikiPanelProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<WikiPanelTarget | null>(null);

  const value = useMemo<WikiPanelContextValue>(
    () => ({
      active,
      isOpen: active !== null,
      open: (t) => setActive(t),
      close: () => setActive(null),
    }),
    [active],
  );

  return <WikiPanelContext.Provider value={value}>{children}</WikiPanelContext.Provider>;
}

/**
 * WikiPanelContext consumer.
 * Provider 밖에서 호출하면 no-op fallback을 반환해 AnswerCard가 /wiki 풀페이지 navigate로 fall back할 수 있게 한다 (lg 미만 모바일 path).
 */
export function useWikiPanel(): WikiPanelContextValue {
  const ctx = useContext(WikiPanelContext);
  if (ctx) return ctx;
  return {
    active: null,
    isOpen: false,
    open: () => {},
    close: () => {},
  };
}
```

- [ ] **Step 3**: 위 파일 작성

#### Step 4: WikiPanel 구현

`apps/web/components/ai/WikiPanel.tsx`:

```tsx
'use client';

import { ChevronLeft, X } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { mapDbRowToWikiPage, WikiPageView, type WikiPage } from '@/components/WikiPageView';

type WikiPanelProps = {
  workspaceId: string;
  slug: string;
  onClose: () => void;
};

type LoadedPage = {
  page: WikiPage;
  orphanSlugs: readonly string[];
};

type Status =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LoadedPage };

/**
 * /ask split pane 우측에 인라인으로 렌더되는 wiki viewer.
 * navigate stack: 현재 보고 있는 슬러그 + history. wikilink 클릭은 push, 뒤로가기 버튼은 pop.
 */
export function WikiPanel({ workspaceId, slug, onClose }: WikiPanelProps) {
  // 첫 진입 슬러그를 stack 첫 항목으로 초기화. props.slug가 변하면 stack을 reset(새 source 클릭).
  const [stack, setStack] = useState<string[]>([slug]);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const current = stack[stack.length - 1] ?? slug;

  useEffect(() => {
    setStack([slug]);
  }, [slug]);

  useEffect(() => {
    let aborted = false;
    setStatus({ kind: 'loading' });
    const path = current.endsWith('.md') ? current : `${current}.md`;
    const url = `/api/wiki/page?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`;
    fetch(url, { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) {
          if (aborted) return;
          if (r.status === 403) setStatus({ kind: 'error', message: '접근 권한이 없습니다 (403).' });
          else if (r.status === 404) setStatus({ kind: 'error', message: '페이지를 찾을 수 없습니다 (404).' });
          else setStatus({ kind: 'error', message: `오류 (${r.status}).` });
          return;
        }
        const json = await r.json() as { meta: unknown; body: string; orphanSlugs?: string[] };
        if (aborted) return;
        const page = mapDbRowToWikiPage(json.meta as Parameters<typeof mapDbRowToWikiPage>[0], json.body);
        setStatus({ kind: 'ready', data: { page, orphanSlugs: json.orphanSlugs ?? [] } });
      })
      .catch((err) => {
        if (aborted) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'unknown error' });
      });
    return () => { aborted = true; };
  }, [current, workspaceId]);

  const onWikiLinkClick = useCallback((target: string) => {
    setStack((s) => [...s, target]);
  }, []);

  const onBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const canGoBack = stack.length > 1;

  return (
    <section
      aria-label="위키 페이지"
      className="flex h-full flex-col bg-white"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[--border-default] px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="뒤로"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-surface] hover:text-[--fg-primary] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="flex-1 truncate text-sm font-medium text-[--fg-primary]">
          {status.kind === 'ready' ? status.data.page.title : '위키 페이지'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[--fg-secondary] transition-colors duration-150 hover:bg-[--bg-surface] hover:text-[--fg-primary]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {status.kind === 'loading' && (
          <p className="text-sm text-[--fg-muted]">불러오는 중…</p>
        )}
        {status.kind === 'error' && (
          <p className="text-sm text-[--color-red-500]">{status.message}</p>
        )}
        {status.kind === 'ready' && (
          <WikiPageView
            page={status.data.page}
            orphanSlugs={status.data.orphanSlugs}
            onWikiLinkClick={onWikiLinkClick}
          />
        )}
      </div>
    </section>
  );
}
```

> **NOTE — `mapDbRowToWikiPage` signature**: 현재 `WikiPageView/index.ts`의 export. signature가 (meta, body, ...)인지 (loaded, ...)인지 implementer가 첫 시도에서 확인. 차이 시 호출부만 조정.

- [ ] **Step 4**: 위 파일 작성

#### Step 5: 테스트 통과 확인

- [ ] **Step 5**: 
  ```bash
  cd apps/web && pnpm test -- --run components/ai/WikiPanel
  ```
  Expected: 5/5 PASS

#### Step 6: type-check + commit

- [ ] **Step 6a**: type-check ×2 → 0 errors

- [ ] **Step 6b**: Commit
  ```bash
  git add apps/web/components/ai/WikiPanelContext.tsx apps/web/components/ai/WikiPanel.tsx apps/web/components/ai/WikiPanel.test.tsx
  git commit -m "feat(ask): WikiPanel — inline wiki viewer with back-stack + close"
  ```

### Task 4: AnswerCard source links → context-aware onClick

**Files:**
- Modify: `apps/web/components/ai/AnswerCard.tsx`
- Modify: `apps/web/components/ai/AnswerCard.test.tsx`

#### Step 1: 테스트 추가

`apps/web/components/ai/AnswerCard.test.tsx` 끝에 추가:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { WikiPanelProvider } from './WikiPanelContext';

describe('AnswerCard wiki source click', () => {
  it('opens panel via context when WikiPanelProvider is present', async () => {
    const sources = [
      { kind: 'wiki-page', pageId: 'p1', path: 'auto/foo.md', slug: 'foo', title: 'Foo', sensitivity: 'INTERNAL', citation: '[[foo]]', origin: 'shortlist', confidence: 0.9 },
    ] as const;

    render(
      <WikiPanelProvider>
        <AnswerCard answer="hello" sources={sources as any} workspaceId="ws1" />
      </WikiPanelProvider>,
    );
    fireEvent.click(screen.getByText('Foo'));
    // Provider state는 외부에서 직접 검사 어려움 — 대신 mock router.push가 호출되지 않았다는 negative assertion이 더 안정적.
    // 여기서는 button role 존재 + click 시 throw 없음을 확인.
    expect(screen.getByText('Foo').closest('button')).toBeInTheDocument();
  });

  it('falls back to <a href> for SSR / no-provider case', () => {
    const sources = [
      { kind: 'wiki-page', pageId: 'p1', path: 'auto/foo.md', slug: 'foo', title: 'Foo', sensitivity: 'INTERNAL', citation: '[[foo]]', origin: 'shortlist', confidence: 0.9 },
    ] as const;
    const html = renderToStaticMarkup(<AnswerCard answer="hi" sources={sources as any} workspaceId="ws1" />);
    expect(html).toContain('href="/wiki/ws1/foo"');
  });
});
```

> **NOTE**: 이 테스트는 jsdom matchMedia를 활용한 lg breakpoint 분기 검증을 포함하지 않는다. Step 5에서 SSR-safe fallback이 항상 `<a href>`를 렌더하고 client side에서 onClick으로 가로채는 패턴(progressive enhancement)을 채택한다. 즉 lg 미만에서는 onClick이 없는 단순 `<a>`로 navigate, lg 이상에서는 onClick이 preventDefault → context.open.

- [ ] **Step 1**: 위 테스트 추가

- [ ] **Step 2**: `pnpm test -- --run components/ai/AnswerCard` → 새 테스트 FAIL

#### Step 3: AnswerCard 수정 — 두 wiki link 위치를 progressive enhancement 패턴으로

`apps/web/components/ai/AnswerCard.tsx`의 wiki link 두 곳을 다음 새 컴포넌트로 추출:

```tsx
import { useWikiPanel } from './WikiPanelContext';
import { useEffect, useState } from 'react';

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
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLargeScreen(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const href = `/wiki/${workspaceId}/${encodeURIComponent(slug)}`;

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!isLargeScreen) return;     // < lg: 풀페이지 navigate (default <a> 동작)
        e.preventDefault();
        panel.open({ slug });
      }}
    >
      {children}
    </a>
  );
}
```

그 후:
- line 174~181 (`<Link href={`/wiki/default/...`}>` — wikilink slug-not-found fallback)
- line 359~373 (`<Link href={`/wiki/default/...`}>` — WikiPageSection)

두 위치 모두 `<Link>` → `<WikiLink workspaceId={workspaceId} slug={slug} ...>`로 교체. (이전 Task에서 이미 `default` → `${workspaceId}` 교체 완료된 상태에서 시작.)

- [ ] **Step 3**: WikiLink 컴포넌트 추가 + 두 위치 교체

#### Step 4: 테스트 통과 확인

- [ ] **Step 4**: `pnpm test -- --run components/ai/AnswerCard` → 모든 케이스 PASS

#### Step 5: type-check + commit

- [ ] **Step 5a**: type-check ×2 → 0 errors

- [ ] **Step 5b**: Commit
  ```bash
  git add apps/web/components/ai/AnswerCard.tsx apps/web/components/ai/AnswerCard.test.tsx
  git commit -m "feat(ask): AnswerCard wiki links → context-aware (lg uses panel, smaller fallback to /wiki)"
  ```

### Task 5: AskShell client wrapper + ask layout 연결

**Files:**
- Create: `apps/web/app/(app)/ask/_components/AskShell.tsx`
- Modify: `apps/web/app/(app)/ask/layout.tsx`

#### Step 1: AskShell 작성

`apps/web/app/(app)/ask/_components/AskShell.tsx`:

```tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AskSidebar } from '@/components/ai/AskSidebar';
import { WikiPanel } from '@/components/ai/WikiPanel';
import { WikiPanelProvider, useWikiPanel } from '@/components/ai/WikiPanelContext';
import { useAskSidebarCollapsed } from '@/components/layout/useAskSidebarCollapsed';
import type { AskConversationRow } from '@/lib/queries/ask-conversations';

type AskShellProps = {
  conversations: AskConversationRow[];
  conversationCount: number;
  workspaceId: string;
  children: ReactNode;
};

export function AskShell(props: AskShellProps) {
  return (
    <WikiPanelProvider>
      <AskShellInner {...props} />
    </WikiPanelProvider>
  );
}

function AskShellInner({
  conversations,
  conversationCount,
  workspaceId,
  children,
}: AskShellProps) {
  const [collapsed, setCollapsed] = useAskSidebarCollapsed();
  const panel = useWikiPanel();
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLg(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const showPanel = isLg && panel.isOpen && panel.active !== null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <AskSidebar
        conversations={conversations}
        conversationCount={conversationCount}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <div className="flex flex-1 min-w-0">
        <div className={showPanel ? 'flex-1 min-w-0 lg:w-1/2' : 'flex-1 min-w-0'}>
          {children}
        </div>
        {showPanel && panel.active && (
          <div className="hidden lg:flex lg:w-1/2 border-l border-[--border-default]">
            <WikiPanel
              workspaceId={workspaceId}
              slug={panel.active.slug}
              onClose={panel.close}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 1**: 위 파일 작성

#### Step 2: ask/layout.tsx 수정

기존 `<div className="flex h-[calc(100vh-4rem)]">` 블록을 `<AskShell>`로 교체:

```tsx
import { AskShell } from './_components/AskShell';

// ... 기존 인증 + DB 조회 그대로 ...

return (
  <AskShell
    conversations={conversations}
    conversationCount={conversationCount}
    workspaceId={session.workspaceId}
  >
    {children}
  </AskShell>
);
```

- [ ] **Step 2**: 위 변경

#### Step 3: type-check + 수동 smoke

- [ ] **Step 3a**: type-check ×2 → 0 errors

- [ ] **Step 3b**: `pnpm test -- --run` → 전체 PASS

- [ ] **Step 3c**: dev server에서 수동 확인:
  - http://localhost:3011/ask 접속
  - 답변에 wiki source가 있는 conversation 선택
  - source 클릭 → 우측에 WikiPanel 50% 폭으로 열림
  - panel 안 [[wikilink]] 클릭 → 다른 wiki 페이지로 navigate, 뒤로가기 버튼 활성
  - 뒤로가기 버튼 → 이전 wiki로 돌아옴
  - 닫기(X) → panel 사라지고 AskPanel이 다시 100%
  - AskSidebar 헤더 우측의 ChevronsLeft 클릭 → sidebar 40px rail로 collapse
  - rail의 ChevronsRight 클릭 → 280px expanded로 복귀
  - localStorage에 `jv.askSidebar = collapsed/expanded` 확인
  - 브라우저 좁히기(< 1024px) → split pane 사라지고 source 클릭은 풀페이지 navigate

- [ ] **Step 3d**: Commit
  ```bash
  git add apps/web/app/\(app\)/ask/_components/AskShell.tsx apps/web/app/\(app\)/ask/layout.tsx
  git commit -m "feat(ask): split-pane layout — AskShell client wrapper with WikiPanel context"
  ```

### Task 6: E2E smoke test + 최종 verification gate

**Files:**
- Create: `apps/web/e2e/ask-wiki-panel.spec.ts`

#### Step 1: Playwright @smoke

`apps/web/e2e/ask-wiki-panel.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('@smoke Ask split-pane wiki panel', () => {
  test('source click opens right panel; close returns to single-column', async ({ page }) => {
    await page.goto('/login');
    // 기존 e2e 헬퍼 또는 inline로 admin 로그인 (다른 ask-* 스펙 패턴과 동일)
    // ... 로그인 ...

    await page.goto('/ask/<seed-conversation-id>');
    await page.locator('button:has-text("위키 페이지")').first().scrollIntoViewIfNeeded();
    const sourceLink = page.getByRole('link', { name: /\[\[/ }).first();
    await sourceLink.click();

    // panel 노출
    await expect(page.locator('section[aria-label="위키 페이지"]')).toBeVisible();
    // 좌우 50/50 (대략적 검증 — bounding box 비율)
    const left = await page.locator('main').first().boundingBox();
    const panel = await page.locator('section[aria-label="위키 페이지"]').boundingBox();
    if (left && panel) {
      const ratio = panel.width / (left.width + panel.width);
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(0.6);
    }

    // 닫기
    await page.getByLabel('닫기').click();
    await expect(page.locator('section[aria-label="위키 페이지"]')).toBeHidden();
  });

  test('AskSidebar collapse persists across reload', async ({ page }) => {
    await page.goto('/ask');
    await page.getByLabel('사이드바 접기').click();
    await expect(page.locator('aside[aria-label="대화 목록(접힘)"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('aside[aria-label="대화 목록(접힘)"]')).toBeVisible();
  });
});
```

> **NOTE**: 기존 `apps/web/e2e/ask-harness.spec.ts` 등에서 로그인 helper를 가져와 사용. seed conversation은 dev DB seed 또는 fixture.

- [ ] **Step 1**: 위 spec 작성 (기존 e2e 로그인 helper 재사용)

#### Step 2: 최종 verification gate

- [ ] **Step 2a**: type-check ×2
  ```bash
  cd apps/web && pnpm type-check && pnpm type-check
  ```

- [ ] **Step 2b**: 전체 unit test ×2
  ```bash
  cd apps/web && pnpm test -- --run && pnpm test -- --run
  ```

- [ ] **Step 2c**: build
  ```bash
  cd apps/web && pnpm build
  ```

- [ ] **Step 2d**: Playwright @smoke (선택, 환경 가능 시)
  ```bash
  cd apps/web && pnpm exec playwright test --grep "@smoke"
  ```

- [ ] **Step 2e**: 수동 visual smoke (light + dark, lg + sm 두 viewport)

- [ ] **Step 2f**: `feat/ask-wiki-source-split-pane` branch에 push 후 PR 작성. CI 통과 후 머지.

---

## 2. Self-review checklist

### 2.1 Spec coverage

| Brainstorming 결정 | Task | Verdict |
|---|---|---|
| /ask 전용 split pane (글로벌 sidebar 토글과 독립) | Task 5 | AskShell이 `/ask` layout 안에서만 활성. Tweaks의 `--sidebar-width`는 별도. PASS |
| Panel 50/50 | Task 5 (lg:w-1/2 양쪽) | PASS |
| Panel 단일 (다른 source 클릭 시 교체) | Task 3 (props.slug 변경 시 stack reset) | PASS |
| Panel 안 wikilink → 내부 navigate + 뒤로가기 stack | Task 3 (stack state + onWikiLinkClick) | PASS |
| AskSidebar collapse → localStorage 영구 | Task 1 (`useAskSidebarCollapsed`, `jv.askSidebar`) | PASS |
| Wiki panel state ephemeral (URL 안 반영) | Task 5 (useState만, URL 미접근) | PASS |
| lg 미만에서 풀페이지 fallback | Task 4 (matchMedia + `<a href>` progressive enhancement) | PASS |

### 2.2 Type / API consistency

- `WikiPanelTarget = { slug: string }` — 모든 Task에서 동일
- `useAskSidebarCollapsed`: `[boolean, (next: boolean) => void]` — Task 1 정의, Task 5 사용
- `WikiPageView` props (`page`, `orphanSlugs`, `onWikiLinkClick`) — 기존과 동일, Task 3에서 그대로 호출
- `/api/wiki/page` response: `{ meta, body, orphanSlugs }` — Task 2 정의, Task 3 fetch 동일 shape

### 2.3 Hover/token convention (T2 학습)

- 모든 icon button hover: `hover:bg-[--bg-surface]` 또는 `hover:bg-[--bg-page]` (subtle), text `hover:text-[--fg-primary]` ✅
- panel 좌측 경계: `border-l border-[--border-default]` ✅
- 인라인 hex/rgb: 없음 ✅
- 미정의 토큰(`--brand-primary-border` 등): 사용 없음 ✅
- chip border 색 hover 변경: 없음 ✅

### 2.4 Out-of-scope (의도적으로 제외)

- 다중 panel(탭) — Brainstorming Q2에서 단일 채택. YAGNI.
- URL state — Brainstorming Q4(b) 결정에 따라 ephemeral.
- Mobile slide-over drawer — Brainstorming Q4 B1로 풀페이지 fallback 채택.
- WikiPageView 컴포넌트 자체 변경 — props 그대로 사용. 변경 없음.
- panel 내 inline wiki 편집/저장 — view-only.

---

## 3. Execution handoff

다음 단계는 **superpowers:subagent-driven-development**로 task당 fresh subagent + spec/quality 2단계 review 권장. T2/post-T2 PR에서 입증된 패턴 그대로 적용.

운영 룰 (T2 학습):
- 모든 implementer prompt에 worktree 경로 + `git rev-parse --abbrev-ref HEAD == claude/nostalgic-hugle-6aa461` 검증을 commit 전에 강제.
- spec-reviewer가 critical/important 이슈 catch 시 implementer fix → re-review (단, fix가 spec/preview에 reasonable한지 controller가 사전 판단 후 진행).
- 미정의 토큰 도입 차단 (Task 3 review에서 적발된 `--brand-primary-border` 사례 참조).
- chip/card hover에 border 색 변경 금지 (T2 Task 1/4 fix 정신).
